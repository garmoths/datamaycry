import react from '@vitejs/plugin-react'
import { readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
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

// The public API (web/api/v1/*.ts) runs as Vercel functions in production. In `npm run dev`
// the same handlers answer /api/v1/* here, reading the data the dev server serves
// (VITE_DATA_URL, e.g. /pkg/ for the real package, otherwise the mock files in /data/).
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        const m = url.match(/^\/api\/v1\/(variables|places|trend|series)(\?.*)?$/)
        if (!m) return next()
        try {
          const port = server.config.server.port ?? 5173
          process.env.DATA_ORIGIN ??= `http://localhost:${port}${process.env.VITE_DATA_URL || '/data/'}`
          const mod = await server.ssrLoadModule(`/api/v1/${m[1]}.ts`)
          const r: Response = await mod.default(new Request(`http://localhost:${port}${url}`))
          res.statusCode = r.status
          r.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(await r.text())
        } catch (e) {
          res.statusCode = 500
          res.end(String(e))
        }
      })
    },
  }
}

// public/data holds the MOCK files for local development and tests. A build that reads the
// real data (VITE_DATA_URL set, e.g. on Vercel) must not ship them: drop dist/data.
function dropMockData(): Plugin {
  let outDir = ''
  return {
    name: 'drop-mock-data',
    apply: 'build',
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir)
    },
    closeBundle() {
      // public/pkg is a local, gitignored link to the real package (dev only): never ship it
      rmSync(path.join(outDir, 'pkg'), { recursive: true, force: true })
      if (!process.env.VITE_DATA_URL) return
      rmSync(path.join(outDir, 'data'), { recursive: true, force: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), maplibreWorker(), devApi(), dropMockData()],
})
