/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PORTAL_API?: string;
  readonly VITE_PORTAL_ORIGIN?: string;
  readonly VITE_DEMO?: string;
  readonly VITE_PUBLIC_ORIGIN?: string;
  readonly VITE_WHATSAPP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
