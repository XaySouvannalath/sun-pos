/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "http" (default) calls the API over the network; "local" runs the mock API in the browser. */
  readonly VITE_API_MODE?: 'http' | 'local'
  /** Base URL of the API, e.g. "https://pos.example.com/api/v1". Defaults to "/api/v1". */
  readonly VITE_API_URL?: string
  /** Dev server only: proxy /api to this backend instead of running the mock API. */
  readonly VITE_API_PROXY?: string
  /** Set to "1" by the single-file preview build. */
  readonly VITE_EMBED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
