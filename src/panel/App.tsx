import { useEffect, useState } from "react";
import { cropVisibleImage } from "../core/image-crop";
import {
  pageContextSchema,
  type ExtensionRequest,
  type ExtensionResponse,
  type ImageAuditItem,
  type MediaAuditItem,
  type PageContext,
} from "../core/messages";
import {
  getEnglishVoices,
  speakEnglish,
  stopSpeaking,
  type VoiceOption,
} from "../core/tts";
import {
  describeImage,
  prepareImageDescriptionModel,
  runTextProbe,
  type ImageDescriptionResult,
  type InferencePreference,
} from "../firebase/ai";
import "./styles.css";

interface GeneratedDescription extends ImageDescriptionResult {
  previewDataUrl: string;
  applied: boolean;
}

const sendExtensionRequest = async (
  request: ExtensionRequest,
): Promise<ExtensionResponse> => chrome.runtime.sendMessage(request) as Promise<ExtensionResponse>;

const getPageContextFromResponse = (response: ExtensionResponse): PageContext => {
  if (!response.ok) throw new Error(response.error);
  if (!("data" in response)) throw new Error("No page context returned.");

  const parsed = pageContextSchema.safeParse(response.data);
  if (!parsed.success) throw new Error("Clariway received an invalid page context.");
  return parsed.data;
};

const getActivePageContext = async (): Promise<PageContext> =>
  getPageContextFromResponse(
    await sendExtensionRequest({ type: "GET_ACTIVE_PAGE_CONTEXT" }),
  );

const captureVisibleTab = async (): Promise<string> => {
  const response = await sendExtensionRequest({ type: "CAPTURE_VISIBLE_TAB" });
  if (!response.ok) throw new Error(response.error);
  if (!("data" in response) || !("kind" in response.data) || response.data.kind !== "visible-tab-capture") {
    throw new Error("No visible-tab capture returned.");
  }
  return response.data.dataUrl;
};

const isVisible = (item: ImageAuditItem, viewport: PageContext["viewport"]): boolean => {
  const right = Math.min(viewport.width, item.rect.x + item.rect.width);
  const bottom = Math.min(viewport.height, item.rect.y + item.rect.height);
  return right - Math.max(0, item.rect.x) >= 16 && bottom - Math.max(0, item.rect.y) >= 16;
};

const formatSource = (source: string): string => source.replaceAll("_", " ").toLowerCase();

export function App() {
  const [context, setContext] = useState<PageContext | null>(null);
  const [status, setStatus] = useState("Ready to inspect a page.");
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [busyImageId, setBusyImageId] = useState<string | null>(null);
  const [isBatching, setIsBatching] = useState(false);
  const [descriptions, setDescriptions] = useState<Record<string, GeneratedDescription>>({});

  useEffect(() => {
    void getEnglishVoices()
      .then((availableVoices) => {
        setVoices(availableVoices);
        setVoiceName(availableVoices[0]?.voiceName ?? "");
      })
      .catch(() => setStatus("No English text-to-speech voice is available."));
  }, []);

  const inspectPage = async () => {
    setStatus("Reading the current page");
    try {
      const pageContext = await getActivePageContext();
      setContext(pageContext);
      setDescriptions({});
      setStatus("Page context ready");
    } catch (error: unknown) {
      setContext(null);
      setStatus(error instanceof Error ? error.message : "Unable to read this page.");
    }
  };

  const generateForItem = async (
    page: PageContext,
    item: ImageAuditItem,
    screenshot: string,
  ): Promise<void> => {
    const imageDataUrl = await cropVisibleImage(screenshot, item, page.viewport);
    const result = await describeImage({ page, image: item, imageDataUrl });
    setDescriptions((current) => ({
      ...current,
      [item.id]: { ...result, previewDataUrl: imageDataUrl, applied: false },
    }));
  };

  const describeOne = async (staleItem: ImageAuditItem) => {
    // Must start synchronously in the click handler for Chrome's user-activation requirement.
    const preparation = prepareImageDescriptionModel((progress) => {
      setStatus(`Downloading local model: ${Math.round(progress * 100)}%`);
    });
    setBusyImageId(staleItem.id);
    setStatus("Refreshing page geometry and capturing the visible image");

    try {
      const page = await getActivePageContext();
      setContext(page);
      const item = page.imageAudit.items.find(
        (candidate) => candidate.id === staleItem.id && candidate.source === staleItem.source,
      );
      if (!item) throw new Error("The page changed. Audit it again.");
      if (!isVisible(item, page.viewport)) {
        throw new Error("Scroll the image into view, then try again.");
      }

      const screenshot = await captureVisibleTab();
      const device = await preparation;
      setStatus(device.deviceReady ? "Generating on device" : "Local AI unavailable; using cloud fallback");
      await generateForItem(page, item, screenshot);
      setStatus("Description ready for review");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Image description failed.");
    } finally {
      setBusyImageId(null);
    }
  };

  const describeVisibleMissing = async () => {
    const preparation = prepareImageDescriptionModel((progress) => {
      setStatus(`Downloading local model: ${Math.round(progress * 100)}%`);
    });
    setIsBatching(true);
    setStatus("Finding visible images without descriptions");

    try {
      const page = await getActivePageContext();
      setContext(page);
      const targets = page.imageAudit.items
        .filter((item) => item.state === "missing" && isVisible(item, page.viewport))
        .slice(0, 3);
      if (targets.length === 0) {
        throw new Error("No missing images are visible. Scroll the page and audit again.");
      }

      const screenshot = await captureVisibleTab();
      const device = await preparation;
      let completed = 0;
      const failures: string[] = [];

      for (const [index, item] of targets.entries()) {
        setBusyImageId(item.id);
        setStatus(
          `${device.deviceReady ? "On-device" : "Hybrid cloud fallback"}: image ${index + 1} of ${targets.length}`,
        );
        try {
          await generateForItem(page, item, screenshot);
          completed += 1;
        } catch (error: unknown) {
          failures.push(error instanceof Error ? error.message : `Image ${index + 1} failed.`);
        }
      }

      if (completed === 0) throw new Error(failures[0] ?? "No descriptions were generated.");
      setStatus(
        failures.length > 0
          ? `${completed} descriptions ready; ${failures.length} failed.`
          : `${completed} descriptions ready for review`,
      );
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Batch description failed.");
    } finally {
      setBusyImageId(null);
      setIsBatching(false);
    }
  };

  const mutateAlt = async (item: ImageAuditItem, restore: boolean) => {
    const description = descriptions[item.id];
    if (!description) return;
    setBusyImageId(item.id);
    setStatus(restore ? "Restoring original page markup" : "Applying preview to the current page");

    try {
      const response = await sendExtensionRequest(
        restore
          ? { type: "RESTORE_IMAGE_ALT", imageId: item.id, expectedSource: item.source }
          : {
              type: "APPLY_IMAGE_ALT",
              imageId: item.id,
              expectedSource: item.source,
              altText: description.altText,
            },
      );
      setContext(getPageContextFromResponse(response));
      setDescriptions((current) => ({
        ...current,
        [item.id]: { ...current[item.id], applied: !restore },
      }));
      setStatus(restore ? "Original alt text restored" : "Preview fix applied to this tab");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Could not update this image.");
    } finally {
      setBusyImageId(null);
    }
  };

  const startSpeech = async (text: string, activeStatus: string) => {
    try {
      await speakEnglish(text, voiceName || undefined, (event) => {
        if (["end", "cancelled", "interrupted", "error"].includes(event.type)) {
          setIsSpeaking(false);
        }
      });
      setIsSpeaking(true);
      setStatus(activeStatus);
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Speech could not start.");
    }
  };

  const speakSelection = async () => {
    const text = context?.selectedText;
    if (!text) {
      setStatus("Select English text on the page first.");
      return;
    }
    await startSpeech(text, "Speaking selected text");
  };

  const speakTranscript = async (item: MediaAuditItem) => {
    if (!item.transcript) {
      setStatus("This media exposes a text track, but its cues are not loaded yet.");
      return;
    }
    await startSpeech(item.transcript, "Speaking the available English transcript");
  };

  const stopSpeech = async () => {
    await stopSpeaking();
    setIsSpeaking(false);
    setStatus("Speech stopped");
  };

  const runProbe = async (preference: InferencePreference) => {
    setIsProbing(true);
    setStatus(preference === "on-device" ? "Preparing the on-device model" : "Requesting cloud inference");
    try {
      const result = await runTextProbe(preference, (progress) => {
        setStatus(`Downloading local model: ${Math.round(progress * 100)}%`);
      });
      setStatus(`AI ready via ${formatSource(result.source)}: ${result.text}`);
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "AI setup needs Firebase AI Logic and App Check.");
    } finally {
      setIsProbing(false);
    }
  };

  const renderImageState = (item: ImageAuditItem): string => {
    if (item.state === "missing") return "Missing text alternative";
    if (item.state === "ignored") return "Ignored by screen readers";
    return "Described";
  };

  const renderMediaState = (item: MediaAuditItem): string => {
    if (item.state === "captioned") return "Caption track available";
    if (item.state === "transcript") return "Transcript available";
    return "Missing captions or transcript";
  };

  const formatDuration = (duration: number | null): string | null => {
    if (duration === null) return null;
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const isBusy = isBatching || busyImageId !== null;

  return (
    <main>
      <header>
        <span className="eyebrow">Accessibility assistant</span>
        <h1>Clariway</h1>
        <p>Understand visual and spoken content using the context of the current page.</p>
      </header>

      <section aria-labelledby="actions-title">
        <h2 id="actions-title">Current page</h2>
        <div className="actions">
          <button type="button" disabled={isBusy} onClick={inspectPage}>Audit current page</button>
          <button type="button" className="secondary" onClick={speakSelection}>Speak selected English</button>
          {isSpeaking && <button type="button" className="secondary" onClick={stopSpeech}>Stop speaking</button>}
        </div>
      </section>

      {context && (
        <section aria-labelledby="context-title">
          <h2 id="context-title">Page accessibility report</h2>
          <dl>
            <div><dt>Page</dt><dd>{context.title}</dd></div>
            <div><dt>Images audited</dt><dd>{context.imageAudit.audited} of {context.imageAudit.total}</dd></div>
            <div><dt>Missing alt text</dt><dd>{context.imageAudit.missing}</dd></div>
            <div><dt>Ignored by screen readers</dt><dd>{context.imageAudit.ignored}</dd></div>
          </dl>

          {context.imageAudit.missing > 0 && (
            <div className="hybrid-action">
              <button type="button" disabled={isBusy} onClick={() => void describeVisibleMissing()}>
                Describe visible missing images (max 3)
              </button>
              <p className="hint">Runs on device when available, with Firebase cloud fallback. Review before applying.</p>
            </div>
          )}
          {context.imageAudit.total > 50 && <p className="hint">Showing the first 50 images for a fast local audit.</p>}

          {context.imageAudit.items.length > 0 && (
            <ul className="image-audit">
              {context.imageAudit.items.map((item) => {
                const generated = descriptions[item.id];
                return (
                  <li key={item.id} data-state={item.state}>
                    <strong>{renderImageState(item)}</strong>
                    <span className="existing-alt">{item.alt || "No alternative text"}</span>
                    {item.nearbyText && <small>{item.nearbyText}</small>}
                    {item.state === "missing" && !generated && (
                      <button
                        type="button"
                        className="small-button secondary"
                        disabled={isBusy}
                        onClick={() => void describeOne(item)}
                      >
                        {busyImageId === item.id ? "Describing…" : "Describe this image"}
                      </button>
                    )}
                    {generated && (
                      <div className="generated-description">
                        <img src={generated.previewDataUrl} alt={generated.altText} />
                        <div>
                          <span className="source-badge">{formatSource(generated.source)}</span>
                          <p>{generated.altText}</p>
                          <small>{generated.explanation}</small>
                        </div>
                        <button
                          type="button"
                          className="small-button"
                          disabled={isBusy}
                          onClick={() => void mutateAlt(item, generated.applied)}
                        >
                          {generated.applied ? "Undo preview fix" : "Apply preview fix"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {context.mediaAudit.total > 0 && (
            <div className="media-report" aria-labelledby="media-title">
              <h3 id="media-title">Audio and video accessibility</h3>
              <dl>
                <div><dt>Media audited</dt><dd>{context.mediaAudit.audited} of {context.mediaAudit.total}</dd></div>
                <div><dt>Missing text alternative</dt><dd>{context.mediaAudit.missing}</dd></div>
                <div><dt>Captioned or transcribed</dt><dd>{context.mediaAudit.withTextAlternative}</dd></div>
              </dl>
              {context.mediaAudit.total > 20 && <p className="hint">Showing the first 20 media elements.</p>}
              <ul className="media-audit">
                {context.mediaAudit.items.map((item) => {
                  const duration = formatDuration(item.duration);
                  return (
                    <li key={item.id} data-state={item.state}>
                      <strong>{renderMediaState(item)}</strong>
                      <span>{item.title || `${item.element === "video" ? "Video" : "Audio"}${duration ? ` · ${duration}` : ""}`}</span>
                      <small>{item.source}</small>
                      {item.tracks.length > 0 && (
                        <p className="track-summary">
                          {item.tracks.map((track) =>
                            `${track.kind}${track.language ? ` (${track.language})` : ""}`,
                          ).join(", ")}
                        </p>
                      )}
                      {item.hasTranscriptLink && !item.transcript && (
                        <p className="track-summary">Linked transcript detected on the page.</p>
                      )}
                      {item.transcript && (
                        <details>
                          <summary>Available transcript</summary>
                          <p className="transcript-preview">{item.transcript}</p>
                          <button
                            type="button"
                            className="small-button secondary"
                            onClick={() => void speakTranscript(item)}
                          >
                            Speak with English voice
                          </button>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="diagnostics-title">
        <h2 id="diagnostics-title">AI diagnostics</h2>
        <p className="hint">Firebase AI Logic checks exposing the actual inference source.</p>
        <div className="actions">
          <button type="button" className="secondary" disabled={isProbing || isBusy} onClick={() => void runProbe("on-device")}>Test on-device AI</button>
          <button type="button" className="secondary" disabled={isProbing || isBusy} onClick={() => void runProbe("in-cloud")}>Test cloud AI</button>
        </div>
      </section>

      {voices.length > 0 && (
        <label className="voice-select">
          English voice
          <select value={voiceName} onChange={(event) => setVoiceName(event.target.value)}>
            {voices.map((voice) => <option key={voice.voiceName} value={voice.voiceName}>{voice.voiceName} ({voice.lang})</option>)}
          </select>
        </label>
      )}

      <p className="status" role="status" aria-live="polite">{status}</p>
    </main>
  );
}
