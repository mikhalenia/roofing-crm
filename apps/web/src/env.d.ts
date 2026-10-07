/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PIPELINE_API?: string;
  readonly VITE_CRM_API?: string;
  readonly VITE_USE_STUB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
