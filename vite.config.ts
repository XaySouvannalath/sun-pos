import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import vueDevTools from 'vite-plugin-vue-devtools'
import { mockApi } from './src/mock/node/vite-plugin.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Point the app at a real backend with VITE_API_PROXY (dev server proxies /api)
  // or VITE_API_URL (the app calls that URL directly). Otherwise the mock API runs.
  const proxy = env.VITE_API_PROXY
  const useMock = !proxy && !env.VITE_API_URL && env.VITE_API_MODE !== 'local'

  return {
    plugins: [vue(), tailwindcss(), vueDevTools(), useMock && mockApi()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: proxy ? { proxy: { '/api': { target: proxy, changeOrigin: true } } } : undefined,
    preview: proxy ? { proxy: { '/api': { target: proxy, changeOrigin: true } } } : undefined,
  }
})
