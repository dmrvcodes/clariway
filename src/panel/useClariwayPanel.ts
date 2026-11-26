import { useEffect, useState } from "react";
import type { ImageDescriptionInput } from "../core/alt-text";
import {
  describeOnDeviceFirst,
  grantCloudConsent,
  type DevicePreparation,
} from "../core/hybrid-routing";
import { cropVisibleImage } from "../core/image-crop";
import {
  pageContextSchema,
  readingProfileSchema,
  type ExtensionRequest,
  type ExtensionResponse,
  type ImageAuditItem,
  type MediaAuditItem,
  type PageContext,
  type ReadingProfile,
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
  type InferencePreference,
} from "../firebase/ai";
import { normalizeAIServiceError } from "../firebase/errors";
import type { DescriptionEntries, RoutingActivity } from "./types";

type ImageOutcome = "described" | "needs-consent";

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

const summarizeBatch = (described: number, needsConsent: number, failed: number): string => {
  const parts = [`${described} described on this device`];
  if (needsConsent > 0) parts.push(`${needsConsent} waiting for your cloud decision, nothing sent`);
  if (failed > 0) parts.push(`${failed} failed`);
  return `${parts.join("; ")}.`;
};

export function useClariwayPanel() {
  const [context, setContext] = useState<PageContext | null>(null);
  const [status, setStatus] = useState("Ready to inspect a page.");
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voiceName, setVoiceName] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [busyImageId, setBusyImageId] = useState<string | null>(null);
  const [isBatching, setIsBatching] = useState(false);
  const [descriptions, setDescriptions] = useState<DescriptionEntries>({});
  const [focusTargetId, setFocusTargetId] = useState<string | null>(null);
  const [readingProfile, setReadingProfile] = useState<ReadingProfile>({
    textScale: 100,
    highContrast: false,
  });
  const [routingActivity, setRoutingActivity] = useState<RoutingActivity>({
    onDeviceResults: 0,
    approvedCloudSends: 0,
  });

  useEffect(() => {
    void getEnglishVoices()
      .then((availableVoices) => {
        setVoices(availableVoices);
        setVoiceName(availableVoices[0]?.voiceName ?? "");
      })
      .catch(() => setStatus("No English text-to-speech voice is available."));
  }, []);

  useEffect(() => {
    if (!focusTargetId) return;
    document.getElementById(focusTargetId)?.focus();
    setFocusTargetId(null);
  }, [focusTargetId]);

  const inspectPage = async () => {
    setIsInspecting(true);
    setStatus("Reading the current page");
    try {
      const pageContext = await getActivePageContext();
      setContext(pageContext);
      setDescriptions({});
      setRoutingActivity({ onDeviceResults: 0, approvedCloudSends: 0 });
      setFocusTargetId("context-title");
      setStatus(
        pageContext.imageAudit.missing === 0
          ? "Scan complete. No images without alt text were found in the audited set."
          : `Scan complete. ${pageContext.imageAudit.missing} images need alt text review.`,
      );
    } catch (error: unknown) {
      setContext(null);
      setStatus(error instanceof Error ? error.message : "Unable to read this page.");
    } finally {
      setIsInspecting(false);
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
    if (outcome.kind === "described") {
      setRoutingActivity((current) => ({
        ...current,
        onDeviceResults: current.onDeviceResults + 1,
      }));
    }
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
      let device = await preparation;
      let described = 0;
      let needsConsent = 0;
      let firstCardId: string | null = null;
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
          firstCardId ??= outcome === "described" ? `description-${item.id}` : `consent-${item.id}`;
          if (outcome === "described") described += 1;
          else {
            needsConsent += 1;
            if (device.deviceReady) {
              device = {
                deviceReady: false,
                error: new Error("Skipped after the previous on-device AI failure."),
              };
            }
          }
        } catch (error: unknown) {
          failures.push(error instanceof Error ? error.message : `Image ${index + 1} failed.`);
        }
      }

      if (described + needsConsent === 0) {
        throw new Error(failures[0] ?? "No descriptions were generated.");
      }
      if (firstCardId) setFocusTargetId(firstCardId);
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

    const consent = grantCloudConsent(entry.input);
    setRoutingActivity((current) => ({
      ...current,
      approvedCloudSends: current.approvedCloudSends + 1,
    }));
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
      setStatus(normalizeAIServiceError(error).message);
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
      setStatus(restore ? "Original alt text restored" : "Preview fix applied to this page");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Could not update this image.");
    } finally {
      setBusyImageId(null);
    }
  };

  const startSpeech = async (text: string, activeStatus: string) => {
    setIsSpeaking(true);
    try {
      await speakEnglish(text, voiceName || undefined, (event) => {
        if (["end", "cancelled", "interrupted", "error"].includes(event.type)) {
          setIsSpeaking(false);
        }
      });
      setStatus(activeStatus);
    } catch (error: unknown) {
      setIsSpeaking(false);
      setStatus(error instanceof Error ? error.message : "Speech could not start.");
    }
  };

  const speakSelection = async () => {
    try {
      const page = await getActivePageContext();
      setContext(page);
      if (!page.selectedText) {
        setStatus("Select English text on the page first.");
        return;
      }
      await startSpeech(page.selectedText, "Speaking selected text");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Unable to read the current selection.");
    }
  };

  const speakPage = async () => {
    try {
      const page = await getActivePageContext();
      setContext(page);
      if (!page.mainText) {
        setStatus("No readable main content was found on this page.");
        return;
      }
      await startSpeech(page.mainText, "Speaking the current page");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Unable to read the current page.");
    }
  };

  const speakTranscript = async (item: MediaAuditItem) => {
    if (!item.transcript) {
      setStatus("This media exposes a text track, but its cues are not loaded yet.");
      return;
    }
    await startSpeech(item.transcript, "Speaking the available English transcript");
  };

  const stopSpeech = async () => {
    try {
      await stopSpeaking();
      setIsSpeaking(false);
      setStatus("Speech stopped");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Speech could not be stopped.");
    }
  };

  const updateReadingProfile = async (reset: boolean) => {
    const requested: ReadingProfile = reset
      ? { textScale: 100, highContrast: false }
      : readingProfile;
    setStatus(reset ? "Restoring the page's original presentation" : "Applying reading comfort locally");

    try {
      const response = await sendExtensionRequest(
        reset
          ? { type: "RESET_READING_PROFILE" }
          : { type: "APPLY_READING_PROFILE", ...requested },
      );
      if (!response.ok) throw new Error(response.error);
      if (!("data" in response)) {
        throw new Error("No reading-profile state returned.");
      }
      const parsed = readingProfileSchema.safeParse(response.data);
      if (!parsed.success) throw new Error("Clariway received an invalid reading profile.");
      setReadingProfile(parsed.data);
      setStatus(reset ? "Original page presentation restored" : "Reading comfort applied on this device");
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : "Unable to update reading comfort.");
    }
  };

  const runProbe = async (preference: InferencePreference) => {
    setIsProbing(true);
    setStatus(preference === "on-device" ? "Preparing the on-device model" : "Requesting cloud inference");
    try {
      const result = await runTextProbe(preference, (progress) => {
        setStatus(`Downloading local model: ${Math.round(progress * 100)}%`);
      });
      const source = result.source === "on_device" ? "on device" : "in the cloud";
      setStatus(`Firebase AI Logic verified ${source}: ${result.text}`);
    } catch (error: unknown) {
      setStatus(
        preference === "in-cloud"
          ? normalizeAIServiceError(error).message
          : error instanceof Error
            ? error.message
            : "The on-device model could not start.",
      );
    } finally {
      setIsProbing(false);
    }
  };

  return {
    state: {
      context,
      status,
      voices,
      voiceName,
      isSpeaking,
      isProbing,
      isInspecting,
      busyImageId,
      isBatching,
      descriptions,
      readingProfile,
      routingActivity,
      isBusy: isProbing || isInspecting || isBatching || busyImageId !== null,
    },
    actions: {
      inspectPage,
      describeVisibleMissing,
      describeOne,
      sendToCloud,
      declineCloud,
      requestCloudDescription,
      mutateAlt,
      updateReadingProfile,
      speakSelection,
      speakPage,
      speakTranscript,
      stopSpeech,
      runProbe,
      setReadingProfile,
      setVoiceName,
    },
  };
}
