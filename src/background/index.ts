import {
  extensionRequestSchema,
  imageAltMutationSchema,
  pageContextSchema,
  readingProfileSchema,
  type ContentRequest,
  type ExtensionRequest,
  type ExtensionResponse,
  type PageContext,
  type ReadingProfile,
} from "../core/messages";

const openPanelForActiveTab = async (): Promise<void> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active browser window found.");
  await chrome.sidePanel.open({ tabId: tab.id });
};

const getActiveWebTab = async (): Promise<chrome.tabs.Tab & { id: number }> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Open an HTTP or HTTPS page and try again.");

  // activeTab can grant script access without exposing tab.url. Let Chrome's
  // scripting API enforce restricted-page access when the URL is unavailable.
  if (tab.url && !/^https?:\/\//u.test(tab.url)) {
    throw new Error("Open an HTTP or HTTPS page and try again.");
  }
  return tab as chrome.tabs.Tab & { id: number };
};

const parsePageContextResponse = (response: unknown): PageContext => {
  if (!response || typeof response !== "object" || !("ok" in response)) {
    throw new Error("Clariway received an invalid page context.");
  }
  if (response.ok !== true || !("data" in response)) {
    const message =
      "error" in response && typeof response.error === "string"
        ? response.error
        : "Unable to read this page.";
    throw new Error(message);
  }

  const parsed = pageContextSchema.safeParse(response.data);
  if (!parsed.success) throw new Error("Clariway received an invalid page context.");
  return parsed.data;
};

const sendContentRequest = async (
  tabId: number,
  request: ContentRequest,
): Promise<PageContext> =>
  parsePageContextResponse(await chrome.tabs.sendMessage(tabId, request));

const sendContentMessage = async (
  tabId: number,
  request: ContentRequest,
): Promise<unknown> => {
  try {
    return await chrome.tabs.sendMessage(tabId, request);
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["assets/content.js"],
      });
    } catch {
      throw new Error("Open an HTTP or HTTPS page and try again.");
    }
    return chrome.tabs.sendMessage(tabId, request);
  }
};

const requestPageContext = async (): Promise<ExtensionResponse> => {
  const tab = await getActiveWebTab();
  return {
    ok: true,
    data: parsePageContextResponse(
      await sendContentMessage(tab.id, { type: "GET_PAGE_CONTEXT" }),
    ),
  };
};

const captureVisibleTab = async (): Promise<ExtensionResponse> => {
  const tab = await getActiveWebTab();
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  if (!dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("Chrome returned an invalid page capture.");
  }
  return { ok: true, data: { kind: "visible-tab-capture", dataUrl } };
};

const mutateImageAlt = async (
  request: Extract<ExtensionRequest, { type: "APPLY_IMAGE_ALT" | "RESTORE_IMAGE_ALT" }>,
): Promise<ExtensionResponse> => {
  const parsed = imageAltMutationSchema.safeParse(request);
  if (!parsed.success || (request.type === "APPLY_IMAGE_ALT" && !parsed.data.altText)) {
    throw new Error("Invalid image alternative-text request.");
  }

  const tab = await getActiveWebTab();
  const contentRequest: ContentRequest = request.type === "APPLY_IMAGE_ALT"
    ? {
        type: request.type,
        imageId: parsed.data.imageId,
        expectedSource: parsed.data.expectedSource,
        altText: parsed.data.altText!,
      }
    : {
        type: request.type,
        imageId: parsed.data.imageId,
        expectedSource: parsed.data.expectedSource,
      };
  return { ok: true, data: await sendContentRequest(tab.id, contentRequest) };
};

const mutateReadingProfile = async (
  request: Extract<
    ContentRequest,
    { type: "APPLY_READING_PROFILE" | "RESET_READING_PROFILE" }
  >,
): Promise<ExtensionResponse> => {
  const profile: ReadingProfile = request.type === "RESET_READING_PROFILE"
    ? { textScale: 100, highContrast: false }
    : readingProfileSchema.parse(request);
  const tab = await getActiveWebTab();
  const response = await sendContentMessage(tab.id, request);

  if (!response || typeof response !== "object" || !("ok" in response)) {
    throw new Error("Clariway received an invalid reading-profile response.");
  }
  if (response.ok !== true || !("data" in response)) {
    throw new Error(
      "error" in response && typeof response.error === "string"
        ? response.error
        : "Unable to update reading comfort.",
    );
  }

  const parsed = readingProfileSchema.safeParse(response.data);
  if (!parsed.success || parsed.data.textScale !== profile.textScale || parsed.data.highContrast !== profile.highContrast) {
    throw new Error("Clariway received an invalid reading-profile response.");
  }
  return { ok: true, data: parsed.data };
};

const handleRequest = async (request: ExtensionRequest): Promise<ExtensionResponse> => {
  switch (request.type) {
    case "GET_ACTIVE_PAGE_CONTEXT":
      return requestPageContext();
    case "CAPTURE_VISIBLE_TAB":
      return captureVisibleTab();
    case "APPLY_IMAGE_ALT":
    case "RESTORE_IMAGE_ALT":
      return mutateImageAlt(request);
    case "APPLY_READING_PROFILE":
    case "RESET_READING_PROFILE":
      return mutateReadingProfile(request);
    case "OPEN_SIDE_PANEL":
      await openPanelForActiveTab();
      return { ok: true };
    default:
      throw new Error("Unsupported Clariway request.");
  }
};

// Reset persisted behavior so action.onClicked grants activeTab before opening.
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {
  // The explicit action handler works where this optional reset is unsupported.
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    void chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
      // The keyboard shortcut remains available if Chrome cannot open the panel.
    });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "open-clariway") await openPanelForActiveTab();
});

chrome.runtime.onMessage.addListener(
  (
    request: unknown,
    sender,
    sendResponse: (response: ExtensionResponse) => void,
  ) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.url !== chrome.runtime.getURL("panel.html")
    ) {
      return false;
    }

    const parsedRequest = extensionRequestSchema.safeParse(request);
    if (!parsedRequest.success) {
      sendResponse({ ok: false, error: "Unsupported Clariway request." });
      return false;
    }

    void handleRequest(parsedRequest.data)
      .then(sendResponse)
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Clariway could not complete the request.",
        }),
      );
    return true;
  },
);
