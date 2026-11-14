# Contract changelog

Rules: adding a field → minor (1.x). Removing/renaming → major (2.0), Enes + Rumet agree.
One PR per change: `types.ts` + `schema/` + `worker/mock.py` + `web/src/data.ts` + this file.

## 1.1 — 2026-11-14 (additions only)
- `VariableInfo.experimental?: boolean` — variable has known data-quality problems.
  `analyzeTrend` never returns `level: "strong"` for it; the card must show `caveat`.
  RUNOFF is experimental: in ~1,200 cells monthly runoff is far above precipitation,
  more often after 2016 (found by `worker/check_raw.py`).
- `VariableInfo.source_field?: string` — the MERRA-2 field actually used when it differs
  from `id`. Not used for now: PRECTOT stays model precipitation. Compared with NASA GPCP v3.3
  (1983–2025, 10 regions), PRECTOT matched GPCP's trend sign in 9/10 regions vs 5/10 for
  PRECTOTCORR, and its trends were 2.5× closer (`worker/compare_precip.py`).
- `TrendResult.capped?: boolean` — true when "strong" was lowered because of `experimental`.
- UI to do (Rumet): when `capped` or `experimental`, show the caveat under the card.
- Behaviour (no type change): `analyzeTrend` gives "possible" or "strong" only when the
  autocorrelation-corrected 95% CI excludes 0. Real data had "strong" cards whose CI
  included 0 (Amazon precipitation, CI −0.70…+0.02). Calibration after the change
  (trend-free AR(1) φ=0.6, 1,500 runs): possible-or-strong 5.0%, strong 0.47%.
  Same rule in `worker/protocol.py`; 80-case Python↔JS parity test passes.

## 1.0 — 2026-11-14 (draft, waiting for Rumet's approval)
- `variables.json`, `regions/index.json` (JSON)
- `regions/{COUNTRY}.bin`, `trend_map/{VAR}.bin`, `tiles/{VAR}/{ty}_{tx}.bin` (DMC1 binary, int16)
- `data.ts` API: `loadVariables`, `listCountries`, `getRegionSeries`, `getPointSeries`,
  `getTrendMap`, `analyzeTrend`, `anomalies`, `monthLabels`
- Planned 1.x additions: validation badges (GHCN station, ERA5, GISTEMP), jump flag

<!-- Freeze: after Day 1 12:30 only additions (1.x). Write "FROZEN" here when frozen. -->
