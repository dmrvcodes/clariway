import { useEffect, useState } from "react";
import { buildAltTextContext, type ImageDescriptionInput } from "../core/alt-text";
import {
  describeOnDeviceFirst,
  grantCloudConsent,
  type CloudConsentReason,
  type DevicePreparation,
} from "../core/hybrid-routing";
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
  describeImageInCloud,
  describeImageOnDevice,
  prepareOnDeviceImageModel,
  runTextProbe,
  type ImageDescriptionResult,
  type InferencePreference,
} from "../firebase/ai";
import "./styles.css";

interface CloudRequest {
  reason: CloudConsentReason;
  detail: string;
}

interface DescriptionEntry {
  /** Exactly what a cloud request would send: the crop plus bounded page text. */
  input: ImageDescriptionInput;
  result: ImageDescriptionResult | null;
  applied: boolean;
  /** Set while the user decides whether this image may be sent to the cloud. */
  cloudRequest: CloudRequest | null;
}

type ImageOutcome = "described" | "needs-consent";

const consentTitles: Record<CloudConsentReason, string> = {
  "device-unavailable": "On-device AI is not available",
  "device-failed": "On-device AI could not describe this image",
  "second-opinion": "Ask the cloud model for another description?",
};

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

const toDescriptionInput = (
  page: PageContext,
  item: ImageAuditItem,
  imageDataUrl: string,
): ImageDescriptionInput => ({
  page: { title: page.title, description: page.description },
  image: {
    nearbyText: item.nearbyText,
    isInteractive: item.isInteractive,
    width: item.width,
    height: item.height,
  },
  imageDataUrl,
});

const formatSource = (source: string): string => source.replaceAll("_", " ").toLowerCase();

const sourceLabel = (source: ImageDescriptionResult["source"]): string => {
  if (source === "on_device") return "On device";
  if (source === "in_cloud") return "Cloud · Gemini";
  return "Unknown source";
};

const summarizeBatch = (described: number, needsConsent: number, failed: number): string => {
  const parts = [`${described} described on this device`];
  if (needsConsent > 0) parts.push(`${needsConsent} waiting for your cloud decision, nothing sent`);
  if (failed > 0) parts.push(`${failed} failed`);
  return `${parts.join("; ")}.`;
};

export function App() {
  const [context, setContext] = useState<PageContext | null>(null);
  const [status, setStatus] = useState("Ready to inspect a page.");
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [busyImageId, setBusyImageId] = useState<string | null>(null);
  const [isBatching, setIsBatching] = useState(false);
  const [descriptions, setDescriptions] = useState<Record<string, DescriptionEntry>>({});
  const [focusTargetId, setFocusTargetId] = useState<string | null>(null);

  useEffect(() => {
    void getEnglishVoices()
      .then((availableVoices) => {
        setVoices(availableVoices);
        setVoiceName(availableVoices[0]?.voiceName ?? "");
      })
      .catch(() => setStatus("No English text-to-speech voice is available."));
  }, []);

  // Keep keyboard and screen-reader focus on the card that replaced the clicked control.
  useEffect(() => {
    if (!focusTargetId) return;
    document.getElementById(focusTargetId)?.focus();
    setFocusTargetId(null);
  }, [focusTargetId]);

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

  const describeOnDevice = async (
    page: PageContext,
    item: ImageAuditItem,
    screenshot: string,
    device: DevicePreparation,
  ): Promise<ImageOutcome> => {
    const imageDataUrl = await cropVisibleImage(screenshot, item, page.viewport);
    const input = toDescriptionInput(page, item, imageDataUrl);
    const outcome = await describeOnDeviceFirst(device, () => describeImageOnDevice(input));

    setDescriptions((current) => ({
      ...current,
      [item.id]:
        outcome.kind === "described"
          ? { input, result: outcome.result, applied: false, cloudRequest: null }
          : {
              input,
              result: null,
              applied: false,
              cloudRequest: { reason: outcome.reason, detail: outcome.detail },
            },
    }));
    return outcome.kind === "described" ? "described" : "needs-consent";
  };

  const describeOne = async (staleItem: ImageAuditItem) => {
    // Must start synchronously in the click handler for Chrome's user-activation requirement.
    const preparation = prepareOnDeviceImageModel((progress) => {
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
      if (device.deviceReady) setStatus("Describing on this device");
      const outcome = await describeOnDevice(page, item, screenshot, device);
      setFocusTargetId(outcome === "described" ? `description-${item.id}` : `consent-${item.id}`);
      setStatus(
        outcome === "described"
          ? "On-device description ready for review"
          : "On-device AI could not describe this image. Nothing was sent. Review the cloud option.",
      );
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Image description failed.");
    } finally {
      setBusyImageId(null);
    }
  };

  const describeVisibleMissing = async () => {
    const preparation = prepareOnDeviceImageModel((progress) => {
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
      let described = 0;
      let needsConsent = 0;
      const failures: string[] = [];

      for (const [index, item] of targets.entries()) {
        setBusyImageId(item.id);
        setStatus(
          device.deviceReady
            ? `On device: image ${index + 1} of ${targets.length}`
            : `Preparing image ${index + 1} of ${targets.length} for review`,
        );
        try {
          const outcome = await describeOnDevice(page, item, screenshot, device);
          if (outcome === "described") described += 1;
          else needsConsent += 1;
        } catch (error: unknown) {
          failures.push(error instanceof Error ? error.message : `Image ${index + 1} failed.`);
        }
      }

      if (described + needsConsent === 0) {
        throw new Error(failures[0] ?? "No descriptions were generated.");
      }
      setStatus(summarizeBatch(described, needsConsent, failures.length));
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Batch description failed.");
    } finally {
      setBusyImageId(null);
      setIsBatching(false);
    }
  };

  const sendToCloud = async (item: ImageAuditItem) => {
    const entry = descriptions[item.id];
    if (!entry?.cloudRequest) return;

    // Created only from this click. It carries the exact payload shown in the card.
    const consent = grantCloudConsent(entry.input);
    setBusyImageId(item.id);
    setStatus("Sending the approved crop and page text to the cloud model");

    try {
      const result = await describeImageInCloud(consent);
      setDescriptions((current) => {
        const latest = current[item.id];
        if (!latest) return current;
        return {
          ...current,
          [item.id]: { ...latest, result, applied: false, cloudRequest: null },
        };
      });
      setFocusTargetId(`description-${item.id}`);
      setStatus("Cloud description ready for review");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "The cloud model could not describe this image.");
    } finally {
      setBusyImageId(null);
    }
  };

  const declineCloud = (item: ImageAuditItem) => {
    const entry = descriptions[item.id];
    if (!entry) return;

    setDescriptions((current) => {
      const { [item.id]: latest, ...rest } = current;
      if (!latest) return current;
      return latest.result
        ? { ...current, [item.id]: { ...latest, cloudRequest: null } }
        : rest;
    });
    setFocusTargetId(entry.result ? `description-${item.id}` : `describe-${item.id}`);
    setStatus("Kept on this device. Nothing was sent.");
  };

  const requestCloudDescription = (item: ImageAuditItem) => {
    setDescriptions((current) => {
      const latest = current[item.id];
      if (!latest) return current;
      return {
        ...current,
        [item.id]: { ...latest, cloudRequest: { reason: "second-opinion", detail: "" } },
      };
    });
    setFocusTargetId(`consent-${item.id}`);
    setStatus("Review what would be sent before asking the cloud model.");
  };

  const mutateAlt = async (item: ImageAuditItem, restore: boolean) => {
    const entry = descriptions[item.id];
    if (!entry?.result) return;
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
              altText: entry.result.altText,
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

  const renderCloudConsent = (item: ImageAuditItem, entry: DescriptionEntry, request: CloudRequest) => {
    const sent = buildAltTextContext(entry.input.page, entry.input.image);
    const sentText = [
      { label: "Page title", value: sent.pageTitle },
      { label: "Page description", value: sent.pageDescription },
      { label: "Nearby text", value: sent.nearbyText },
    ].filter((field) => field.value);

    return (
      <div
        className="cloud-consent"
        id={`consent-${item.id}`}
        tabIndex={-1}
        role="group"
        aria-labelledby={`consent-title-${item.id}`}
      >
        <img src={entry.input.imageDataUrl} alt="The exact image crop that would be sent" />
        <div>
          <strong id={`consent-title-${item.id}`}>{consentTitles[request.reason]}</strong>
          {request.detail && <small>{request.detail}</small>}
          <p>
            Nothing has been sent. If you continue, this crop and the page text below go to
            Google's Gemini model through Firebase AI Logic.
          </p>
          <details>
            <summary>Text sent with the image</summary>
            {sentText.length > 0 && (
              <dl>
                {sentText.map((field) => (
                  <div key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="consent-meta">
              Also sent: image size {sent.intrinsicSize}
              {sent.interactive ? " and that the image is a link or button" : ""}.
            </p>
          </details>
        </div>
        <div className="consent-actions">
          <button
            type="button"
            className="small-button"
            disabled={isBusy}
            onClick={() => void sendToCloud(item)}
          >
            {busyImageId === item.id ? "Sending…" : "Send to cloud"}
          </button>
          <button
            type="button"
            className="small-button secondary"
            disabled={isBusy}
            onClick={() => declineCloud(item)}
          >
            {entry.result ? "Keep on-device result" : "Don't send"}
          </button>
        </div>
      </div>
    );
  };

  const renderDescription = (
    item: ImageAuditItem,
    entry: DescriptionEntry,
    result: ImageDescriptionResult,
  ) => (
    <div className="generated-description">
      <img src={entry.input.imageDataUrl} alt={result.altText} />
      <div>
        <span className="source-badge" data-source={result.source}>{sourceLabel(result.source)}</span>
        <p id={`description-${item.id}`} tabIndex={-1}>{result.altText}</p>
        <small>{result.explanation}</small>
      </div>
      <button
        type="button"
        className="small-button"
        disabled={isBusy}
        onClick={() => void mutateAlt(item, entry.applied)}
      >
        {entry.applied ? "Undo preview fix" : "Apply preview fix"}
      </button>
      {result.source === "on_device" && !entry.applied && (
        <button
          type="button"
          className="small-button secondary"
          disabled={isBusy}
          onClick={() => requestCloudDescription(item)}
        >
          Ask the cloud model instead
        </button>
      )}
    </div>
  );

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
              <p className="hint">
                Runs on this device. If local AI can't help, Clariway shows exactly what would be
                sent and asks before using the cloud. Review before applying.
              </p>
            </div>
          )}
          {context.imageAudit.total > 50 && <p className="hint">Showing the first 50 images for a fast local audit.</p>}

          {context.imageAudit.items.length > 0 && (
            <ul className="image-audit">
              {context.imageAudit.items.map((item) => {
                const entry = descriptions[item.id];
                return (
                  <li key={item.id} data-state={item.state}>
                    <strong>{renderImageState(item)}</strong>
                    <span className="existing-alt">{item.alt || "No alternative text"}</span>
                    {item.nearbyText && <small>{item.nearbyText}</small>}
                    {item.state === "missing" && !entry && (
                      <button
                        type="button"
                        id={`describe-${item.id}`}
                        className="small-button secondary"
                        disabled={isBusy}
                        onClick={() => void describeOne(item)}
                      >
                        {busyImageId === item.id ? "Describing…" : "Describe this image"}
                      </button>
                    )}
                    {entry?.cloudRequest && renderCloudConsent(item, entry, entry.cloudRequest)}
                    {entry?.result && !entry.cloudRequest && renderDescription(item, entry, entry.result)}
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
            {voices.map((voice) => (
              <option key={voice.voiceName} value={voice.voiceName}>
                {voice.voiceName} ({voice.lang}){voice.remote ? " · network voice" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="status" role="status" aria-live="polite">{status}</p>
    </main>
  );
}
