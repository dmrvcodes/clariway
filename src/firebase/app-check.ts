import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "@firebase/app-check";
import { firebaseApp } from "./app";

let wasInitialized = false;

const getConfigurationError = (): Error =>
  new Error(
    "App Check is not configured. Add a private .env.local file from .env.example, then rebuild the extension.",
  );

/**
 * Firebase AI Logic requires App Check. During extension development Firebase's
 * debug provider is selected before the supplied provider is invoked. A real
 * web release must use an approved production attestation provider instead.
 */
export const ensureAppCheck = (): void => {
  if (wasInitialized) {
    return;
  }

  const debugEnabled = import.meta.env.VITE_APP_CHECK_DEBUG === "true";
  const siteKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;

  if (!debugEnabled && !siteKey) {
    throw getConfigurationError();
  }

  if (debugEnabled) {
    (
      globalThis as typeof globalThis & {
        FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean;
      }
    ).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(siteKey ?? "debug-provider"),
    isTokenAutoRefreshEnabled: true,
  });

  wasInitialized = true;
};
