import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  Schema,
  type GenerativeModel,
  type InferenceSource,
  type Part,
} from "@firebase/ai";
import {
  buildAltTextPrompt,
  parseGeneratedAltText,
  type GeneratedAltText,
} from "../core/alt-text";
import type { ImageAuditItem, PageContext } from "../core/messages";
import { ensureAppCheck } from "./app-check";
import { firebaseApp } from "./app";

export type InferencePreference = "on-device" | "in-cloud";

export interface TextProbeResult {
  text: string;
  source: InferenceSource | "unknown";
}

export interface ImageDescriptionInput {
  page: Pick<PageContext, "title" | "description">;
  image: Pick<
    ImageAuditItem,
    "nearbyText" | "isInteractive" | "width" | "height"
  >;
  imageDataUrl: string;
}

export interface ImageDescriptionResult extends GeneratedAltText {
  source: InferenceSource | "unknown";
}

export interface DeviceModelPreparation {
  deviceReady: boolean;
  error?: Error;
}

const altTextResponseSchema = Schema.object({
  properties: {
    altText: Schema.string({
      description: "Concise English alternative text describing meaningful visual content.",
    }),
    explanation: Schema.string({
      description: "A short reason why this description is useful to a screen-reader user.",
    }),
  },
});

let imageDescriptionModel: GenerativeModel | undefined;

const getImageDescriptionModel = (): GenerativeModel => {
  if (imageDescriptionModel) return imageDescriptionModel;

  ensureAppCheck();
  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  imageDescriptionModel = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: {
      model: "gemini-3.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: altTextResponseSchema,
      },
    },
    onDeviceParams: {
      createOptions: {
        expectedInputs: [
          { type: "text", languages: ["en"] },
          { type: "image" },
        ],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      },
      promptOptions: {
        responseConstraint: JSON.parse(JSON.stringify(altTextResponseSchema)) as object,
      },
    },
  });
  return imageDescriptionModel;
};

export const prepareImageDescriptionModel = async (
  onProgress?: (progress: number) => void,
): Promise<DeviceModelPreparation> => {
  try {
    // The SDK call is intentionally reached before the first await so callers
    // can invoke this directly inside a user gesture.
    const initialization = getImageDescriptionModel().initializeDeviceModel(onProgress);
    await initialization;
    return { deviceReady: true };
  } catch (error: unknown) {
    return {
      deviceReady: false,
      error: error instanceof Error ? error : new Error("On-device AI is unavailable."),
    };
  }
};

export const describeImage = async (
  input: ImageDescriptionInput,
): Promise<ImageDescriptionResult> => {
  const prefix = "data:image/png;base64,";
  if (!input.imageDataUrl.startsWith(prefix)) {
    throw new Error("The image crop is not a valid PNG capture.");
  }

  const data = input.imageDataUrl.slice(prefix.length);
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/u.test(data)) {
    throw new Error("The image crop contains invalid image data.");
  }

  const parts: Part[] = [
    { type: "text", text: buildAltTextPrompt(input.page, input.image) },
    { type: "inlineData", inlineData: { mimeType: "image/png", data } },
  ];
  const result = await getImageDescriptionModel().generateContent(parts);
  const generated = parseGeneratedAltText(result.response.text());

  return {
    ...generated,
    source: result.response.inferenceSource ?? "unknown",
  };
};

const getInferenceMode = (preference: InferencePreference): InferenceMode =>
  preference === "on-device"
    ? InferenceMode.ONLY_ON_DEVICE
    : InferenceMode.ONLY_IN_CLOUD;

export const runTextProbe = async (
  preference: InferencePreference,
  onProgress?: (progress: number) => void,
): Promise<TextProbeResult> => {
  ensureAppCheck();
  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    mode: getInferenceMode(preference),
    inCloudParams: { model: "gemini-3.5-flash-lite" },
  });

  if (preference === "on-device") await model.initializeDeviceModel(onProgress);
  const result = await model.generateContent("Reply with exactly: Clariway AI is ready.");

  return {
    text: result.response.text().trim(),
    source: result.response.inferenceSource ?? "unknown",
  };
};
