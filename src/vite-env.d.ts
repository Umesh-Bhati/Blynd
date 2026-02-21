/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_AUTH?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_REMOTE_BRAIN_URL?: string;
  readonly VITE_REMOTE_BRAIN_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __TAURI_INTERNALS__?: unknown;
}
