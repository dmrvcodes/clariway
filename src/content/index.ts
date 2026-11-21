// This entry point is deliberately self-contained. Chrome injects it through
// chrome.scripting.executeScript(), which requires a classic standalone script.
type ContentRequest =
  | { type: "GET_PAGE_CONTEXT" }
  | {
      type: "APPLY_IMAGE_ALT";
      imageId: string;
      expectedSource: string;
      altText: string;
    }
  | {
      type: "RESTORE_IMAGE_ALT";
      imageId: string;
      expectedSource: string;
    };
type ImageState = "described" | "missing" | "ignored";
type MediaState = "captioned" | "transcript" | "missing";
type MediaTrackKind = "captions" | "subtitles" | "descriptions" | "chapters" | "metadata";

type PageData = {
  title: string;
  url: string;
  description: string;
  mainText: string;
  selectedText: string;
  capturedAt: number;
  viewport: { width: number; height: number };
  imageAudit: {
    total: number;
    audited: number;
    missing: number;
    ignored: number;
    items: Array<{
      id: string;
      source: string;
      alt: string;
      state: ImageState;
      nearbyText: string;
      isInteractive: boolean;
      width: number;
      height: number;
      rect: { x: number; y: number; width: number; height: number };
    }>;
  };
  mediaAudit: {
    total: number;
    audited: number;
    missing: number;
    withTextAlternative: number;
    items: Array<{
      id: string;
      element: "audio" | "video";
      source: string;
      title: string;
      state: MediaState;
      duration: number | null;
      nearbyText: string;
      transcript: string;
      hasTranscriptLink: boolean;
      tracks: Array<{
        kind: MediaTrackKind;
        label: string;
        language: string;
        mode: "disabled" | "hidden" | "showing" | "unknown";
        cueCount: number;
      }>;
    }>;
  };
};

type ContentResponse =
  | { ok: true; data: PageData }
  | { ok: false; error: string };

type OriginalAlt = { hadAttribute: boolean; value: string };

const imageLimit = 50;
const mediaLimit = 20;
const mainTextLimit = 6_000;
const nearbyTextLimit = 500;
const transcriptLimit = 6_000;
const originalAlts = new WeakMap<HTMLImageElement, OriginalAlt>();

const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim();

const truncate = (value: string, limit: number): string =>
  value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;

const normalizeImageSource = (image: HTMLImageElement): string =>
  image.currentSrc || image.src || "Inline image";

const getNearbyText = (image: HTMLImageElement): string => {
  const container = image.closest("figure, article, section, li, a") ?? image.parentElement;
  const caption = image.closest("figure")?.querySelector("figcaption")?.textContent ?? "";
  return truncate(normalizeText(caption || container?.textContent || ""), nearbyTextLimit);
};

const hasAccessibleInteractiveName = (element: Element): boolean => {
  const labelledBy = element.getAttribute("aria-labelledby");
  const referencedText = labelledBy
    ?.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
  const descendantAlt = Array.from(element.querySelectorAll<HTMLImageElement>("img[alt]"))
    .map((image) => image.alt)
    .join(" ");
  const explicitName = element.getAttribute("aria-label") ?? element.getAttribute("title");

  return Boolean(
    normalizeText(
      [explicitName, referencedText, element.textContent, descendantAlt]
        .filter(Boolean)
        .join(" "),
    ),
  );
};

const auditImages = (): PageData["imageAudit"] => {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>("img"));
  const items = images.slice(0, imageLimit).map((image, index) => {
    const hasAltAttribute = image.hasAttribute("alt");
    const alt = image.getAttribute("alt")?.trim() ?? "";
    const interactiveAncestor = image.closest("a, button, input[type='image']");
    const isInteractive = interactiveAncestor !== null;
    const interactiveNameMissing =
      isInteractive && !hasAccessibleInteractiveName(interactiveAncestor);
    const state: ImageState = interactiveNameMissing
      ? "missing"
      : image.getAttribute("role") === "presentation" ||
          image.getAttribute("role") === "none" ||
          image.getAttribute("aria-hidden") === "true" ||
          (hasAltAttribute && alt === "")
        ? "ignored"
        : !hasAltAttribute
          ? "missing"
          : "described";
    const rect = image.getBoundingClientRect();

    return {
      id: `image-${index + 1}`,
      source: normalizeImageSource(image),
      alt,
      state,
      nearbyText: getNearbyText(image),
      isInteractive,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  });

  return {
    total: images.length,
    audited: items.length,
    missing: items.filter((item) => item.state === "missing").length,
    ignored: items.filter((item) => item.state === "ignored").length,
    items,
  };
};

const mediaTrackKinds = new Set<MediaTrackKind>([
  "captions",
  "subtitles",
  "descriptions",
  "chapters",
  "metadata",
]);

const normalizeTrackKind = (value: string): MediaTrackKind =>
  mediaTrackKinds.has(value as MediaTrackKind) ? (value as MediaTrackKind) : "metadata";

const readTrackCues = (trackElement: HTMLTrackElement): string => {
  try {
    const cues = trackElement.track?.cues;
    if (!cues) return "";

    const parts: string[] = [];
    for (let index = 0; index < cues.length; index += 1) {
      const cue = cues[index] as (TextTrackCue & { text?: string }) | undefined;
      if (cue?.text) parts.push(normalizeText(cue.text));
    }
    return truncate(normalizeText(parts.join(" ")), transcriptLimit);
  } catch {
    // Cross-origin and not-yet-loaded tracks can expose metadata without cues.
    return "";
  }
};

const readTrackRuntimeState = (
  trackElement: HTMLTrackElement,
): { mode: "disabled" | "hidden" | "showing" | "unknown"; cueCount: number } => {
  try {
    const mode = trackElement.track?.mode;
    return {
      mode:
        mode === "disabled" || mode === "hidden" || mode === "showing"
          ? mode
          : "unknown",
      cueCount: trackElement.track?.cues?.length ?? 0,
    };
  } catch {
    return { mode: "unknown", cueCount: 0 };
  }
};

const getDescribedByText = (media: HTMLMediaElement): string => {
  const ids = media.getAttribute("aria-describedby")?.split(/\s+/).filter(Boolean) ?? [];
  return normalizeText(ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" "));
};

const auditMedia = (): PageData["mediaAudit"] => {
  const mediaElements = Array.from(document.querySelectorAll<HTMLMediaElement>("audio, video"));
  const items = mediaElements.slice(0, mediaLimit).map((media, index) => {
    const element: "audio" | "video" =
      media.tagName.toLowerCase() === "audio" ? "audio" : "video";
    const container = media.closest("figure, article, section") ?? media.parentElement;
    const nearbyText = truncate(normalizeText(container?.textContent ?? ""), nearbyTextLimit);
    const describedByText = getDescribedByText(media);
    const inlineTranscript = normalizeText(
      container?.querySelector<HTMLElement>("[data-transcript], .transcript, [id*='transcript']")
        ?.textContent ?? "",
    );
    const transcriptLink = Array.from(container?.querySelectorAll<HTMLAnchorElement>("a") ?? [])
      .find((link) => /transcript|captions?/iu.test(`${link.textContent ?? ""} ${link.href}`));
    const trackElements = Array.from(media.querySelectorAll<HTMLTrackElement>("track"));
    const tracks = trackElements.map((trackElement) => {
      const runtime = readTrackRuntimeState(trackElement);
      return {
        kind: normalizeTrackKind(trackElement.kind),
        label: truncate(normalizeText(trackElement.label), 120),
        language: truncate(normalizeText(trackElement.srclang), 40),
        mode: runtime.mode,
        cueCount: runtime.cueCount,
      };
    });
    const captionTrackIndexes = tracks
      .map((track, trackIndex) => ({ track, trackIndex }))
      .filter(({ track }) => track.kind === "captions" || track.kind === "subtitles")
      .map(({ trackIndex }) => trackIndex);
    const cueTranscript = captionTrackIndexes
      .map((trackIndex) => readTrackCues(trackElements[trackIndex]))
      .filter(Boolean)
      .join(" ");
    const transcript = truncate(
      normalizeText(cueTranscript || inlineTranscript || describedByText),
      transcriptLimit,
    );
    const hasCaptions = captionTrackIndexes.length > 0;
    const hasTranscript = Boolean(transcript || transcriptLink);
    const state: MediaState = hasCaptions
      ? "captioned"
      : hasTranscript
        ? "transcript"
        : "missing";
    const source =
      media.currentSrc ||
      media.getAttribute("src") ||
      media.querySelector<HTMLSourceElement>("source")?.src ||
      `Embedded ${element}`;
    const title = normalizeText(
      media.getAttribute("aria-label") ||
        media.getAttribute("title") ||
        media.closest("figure")?.querySelector("figcaption")?.textContent ||
        "",
    );

    return {
      id: `media-${index + 1}`,
      element,
      source: truncate(source, 500),
      title: truncate(title, 200),
      state,
      duration: Number.isFinite(media.duration) && media.duration >= 0 ? media.duration : null,
      nearbyText,
      transcript,
      hasTranscriptLink: Boolean(transcriptLink),
      tracks,
    };
  });

  return {
    total: mediaElements.length,
    audited: items.length,
    missing: items.filter((item) => item.state === "missing").length,
    withTextAlternative: items.filter((item) => item.state !== "missing").length,
    items,
  };
};

const getMainText = (): string => {
  const root = document.querySelector<HTMLElement>("main, article, [role='main']") ?? document.body;
  return truncate(normalizeText(root?.innerText ?? ""), mainTextLimit);
};

const getPageContext = (): Extract<ContentResponse, { ok: true }> => ({
  ok: true,
  data: {
    title: document.title,
    url: window.location.href,
    description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content.trim() ?? "",
    mainText: getMainText(),
    selectedText: window.getSelection()?.toString().trim() ?? "",
    capturedAt: Date.now(),
    viewport: {
      width: Math.max(1, window.innerWidth),
      height: Math.max(1, window.innerHeight),
    },
    imageAudit: auditImages(),
    mediaAudit: auditMedia(),
  },
});

const resolveImage = (imageId: string, expectedSource: string): HTMLImageElement => {
  const match = /^image-(\d+)$/.exec(imageId);
  const index = match ? Number(match[1]) - 1 : -1;
  const image = document.querySelectorAll<HTMLImageElement>("img").item(index);

  if (!image || normalizeImageSource(image) !== expectedSource) {
    throw new Error("The page changed. Audit it again before applying this description.");
  }

  return image;
};

const applyImageAlt = (
  request: Extract<ContentRequest, { type: "APPLY_IMAGE_ALT" }>,
): ContentResponse => {
  const image = resolveImage(request.imageId, request.expectedSource);
  const altText = request.altText.trim();

  if (altText.length === 0 || altText.length > 500) {
    throw new Error("Alternative text must contain between 1 and 500 characters.");
  }

  if (!originalAlts.has(image)) {
    originalAlts.set(image, {
      hadAttribute: image.hasAttribute("alt"),
      value: image.getAttribute("alt") ?? "",
    });
  }

  image.setAttribute("alt", altText);
  return getPageContext();
};

const restoreImageAlt = (
  request: Extract<ContentRequest, { type: "RESTORE_IMAGE_ALT" }>,
): ContentResponse => {
  const image = resolveImage(request.imageId, request.expectedSource);
  const original = originalAlts.get(image);

  if (!original) {
    throw new Error("No Clariway preview change exists for this image.");
  }

  if (original.hadAttribute) {
    image.setAttribute("alt", original.value);
  } else {
    image.removeAttribute("alt");
  }
  originalAlts.delete(image);
  return getPageContext();
};

chrome.runtime.onMessage.addListener(
  (request: ContentRequest, _sender, sendResponse: (response: ContentResponse) => void) => {
    try {
      switch (request.type) {
        case "GET_PAGE_CONTEXT":
          sendResponse(getPageContext());
          return false;
        case "APPLY_IMAGE_ALT":
          sendResponse(applyImageAlt(request));
          return false;
        case "RESTORE_IMAGE_ALT":
          sendResponse(restoreImageAlt(request));
          return false;
      }
    } catch (error: unknown) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unable to update this image.",
      });
    }
    return false;
  },
);
