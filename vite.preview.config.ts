import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Single-file build for embedding the app as a preview page (see scripts/build-preview.mjs).
export default defineConfig({
  plugins: [vue(), tailwindcss(), viteSingleFile()],
  define: { 'import.meta.env.VITE_EMBED': JSON.stringify('1') },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: { outDir: 'dist-preview', emptyOutDir: true },
})
