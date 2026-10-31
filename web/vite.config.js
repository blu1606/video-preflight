import path from 'node:path'
import fs from 'node:fs/promises'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// json-server (data) on 3101, FastAPI (analysis + media) on 8100; env overrides run a second lab side by side.
const DB = process.env.LAB_DB_URL ?? 'http://localhost:3101'
const API = process.env.LAB_API_URL ?? 'http://localhost:8100'

const json = (res, status, body) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

// `/` is the React app. The mockup-v2 design reference stays at /mockup-v2/ and still calls the two
// endpoints below (public/mockup-v2/js/live-v2-adapter.js); the React app uses neither.
const mockupSupport = {
  name: 'mockup-v2-support',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const pathname = req.url ? req.url.split('?')[0] : ''
      if (pathname === '/mockup-v2') {
        res.statusCode = 302
        res.setHeader('Location', '/mockup-v2/')
        res.end()
        return
      }
      if (pathname === '/mockup-v2/') {
        try {
          const html = await fs.readFile(path.resolve(import.meta.dirname, './public/mockup-v2/index.html'), 'utf-8')
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.end(html)
        } catch (err) {
          res.statusCode = 500
          res.end(`Error loading mockup-v2: ${err.message}`)
        }
        return
      }
      if (pathname === '/api/catalog') {
        try {
          const dir = path.resolve(import.meta.dirname, './public/bundles/final-v1')
          const read = (f) => fs.readFile(path.join(dir, f), 'utf-8').then(JSON.parse)
          const [catalog, charts, summary, manifest] = await Promise.all(
            ['catalog.json', 'charts.json', 'summary.json', 'manifest.json'].map(read),
          )
          json(res, 200, { catalog, charts, summary, manifest })
        } catch (err) {
          json(res, 500, { error: { message: err.message } })
        }
        return
      }
      if (pathname === '/api/live/health') {
        json(res, 200, { ok: true, provider: { consent: 'Local Video Intelligence Lab · JSON Server & FastAPI active' } })
        return
      }
      next()
    })
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mockupSupport],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    port: Number(process.env.LAB_WEB_PORT ?? 5180),
    strictPort: true,
    proxy: {
      '/api': { target: DB, rewrite: (p) => p.replace(/^\/api/, '') },
      '/py': API,
      '/media': API,
    },
  },
})
