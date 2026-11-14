/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public URL of the real data on Cloudflare R2. Unset → mock data in public/data. */
  readonly VITE_DATA_URL?: string;
  /** Optional separate URL for Point-mode tiles. */
  readonly VITE_TILES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
