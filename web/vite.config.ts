import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '127.0.0.1', port: 5180, strictPort: true,
    proxy: {
      '/py': { target: 'http://127.0.0.1:8100', rewrite: (value) => value.replace(/^\/py/, '') },
      '/api': { target: 'http://127.0.0.1:3101', rewrite: (value) => value.replace(/^\/api/, '') },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
})
