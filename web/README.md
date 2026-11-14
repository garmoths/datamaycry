# web — Data May Cry frontend

Vite + React + TypeScript. The globe, panels, chart and result card live here.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: data.ts + stats parity
npm run build
```

**Rule:** UI code gets data **only** from `src/data.ts`. Never fetch files in `public/data/` directly.
`public/data/` holds mock files today; on Day 2 they are swapped for real ones without touching UI code.
See `../contract/README.md`.
