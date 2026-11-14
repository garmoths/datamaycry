# Contract changelog

Rules: adding a field → minor (1.x). Removing/renaming → major (2.0), Enes + Rumet agree.
One PR per change: `types.ts` + `schema/` + `worker/mock.py` + `web/src/data.ts` + this file.

## 1.4 — 2026-11-14 (additions only)
- `anomaly_frames/{VAR}.bin` (`AnomalyFramesHeader`): one map per year (1980–2025) of the yearly mean
  anomaly vs the 1991–2020 normal, for the "time travel" animation. Grid in the header
  (real data 1° × 1.25° = 2×2 MERRA cells; mock data coarser). Fixed colour scale `color_max`.
- `data.ts`: `getAnomalyFrames(var)` → `AnomalyFrames`.

## 1.3 — 2026-11-14 (additions only)
- `regions/badges.json` (`BadgesFile`): independent-source checks per region.
  `GPCP` = NASA GPCP v3.3 precipitation (1983–2025), `GHCN` = NOAA GHCN-M v4 station
  temperature (1980–2025). Status `agree` / `disagree` / `inconclusive`; rule in `types.ts`,
  fixed before any badge was computed.
- `data.ts`: `getBadges(regionId)`, `loadBadges()`. `Series.region` is set for region series.
- `analyzeTrend` adds `badges` and lowers "strong" to "possible" (`cappedReason: "badge_disagree"`)
  when a badge disagrees and the analysed years cover ≥ 80% of the badge's years.
  `cappedReason: "experimental"` for experimental variables.
- Real results: stations agree in 954 / 1,013 regions (94%; all 36 Turkish stations together,
  Diyarbakır, Konya, Ankara agree). GPCP agrees in 2,793, disagrees in 811, inconclusive 1,257.
  Global T2M vs NASA GISTEMP: agree (+0.16 vs +0.21 °C/decade, r = 0.97).
- UI to do (Rumet): show badges on the card ("✔ consistent with NOAA stations",
  "✔ consistent with NASA GPCP", "⚠ independent source disagrees") and explain `cappedReason`.

## 1.2 — 2026-11-14 (additions only)
- Continents: `RegionIndexFile.continents` (id, name, camera `bbox`, `cells`) and
  `regions/continents.bin` (header `country: "continents"`, `level: "continent"`).
  New `data.ts` function: `getContinentSeries(continent, var)`. Ids: AF AN AS EU NA OC SA.
  Natural Earth puts Russia in Europe.
- `CountryInfo.continent`, `CountryInfo.cells`.
- `Admin1Info.cells` (area in grid-cell equivalents) and `Admin1Info.low_resolution`
  (< 1 cell). 49% of the world's 4,596 provinces are below one cell; in Turkey:
  Yalova, Kilis, Bartın, Osmaniye, Düzce. UI: show "low resolution: value is a blend of
  neighbouring cells" on those cards.
- Province ids: ISO 3166-2 when valid and unique, else Natural Earth `adm1_code`
  (ISO codes repeat 95 times worldwide). All 81 Turkish provinces use ISO codes.

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
