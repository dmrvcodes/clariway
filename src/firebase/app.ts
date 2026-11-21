import { getApps, initializeApp, type FirebaseApp } from "@firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyC0HAyICAMBGhyzj6-lPdKekKQB-gOMcl8",
  authDomain: "clariway-1262e.firebaseapp.com",
  projectId: "clariway-1262e",
  storageBucket: "clariway-1262e.firebasestorage.app",
  messagingSenderId: "594358198581",
  appId: "1:594358198581:web:213b0ec8d77cc292592c7c",
} as const;

const defaultAppName = "[DEFAULT]";
const onDeviceAppName = "clariway-on-device";

const getOrInitializeApp = (name: string): FirebaseApp =>
  getApps().find((app) => app.name === name) ??
  initializeApp(firebaseConfig, name === defaultAppName ? undefined : name);

/** Cloud requests: protected by App Check. */
export const firebaseApp = getOrInitializeApp(defaultAppName);

/**
 * On-device inference only. This instance never initializes App Check, so
 * local work makes no Firebase network request. Firebase AI Logic reads App
 * Check once when its AI instance is created, so the two paths stay separate.
 */
export const onDeviceFirebaseApp = getOrInitializeApp(onDeviceAppName);
