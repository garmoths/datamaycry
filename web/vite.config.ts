import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

// MapLibre 6 runs its code in a self-contained worker file. Vite's dev transform
// breaks that file, so we serve it untouched at /maplibre-worker/ (dev) and copy it
// into dist/ (build). Globe.tsx points MapLibre there with setWorkerUrl().
function maplibreWorker(): Plugin {
  const file = 'maplibre-gl-worker.mjs'
  const source = () =>
    readFileSync(fileURLToPath(new URL(`./node_modules/maplibre-gl/dist/${file}`, import.meta.url)))
  return {
    name: 'maplibre-worker',
    configureServer(server) {
      server.middlewares.use(`/maplibre-worker/${file}`, (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript')
        res.end(source())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: `maplibre-worker/${file}`, source: source() })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), maplibreWorker()],
})
