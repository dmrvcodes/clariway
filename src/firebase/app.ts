import { getApp, getApps, initializeApp } from "@firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyC0HAyICAMBGhyzj6-lPdKekKQB-gOMcl8",
  authDomain: "clariway-1262e.firebaseapp.com",
  projectId: "clariway-1262e",
  storageBucket: "clariway-1262e.firebasestorage.app",
  messagingSenderId: "594358198581",
  appId: "1:594358198581:web:213b0ec8d77cc292592c7c",
} as const;

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
