# Contract changelog

Rules: adding a field → minor (1.x). Removing/renaming → major (2.0), Enes + Rumet agree.
One PR per change: `types.ts` + `schema/` + `worker/mock.py` + `web/src/data.ts` + this file.

## 1.0 — 2026-11-14 (draft, waiting for Rumet's approval)
- `variables.json`, `regions/index.json` (JSON)
- `regions/{COUNTRY}.bin`, `trend_map/{VAR}.bin`, `tiles/{VAR}/{ty}_{tx}.bin` (DMC1 binary, int16)
- `data.ts` API: `loadVariables`, `listCountries`, `getRegionSeries`, `getPointSeries`,
  `getTrendMap`, `analyzeTrend`, `anomalies`, `monthLabels`
- Planned 1.x additions: validation badges (GHCN station, ERA5, GISTEMP), jump flag

<!-- Freeze: after Day 1 12:30 only additions (1.x). Write "FROZEN" here when frozen. -->
