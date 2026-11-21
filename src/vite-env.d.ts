/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_CHECK_DEBUG?: string;
  readonly VITE_RECAPTCHA_ENTERPRISE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
