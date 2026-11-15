# Contract v1.0 — getting started guide for Rumet

> This document is for the "read the contract together" meeting in PLAN.md §8 step 2. If you read and approve it,
> we remove the "draft" note in `CHANGELOG.md` and it becomes version 1.0. The contract is frozen at 12:30 on Day 1.

## 1. Setup (5 min)

```bash
git clone https://github.com/garmoths/datamaycry.git
cd datamaycry/web
npm install
npm run dev      # http://localhost:5173
npm test         # 48 tests should pass
```

Open a branch for your work: `git checkout -b rumet/globe-panel`. Force pushes and deletion are disabled on `main`. Open your work as a PR.

## 2. The one rule

**The interface reaches data only through `web/src/data.ts`.** Don't read the files in `public/data/` directly.
Today these files are fake. Tomorrow at noon they will be replaced with the real ones and nothing in your code will change.

## 3. The functions you'll use

```ts
import {
  loadVariables, listCountries, getRegionSeries, getPointSeries,
  getTrendMap, analyzeTrend, anomalies, monthLabels,
} from "./data";
```

| Function | Returns | Used in |
|---|---|---|
| `loadVariables()` | 9 variables: name, description (EN+TR), unit, number of decimals | Variable picker, unit labels |
| `listCountries()` | Countries → provinces (`id`, EN+TR name, `bbox`) | Region mode list, `flyTo(bbox)` |
| `getRegionSeries("TUR", "TR-21", "T2M")` | Monthly series (`values`, `start`, `unit`, `label`) | Region mode chart. `admin1 = null` for the whole country |
| `getPointSeries(lat, lon, "T2M")` | Monthly series of the clicked point | Point mode |
| `getTrendMap("T2M")` | Slope, p, level (0/1/2) for every cell | World trend map (raster) |
| `analyzeTrend(series, { startYear, endYear, months })` | Result card: `slopePerDecade`, `ci95`, `pValue`, `level`, `totalChange`, `status` | Result card and period slider (computed instantly) |
| `anomalies(series)` | Monthly series with the seasonal effect removed | The "anomaly" view in the chart |
| `monthLabels(series)` | `"1980-01"`... | The chart's x axis |

Types and field descriptions: [`types.ts`](types.ts).

### Example: the Diyarbakır card

```ts
const s = await getRegionSeries("TUR", "TR-21", "T2M");
const r = analyzeTrend(s);                       // 1980–2025
if (r.status === "ok") {
  // r.level: "strong" | "possible" | "none"
  // r.slopePerDecade, r.ci95 = [low, high], r.pValue, r.totalChange
}
// r.status: "too_short" (< 10 years) | "insufficient_data" | "constant" → show a warning on the card
```

### Result card rules (PLAN.md §3.5 step 8 and §3.6 L3)

| `level` | Label | Text template |
|---|---|---|
| `strong` | 🟢 Strong evidence | "📈/📉 Significant increase/decrease: in {region}, {variable} changed by **{slope} {unit}** per decade …" |
| `possible` | 🟡 Possible trend | same template, more cautious language |
| `none` | ⚪ No trend shown | "〰️ No significant trend…" |

- Don't write cause-and-effect sentences (don't say "because of climate change").
- Never show a `NaN` value as 0; write "no data".
- Every card should say "Source: NASA MERRA-2".
- If `variables.json` has `is_mock: true`, show a "FAKE DATA" label in the corner of the screen.

## 4. Coverage of the fake data

| What | Coverage |
|---|---|
| Countries | `TUR` (Diyarbakır TR-21, Konya TR-42, Ankara TR-06, Istanbul TR-34), `EGY` (Cairo, Aswan), `BRA` (Amazonas, São Paulo) |
| Point mode | Only the **30–40°N, 40–50°E** tile (eastern Türkiye, including Diyarbakır). Clicking anywhere else returns a `DataError`; you need to show an error message |
| Trend map | All 9 variables, the whole world (fake pattern) |

## 5. What you need to approve

- [ ] Are the function names and the fields they return enough for the interface?
- [ ] Is any field missing? (e.g. a color palette or icon per variable)
- [ ] Province `id`s (like `TR-21`) match the `iso_3166_2` field in Natural Earth. Can you pass this field of the clicked province on the map to `getRegionSeries`?

If you want changes, say so before 12:30 today. After that, only **adding new fields** is possible.

---
*Written with the help of AI (Claude).*
