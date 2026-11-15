# New features plan: fingerprint, change onset, rankings, monthly change, PDF report

Prepared by: Rumet (interface), with Claude's help. Date: 2026-11-14.
Scope: 5 features (numbers from the list in the conversation).

| # | Feature | One sentence |
|---|---|---|
| 1 | **Climate fingerprint** | A place's trend in all 9 variables in one table + what they say together + "similar places" |
| 2 | **Change onset** | Finds the year the change sped up or changed direction and marks it on the chart |
| 4 | **Rankings** | Tables like "Türkiye's fastest-warming provinces"; clicking goes to that place |
| 5 | **Change by month** | A separate trend for each of the 12 months: "Summers are warming the most" |
| 6 | **PDF report** | A 1–2 page downloadable report with references for the selected place |

Everything stays **static** (no server, PLAN.md decision #7). Computations run in the browser with the existing `data.ts`
functions. The only thing that touches the contract is an optional 1.5 addition (§7).

---

## 0. Where things stand today (the facts the plan rests on)

- **Places with a monthly series:** `getRegionSeries` (country/province), `getContinentSeries` (continent),
  `getPointSeries` (grid cell). A region file (`regions/{COUNTRY}.bin`) contains a country
  **itself, all its provinces and all variables** (`RegionHeader.vars`).
- **In the real data every place has a series.** `worker/package.py` writes
  `regions/{COUNTRY}.bin` for every country (the country + all its provinces). The fake data only has TUR, EGY, BRA and
  9 provinces. So "only 9 of 4,596 provinces have a series" describes **the fake data**; once the real data
  arrives every province gets the full computed card. This plan is written to work in both cases:
  the series if there is one, otherwise the trend map.
- **Places without a series:** the world trend map `trend_map/{VAR}.bin` (slope, p, level, FDR;
  per cell). **1.66 MB** per variable, 9 variables ≈ **15 MB**.
- **Ready-made computations:** `analyzeTrend(series, {startYear, endYear, months})`,
  `robustness(...)`, `emergence(...)` (Enes), `summarize / summarizeCells / cellsInside`
  (continentStats.ts), `diagnose` (diagnostics.ts), `mannKendall / senSlope / lag1 / loess`
  (stats.ts).
- **Ready-made grids:** `rasterizeCountries`, `rasterizeContinents` (computed once in App.tsx),
  province cells via `cellsInside(feature)`.
- **UI locations:** right panel cards (`Panel.tsx`), left drawer tabs
  (`DrawerTab = "chart" | "explore" | "sources"`), chart (`Chart.tsx`, Plotly),
  small chart (`Sparkline`, Evidence.tsx).

---

## 1. Shared infrastructure (this first, ~1 hour)

Features 1, 4 and 6 use the same two pieces; they are written once.

### 1.1 `trendStack.ts`: all 9 trend maps at once
- `loadTrendStack(): Promise<Record<VarId, TrendMap>>`: loads the 9 maps in parallel **on demand**
  (when the fingerprint or ranking is first opened) and caches them.
  `getTrendMap` is already cached; this just requests them all together.
- Not loaded at startup (15 MB). While loading, an Amicro text-shimmer shows "Loading maps…".
- `scaleOf(var)`: the **95th percentile** of the absolute cell slopes for each variable.
  Makes different units (°C, mm/day, kg/m²) comparable (§2.3). Computed once per variable.

### 1.2 `areaStats.ts`: region summaries in one pass
- `summarizeByGrid(map, grid, nIds)`: for **every** region in the grid in a single pass (207,936
  cells, ~5 ms): area-weighted mean slope, share of strong increase/decrease, FDR share, cell count.
  Today's `summarize` walks the whole grid per region; instead of walking it 242 times for 242 countries,
  once.
- `provinceCells(countryId)`: the cell lists of a country's provinces (`cellsInside`), cached per
  country.
- Test: the `summarizeByGrid` result must match `summarize` exactly for every region.

---

## 2. Feature 1: Climate fingerprint (~3–4 hours)

### 2.1 What you see
In the right panel, right below the result card, a **"Climate fingerprint"** section:

```
Variable          Dir   Size (relative)          Evidence
Air temperature   ▲     ███████████░░  +0.61 °C   strong
Soil moisture     ▼     ██████░░░░░░░  −0.8 %     possible
Precipitation     –     █░░░░░░░░░░░░  +0.01 mm   none
…(9 rows, variable groups separated)
```
- Clicking a row switches to that variable (same as picking it in the bottom bar).
- Below it, **interpretation sentences** (§2.4) and a **"Similar places"** list (§2.5).

### 2.2 Where the data comes from
| Place | Source | Computation |
|---|---|---|
| With a series (province/country/continent/cell) | the same region file, 9 variables | `analyzeTrend` for each variable (same period and season settings) |
| Without a series | the 9 trend maps (§1.1) | `summarizeCells` / `summarizeByGrid` |

A small label next to the row names the source: "monthly series" or "trend map".
`land_only` variables stay empty over the sea ("no data"), never counted as 0.

### 2.3 Relative size (comparing units)
- `relative = slope / scaleOf(var)`, clipped at ±1.5. This is the bar length.
- The real value and unit are always written next to it; the bar only answers "is this big or
  small for this variable". Explanation: "The bar shows how big the change is compared with that
  variable's changes across the world."

### 2.4 Interpretation rules (what they say together)
A **fixed rule table** in `content.ts`, TR/EN, with no causal claims ("seen together", not
"causes"). A rule only fires if all the variables involved have **at least "possible"**
evidence. The experimental variable (RUNOFF) can never be the **only** basis of a rule.

| Rule | Condition | Sentence (EN) |
|---|---|---|
| Warming + drying | T2M ▲ and GWETROOT ▼ | "Warming and drying soil are seen together." |
| Warming + snow loss | T2M ▲ and SNOMAS ▼ | "Snow cover is shrinking as it warms." |
| Wetting | PRECTOT ▲ and GWETROOT ▲ | "Precipitation and soil moisture are rising together." |
| Drying, precipitation flat | GWETROOT ▼ and PRECTOT "none" | "The soil is drying while precipitation shows no clear change." |
| Humid warming | T2M ▲ and QV2M ▲ | "The air is both warming and carrying more moisture." |
| Steady | all "none" | "No variable shows a clear change in this period." |

The rule order is fixed; at most 2 sentences are shown. Sentences that appear on fake data come from
made-up patterns; the "FAKE DATA" label is already visible.

### 2.5 Similar places
- The comparison uses **the trend map on both sides** (1980–2025, area-weighted mean slope).
  The series results on the selected place's card depend on the period and season the user picked;
  the candidates' don't. To avoid comparing two different measures, the similarity computation uses
  the map values for the selected place too.
- Each place's fingerprint = a vector of 9 relative slopes (variables without data are skipped).
- Similarity = **cosine similarity** between vectors, only over variables that have data in both
  places; at least 5 shared variables required.
- **Near-zero vectors are dropped:** if the vector length is below 0.3 (nothing changes clearly),
  cosine is noise; no "similar places" are shown for that place, and it is removed from the candidates.
- Candidate pool:
  - **v1 (browser):** 242 countries (single pass with `summarizeByGrid`) + the open country's provinces.
  - **v2 (worker, optional):** ready-made fingerprints for all 4,596 provinces (§7).
- Places smaller than 3 cells don't enter the pool (noisy).
- Display: top 5 places, similarity percentage, click to go there. Note: "A similar trend does not
  mean a similar climate."

### 2.6 Tests
- Relative size: known scale → known bar; clipping works.
- Rules: a triggering and a non-triggering synthetic example for each rule; RUNOFF alone doesn't
  trigger a rule; variables below "possible" are excluded.
- Similarity: symmetric, 100% with itself, no result if fewer than 5 shared variables.

### 2.7 Done when
- For a place with and a place without a series, the 9 rows arrive with the right source; clicking a
  row changes the variable; interpretation sentences only appear when a rule matches; similar places
  are clickable; TR/EN; single column on phones.

---

## 3. Feature 2: Change onset (~3 hours, the riskiest, cut if needed)

### 3.1 What it does
Next to "increasing", it builds a sentence like **"the increase sped up after about 1998"**
and marks that year on the chart with a vertical line. It gives the slopes before and after side by side.

### 3.2 Why not Pettitt
The first draft used the Pettitt test. Pettitt looks for a **level jump**; on a steadily rising series
its statistic peaks in the middle year and gives a small p. So every strongly warming place would
show "a break around 2002". That would be a false finding. Rejected.

### 3.3 Method: slope change test
- Question: "One straight trend, or a two-piece (broken line) trend that bends in one year?"
- On the annual mean anomalies (the series the trend test uses, `TrendResult.annual`):
  1. **One piece:** linear trend, residual sum of squares SSE₁.
  2. **Two pieces:** a continuous broken line for break year b (the slope changes at b, no jump);
     at least 10 years on each side; pick the b with the smallest SSE₂(b).
  3. Statistic: `F = (SSE₁ − SSE₂) / SSE₂ · (n − 3)`.
- **p-value by simulation under a straight trend + autocorrelation** (parametric bootstrap):
  estimate the one-piece trend and the AR(1) coefficient of the residuals; generate 500 fake series
  from this model; compute the same maximum F on each; p = share exceeding the real F.
  This way a steadily rising series comes out "no break"; a finding appears only if the slope really changed.
  ~10–20 ms per place in the browser.
- A label only if p < 0.05 **and** the direction of the slope difference is significant: "sped up",
  "slowed down" or "changed direction". Otherwise nothing is written.
- The code lives in a separate file, `changepoint.ts`. It doesn't go into `stats.ts`: that file's header
  promises results identical to Python, and this test has no Python counterpart.

### 3.4 Calibration (required before release)
Three null scenarios, 1,000 repetitions each, 46 years:
| Scenario | Expected | Target |
|---|---|---|
| No trend, AR(1) φ = 0.6 | no break | false alarm ≤ 5% |
| **Straight trend + AR(1) φ = 0.6** | no break | false alarm ≤ 5% (Pettitt would collapse here) |
| Trend whose slope triples in 1998 | break ~1998 | detection ≥ 70%, year within ±4 |
Results are written to this file. If the targets aren't met, the feature is cut.

**Result (2026-11-14, `changepoint.test.ts`, 150 bootstrap series in the test, 500 in the app):**
| Scenario | Result | Target |
|---|---|---|
| No trend, AR(1) φ = 0.6 (300 repetitions) | 10/300 = **3.3%** false alarms | ≤ 5% ✅ |
| Straight trend (+0.4/decade) + AR(1) φ = 0.6 (300 repetitions) | 15/300 = **5.0%** false alarms | ≤ 5% ✅ |
| Slope becomes 6× in 1998, AR(1) φ = 0.3 (150 repetitions) | **95%** detected, **86%** of those with the year within ±4 | ≥ 70% ✅ |
~40 ms per place in the app. Not computed while the time travel is playing.

### 3.5 How it differs from Enes's `emergence()` function
- `emergence`: "from which year does the test become significant" (when the evidence emerges).
- This feature: "in which year did the rate of change change". They are separate sentences on the card; not mixed up.

### 3.6 Where it appears
- One line on the result card: "The increase sped up after ~1998: +0.1 before, +0.5 °C/decade after
  (p = 0.01)."
- A vertical dashed line on the `Sparkline` and the big chart (`Chart.tsx`, Plotly `shapes`).
- In the PDF report (§6).
- Everywhere with a monthly series (everywhere in the real data). Not in trend map summaries.

### 3.7 Tests
- The three scenarios in §3.4 (slow test, separate file).
- One side of the break < 10 years → no result.
- Same seed gives the same p (reproducible randomness).

---

## 4. Feature 4: Rankings (~2 hours)

### 4.1 What you see
A new tab in the left drawer, **"Ranking"** (`DrawerTab` + `"rank"`):
- Scope: **world / continent → countries**, **selected country → provinces**.
- Measure: mean slope (default) or "share of area with strong evidence".
- Direction: "most increasing" / "most decreasing" button.
- Row: rank, name, bar, value + unit, strong evidence share, low-resolution marker.
- Clicking a row goes to that place (the existing `pickCountry` / `pickAdmin1`).

Also a small badge on the result card: **"12th fastest-warming of 81 provinces"** (links to the
ranking tab).

### 4.2 Data and computation
- **Provinces (within a country):** **monthly series** first. The country's single file contains all
  provinces; `analyzeTrend` for each province (81 provinces × 46 years, a few ms). This way the ranking
  and the number on that province's card are **the same**. Without a series (most countries in the fake
  data), the trend map: `provinceCells(countryId)` + `summarizeCells`.
- **Countries:** trend map + `countryGrid` → `summarizeByGrid` (single pass), instead of downloading
  242 country files. From the 1.5 contract if it arrives (§7).
- **Small places, measured:** of Türkiye's 81 provinces, by number of cell centers, 3 have 0,
  15 have 1, 22 have 2, 16 have 3, and 25 have 4 or more cells. So a "no ranking below 3 cells"
  rule would drop half the provinces; **it is not used**. Instead:
  when ranking from series, no province is dropped (the series is the area-weighted mean of the province);
  when ranking from the map, provinces with 0 cells take the nearest cell (the `cellsInside` fallback)
  and carry a `low_resolution` marker.
- The badge writes the real number ranked: "12th **of N provinces**" (not always 81).
- A note line says whether the ranking came from series or from the map.

### 4.3 Tests
- `summarizeByGrid` ↔ `summarize` equality (§1.2).
- Sort direction and stable order for ties; small places being left out.

---

## 5. Feature 5: Change by month (~1.5 hours)

### 5.1 What it does
A separate trend for each of the 12 months:
`Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec` tiles, on **the same color scale** as the trend map;
opacity = evidence. Below, one sentence: "It increases most in July–August; no clear change in
January."

### 5.2 Method
- For each month `analyzeTrend(series, { months: [m] })` (existing function, no code change).
- **Because 12 tests are run at once**, labels are corrected with Benjamini-Hochberg (q = 0.05) across
  the 12 months. The same method we use on the world map (PLAN §3.5 step 5).
- Months that return `constant` (e.g. no snow in summer) are grey and say "not changing", never counted as 0.

### 5.3 Where it appears
- A strip under the computation card in the right panel.
- An optional **year × month heat map** (46 × 12 anomalies) in the big chart tab.
  The monthly version of Enes's climate stripes chart.
- Only for places with a monthly series.

### 5.4 Tests
- A synthetic series with a trend only in summer months → only Jun–Aug significant.
- BH correction: a known result from 12 p-values.

---

## 6. Feature 6: PDF report (~2–3 hours)

### 6.1 Approach
The browser's **print → save as PDF**, with a separate report layout.
- No new library. Text is selectable and crisp, charts are vector (SVG).
- jsPDF + html2canvas rejected: big package, text turns into images, blurry.

### 6.2 Contents (A4, 1–2 pages)
1. Title: place, variable, period, season, creation date, data version (a large **DEMO DATA**
   watermark on fake data).
2. **Finding sentence** (plain language) + a table of the main numbers (slope, 95% interval, p, total change).
3. Main chart (Plotly → `toImage` SVG).
4. Fingerprint table (§2) and interpretation sentences.
5. Change onset (§3) and the monthly strip (§5).
6. Ranking badge (§4).
7. Methods box: anomaly (1991–2020 normal), Mann-Kendall, Sen, autocorrelation correction,
   label rules.
8. Limitations (the list in PLAN §3.5).
9. References with DOIs (`REFERENCES`); independent source badges.
10. Share link (opens the same view).

### 6.3 Implementation
- `Report.tsx`: a section hidden on screen and shown only with `@media print` (`@page A4`).
- Button: "Report (PDF)" in the right panel and the chart drawer.
- Flow: collect the report data → convert the chart to SVG → wait for fonts to load
  (`document.fonts.ready`) → `window.print()` → clean up on `afterprint`.
- Language follows the interface language (TR/EN).

### 6.4 Tests
- A unit test for the function that collects the report data (all fields filled, watermark flag on
  for fake data).
- By hand: PDF output in Chrome, Edge, Firefox; Turkish characters; no page overflow.

---

## 7. Contract and division of work

| Work | Who | Required? |
|---|---|---|
| §1–§6 interface and browser computations | Rumet | yes |
| Slope change calibration (§3.4) | Rumet (JS) | **yes**, if the feature ships |
| **Contract 1.5:** `regions/fingerprints.json`: mean slope, strong evidence share and cell count for every region (continent, country, province) × 9 variables | Enes | no (v2) |

If 1.5 arrives: the fingerprint and similar places work without loading the 15 MB of maps, and similar places
cover all 4,596 provinces. If not, v1 (computed in the browser) is enough on its own.
Rule: additions only (1.x), written to the CHANGELOG, `data.ts` stays the single entry point.

---

## 8. Order, time and cut line

| Stage | Contents | Time | Status |
|---|---|---|---|
| A | §1 infrastructure | 1 h | **required** |
| D | §2 fingerprint + similar places | 3–4 h | **required** (main feature, comes first) |
| E | §4 rankings | 2 h | **required** |
| B | §5 monthly change | 1.5 h | nice to have |
| F | §6 PDF report | 2–3 h | nice to have, can be trimmed (chart + finding + references) |
| C | §3 slope change | 3 h | **if time allows**; cut if calibration fails |

- Total ≈ 13–15 hours. The cut line is drawn by the submission deadline; since the project page, demo
  video and presentation are also Rumet's, the time for those is set aside first.
- Each stage a separate commit on the `rumet` branch; into main via PR.
- **Conflict prevention:** Enes is working on `Panel.tsx`, `i18n.ts`, `trend.ts`. Each feature is written
  in its own file (`Fingerprint.tsx`, `Ranking.tsx`, `MonthStrip.tsx`, `Report.tsx`,
  `changepoint.ts`, `trendStack.ts`, `areaStats.ts`) with its own text dictionary;
  only a few lines of wiring per feature are added to `Panel.tsx`. `trend.ts` does not change.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| The 15 MB of maps loading slowly | Load only on demand, loading indicator; the 1.5 file in v2 |
| Overclaiming (calling a straight trend a "break", wrong interpretation) | Pettitt rejected; calibration with a straight trend + autocorrelation null scenario; fixed rule table; no causal language; BH correction |
| Meaningless patterns in the fake data | "FAKE DATA" label, report watermark; the demo uses real data |
| Time | Required / nice to have / if time allows split; the riskiest feature (slope change) last |
| Crowding on phones | Fingerprint in one column, monthly strip scrollable, ranking in the drawer |

---

## 10. "Done" definition for every feature
- TR and EN texts complete.
- No animation when the reduced-motion setting is on.
- Unit tests written and all passing; typecheck, lint, build clean.
- Tried in the browser on one place with and one without a series; checked on a phone.
- Method and limitations added to the "How it works" window.
