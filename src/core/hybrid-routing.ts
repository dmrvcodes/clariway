import type { ImageDescriptionInput } from "./alt-text";

/**
 * Routing policy for image descriptions.
 *
 * 1. The on-device model is always tried first and never falls back on its own
 *    (Firebase AI Logic `ONLY_ON_DEVICE`).
 * 2. If local AI is unavailable or fails, nothing leaves the browser. The user
 *    sees the exact crop and page text, then decides whether to use the cloud.
 * 3. The cloud request (`ONLY_IN_CLOUD`) accepts only a `CloudConsent`, which
 *    carries the approved payload, so it cannot send anything else.
 */
export type CloudConsentReason = "device-unavailable" | "device-failed" | "second-opinion";

export interface DevicePreparation {
  deviceReady: boolean;
  error?: Error;
}

export type OnDeviceOutcome<T> =
  | { kind: "described"; result: T }
  | {
      kind: "needs-cloud-consent";
      reason: Exclude<CloudConsentReason, "second-opinion">;
      detail: string;
    };

export interface OnDeviceRoutingOptions {
  /** Bounds an SDK call that currently has no cancellation API. */
  timeoutMs?: number;
}

export const DEFAULT_ON_DEVICE_TIMEOUT_MS = 45_000;

export class OnDeviceTimeoutError extends Error {
  readonly code = "ON_DEVICE_TIMEOUT";

  constructor(timeoutMs: number) {
    super(
      `On-device AI did not respond within ${Math.ceil(timeoutMs / 1_000)} seconds. Nothing was sent.`,
    );
    this.name = "OnDeviceTimeoutError";
  }
}

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export const describeOnDeviceFirst = async <T>(
  preparation: DevicePreparation,
  runOnDevice: () => Promise<T>,
  options: OnDeviceRoutingOptions = {},
): Promise<OnDeviceOutcome<T>> => {
  if (!preparation.deviceReady) {
    return {
      kind: "needs-cloud-consent",
      reason: "device-unavailable",
      detail: errorMessage(preparation.error, "On-device AI is unavailable in this browser."),
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_ON_DEVICE_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("The on-device timeout must be a positive finite number.");
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await new Promise<T>((resolve, reject) => {
      timeoutId = setTimeout(() => reject(new OnDeviceTimeoutError(timeoutMs)), timeoutMs);
      void runOnDevice().then(resolve, reject);
    });
    return { kind: "described", result };
  } catch (error: unknown) {
    return {
      kind: "needs-cloud-consent",
      reason: "device-failed",
      detail: errorMessage(error, "On-device AI could not describe this image."),
    };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
};

declare const cloudConsentBrand: unique symbol;

/** Proof that the user approved sending exactly this payload to the cloud model. */
export interface CloudConsent {
  readonly input: Readonly<ImageDescriptionInput>;
  readonly grantedAt: number;
  readonly [cloudConsentBrand]: true;
}

/**
 * Create only from the user's explicit "Send to cloud" action. The consent keeps
 * a frozen copy of the approved fields, so later state changes cannot widen it.
 */
export const grantCloudConsent = (
  input: ImageDescriptionInput,
  grantedAt: number = Date.now(),
): CloudConsent =>
  Object.freeze({
    input: Object.freeze({
      page: Object.freeze({
        title: input.page.title,
        description: input.page.description,
      }),
      image: Object.freeze({
        nearbyText: input.image.nearbyText,
        isInteractive: input.image.isInteractive,
        width: input.image.width,
        height: input.image.height,
      }),
      imageDataUrl: input.imageDataUrl,
    }),
    grantedAt,
  }) as CloudConsent;
