import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceSource as InferenceSourceValue,
  InferenceMode,
  Schema,
  type AI,
  type GenerativeModel,
  type InferenceSource,
  type Part,
} from "@firebase/ai";
import {
  buildAltTextPrompt,
  parseGeneratedAltText,
  type GeneratedAltText,
  type ImageDescriptionInput,
} from "../core/alt-text";
import type { CloudConsent, DevicePreparation } from "../core/hybrid-routing";
import { ensureAppCheck } from "./app-check";
import { firebaseApp, onDeviceFirebaseApp } from "./app";

export type InferencePreference = "on-device" | "in-cloud";

export interface TextProbeResult {
  text: string;
  source: InferenceSource | "unknown";
}

export interface ImageDescriptionResult extends GeneratedAltText {
  source: InferenceSource | "unknown";
}

export class InferenceSourceMismatchError extends Error {
  constructor(expected: InferenceSource, actual: InferenceSource | undefined) {
    super(
      `Expected ${expected} inference, but Firebase AI Logic reported ${actual ?? "no source"}.`,
    );
    this.name = "InferenceSourceMismatchError";
  }
}

const cloudModelName = "gemini-3.5-flash-lite";

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

/**
 * Firebase creates its on-device adapter only when Chrome's `LanguageModel`
 * global is truthy. Without that adapter the SDK sends even `ONLY_ON_DEVICE`
 * requests to the cloud, so fail closed with the same check.
 */
const assertOnDeviceRuntime = (): void => {
  if (!(globalThis as { LanguageModel?: unknown }).LanguageModel) {
    throw new Error("This browser does not expose Chrome's on-device Prompt API.");
  }
};

/**
 * Cloud requests require App Check, initialized before the AI instance because
 * Firebase AI Logic reads it once at creation. On-device inference uses its own
 * app instance without App Check, so it works without that setup and never
 * contacts Firebase.
 */
const getFirebaseAI = (preference: InferencePreference): AI => {
  if (preference === "on-device") {
    return getAI(onDeviceFirebaseApp, { backend: new GoogleAIBackend() });
  }
  ensureAppCheck();
  return getAI(firebaseApp, { backend: new GoogleAIBackend() });
};

let onDeviceImageModel: GenerativeModel | undefined;
let cloudImageModel: GenerativeModel | undefined;

/** Image descriptions on this device only. */
const getOnDeviceImageModel = (): GenerativeModel => {
  assertOnDeviceRuntime();
  onDeviceImageModel ??= getGenerativeModel(getFirebaseAI("on-device"), {
    mode: InferenceMode.ONLY_ON_DEVICE,
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
  return onDeviceImageModel;
};

/** Image descriptions in the cloud. Reachable only through describeImageInCloud(consent). */
const getCloudImageModel = (): GenerativeModel => {
  cloudImageModel ??= getGenerativeModel(getFirebaseAI("in-cloud"), {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: cloudModelName,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: altTextResponseSchema,
      },
    },
  });
  return cloudImageModel;
};

const pngDataUrlPrefix = "data:image/png;base64,";

const buildImageParts = (input: Readonly<ImageDescriptionInput>): Part[] => {
  if (!input.imageDataUrl.startsWith(pngDataUrlPrefix)) {
    throw new Error("The image crop is not a valid PNG capture.");
  }

  const data = input.imageDataUrl.slice(pngDataUrlPrefix.length);
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/u.test(data)) {
    throw new Error("The image crop contains invalid image data.");
  }

  return [
    { type: "text", text: buildAltTextPrompt(input.page, input.image) },
    { type: "inlineData", inlineData: { mimeType: "image/png", data } },
  ];
};

const toImageDescriptionResult = (
  text: string,
  source: InferenceSource | undefined,
): ImageDescriptionResult => ({
  ...parseGeneratedAltText(text),
  source: source ?? "unknown",
});

const assertInferenceSource = (
  expected: InferenceSource,
  actual: InferenceSource | undefined,
): void => {
  if (actual !== expected) {
    throw new InferenceSourceMismatchError(expected, actual);
  }
};

export const prepareOnDeviceImageModel = async (
  onProgress?: (progress: number) => void,
): Promise<DevicePreparation> => {
  try {
    // The SDK call is reached before the first await, so callers can start it
    // directly inside a user gesture. ONLY_ON_DEVICE throws when unavailable.
    await getOnDeviceImageModel().initializeDeviceModel(onProgress);
    return { deviceReady: true };
  } catch (error: unknown) {
    return {
      deviceReady: false,
      error: error instanceof Error ? error : new Error("On-device AI is unavailable."),
    };
  }
};

export const describeImageOnDevice = async (
  input: ImageDescriptionInput,
): Promise<ImageDescriptionResult> => {
  const result = await getOnDeviceImageModel().generateContent(buildImageParts(input));
  assertInferenceSource(InferenceSourceValue.ON_DEVICE, result.response.inferenceSource);
  return toImageDescriptionResult(result.response.text(), result.response.inferenceSource);
};

/** Sends exactly the payload the user approved, and nothing else. */
export const describeImageInCloud = async (
  consent: CloudConsent,
): Promise<ImageDescriptionResult> => {
  const result = await getCloudImageModel().generateContent(buildImageParts(consent.input));
  assertInferenceSource(InferenceSourceValue.IN_CLOUD, result.response.inferenceSource);
  return toImageDescriptionResult(result.response.text(), result.response.inferenceSource);
};

export const runTextProbe = async (
  preference: InferencePreference,
  onProgress?: (progress: number) => void,
): Promise<TextProbeResult> => {
  if (preference === "on-device") assertOnDeviceRuntime();
  const model = getGenerativeModel(getFirebaseAI(preference), {
    mode:
      preference === "on-device"
        ? InferenceMode.ONLY_ON_DEVICE
        : InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: cloudModelName },
  });

  if (preference === "on-device") await model.initializeDeviceModel(onProgress);
  const result = await model.generateContent("Reply with exactly: Clariway AI is ready.");
  const expectedSource = preference === "on-device"
    ? InferenceSourceValue.ON_DEVICE
    : InferenceSourceValue.IN_CLOUD;
  assertInferenceSource(expectedSource, result.response.inferenceSource);

  return {
    text: result.response.text().trim(),
    source: result.response.inferenceSource ?? "unknown",
  };
};
