# web — Data May Cry frontend

Vite + React + TypeScript. The globe, panels, chart and result card live here.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: data.ts + stats parity
npm run build
```

**Rule:** UI code gets data **only** from `src/data.ts`. Never fetch files in `public/data/` directly.
`public/data/` holds the mock files for local development and tests; the real data comes from R2 (`VITE_DATA_URL`), and a build with it set leaves `public/data/` out. Map borders (real, Natural Earth) are in `public/boundaries/`.
See `../contract/README.md`.
