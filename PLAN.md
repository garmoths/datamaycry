# PLAN: Data May Cry 🌍🔍

> **NASA Space Apps Challenge 2026: _Be An Earth System Trend Detective!_**
> This file is the record of **approved decisions**. If anything conflicts with the details in the README, **this file wins**.
> Last updated: 2026-11-13 (before the hackathon, planning only)

---

## 0. Rule reminder ⚠️

The Space Apps FAQ says: _"Teams are not allowed to begin working on the challenges prior to the hackathon."_
**Hackathon: November 14–15, 2026.** Until then: no writing code, no downloading data, no creating the repo. Preparation such as creating accounts is allowed.

---

## 1. What are we building? (one sentence)

The user **picks a country/province or any point on a 3D globe** and picks a **variable** (temperature, precipitation, soil moisture...). The tool draws that place's **chart from 1980 to today** and says: **is it rising or falling, by how much, and is it statistically significant?**

The challenge's 4 requirements → how we meet them:

| Challenge requirement | How we meet it |
|---|---|
| Pick a variable | Variable picker + plain-language descriptions |
| Get data for a region | **2 modes:** Region (country/province) + Point (any cell) |
| Visualize a time series | Monthly chart 1980–present + trend line |
| Rate of change + significance test | Sen's slope + Mann-Kendall (on anomalies) → result card |

---

## 2. Approved decisions ✅

| # | Topic | Decision | Why |
|---|---|---|---|
| 1 | **Main data** | MERRA-2 monthly, 10 variables, 1980–present | 45+ years, ideal for trend testing, a single source |
| 2 | **Download** | earthaccess + OPeNDAP, **only the needed variables**, month by month; temporary files deleted | Disk limit **≤ 10 GB** |
| 3 | **Local storage** | **DuckDB** (columnar, single file) | Lightweight, serverless, good compression |
| 4 | **Computation** | Worker **on our own Mac** (M2), vectorized NumPy | Measured: ~20 min. A server is slower and costs money |
| 5 | **Trend method** | Anomaly → **annual mean** → Mann-Kendall (p) + Sen's slope (slope); FDR correction for the map (see §3.5) | Plain monthly MK gave **17–31% false alarms** because of autocorrelation (measured) |
| 6 | **Architecture** | Worker, data store and frontend are **separate** | Independent development, easy maintenance |
| 7 | **Live server** | **None (static).** Tests run in the browser in JS | No maintenance, can't crash, free |
| 8 | **Frontend hosting** | **Vercel** (Hobby, free) | Automatic deploys, PR preview links |
| 9 | **Data hosting** | **Cloudflare R2** (free tier) ✅ account created | 10 GB free, no egress fees |
| 10 | **Selection modes** | **2 modes:** 🗺️ Region (country → province) + 📍 Point (cell tile) | Places that are not provinces (ocean, desert) and differences within a province |
| 11 | **Interface** | **MapLibre GL JS globe**: a rotatable, zoomable 3D globe with plenty of flair | Strong first impression on the jury |
| 12 | **Borders** | **Natural Earth** admin-0 + admin-1 | Public domain, includes Türkiye's 81 provinces |
| 13 | **Domain** | None for now: `*.vercel.app` + `r2.dev` | Enough for a hackathon demo |
| 15 | **Programming languages** | **Python** (worker, `uv` + `uv.lock`) + **TypeScript** (frontend: **Vite + React**, charts: **Plotly.js**). Approved 2026-11-14 | Python has the NASA/climate ecosystem ready. TS types the file contract. Two separate MK implementations = L2 parity |
| 16 | **Interface language** | **English (main) + Turkish** option. Descriptions and card templates written in both languages from the start | The jury is international |
| 14 | **Priority** | Data + test + chart + result card first, **then** the 3D flair | That's where the points are |

### Rejected ❌
| Option | Why it was rejected |
|---|---|
| Downloading whole files | ~173 GB, exceeds the disk limit |
| PostgreSQL / SQLite | Row-based, bloats to ~10–12 GB |
| ClickHouse / chDB | Unneeded power, ecosystem not as convenient as DuckDB's |
| Streamlit | Not enough for a 3D globe interface |
| FastAPI server in production | Not needed with precomputed data (can be added later) |
| Running the worker on a server | The Mac M2 is faster and free |
| GADM borders | License does not allow commercial use |
| Globe.gl / CesiumJS | Weak at province level / too heavy |

---

## 3. Data

### 3.1 MERRA-2 variables (1980-01 → present, 561 months, 361×576 grid, float32, NetCDF4)

| # | Variable | Collection | Meaning | Unit |
|---|---|---|---|---|
| 1 | `T2M` | M2TMNXSLV | 2 m air temperature | K |
| 2 | `QV2M` | M2TMNXSLV | Specific humidity | kg/kg |
| 3 | `SPEED` | M2TMNXFLX | Surface wind speed | m/s |
| ~~4~~ | ~~`U10M` / `V10M`~~ | ~~M2TMNXSLV~~ | **Removed:** speed computed from monthly mean U/V comes out lower than the true mean speed. The ready-made `SPEED` replaces it (verified in CMR) | |
| 5 | `PRECTOT` | M2TMNXFLX | Precipitation | kg m⁻² s⁻¹ |
| 6 | `EVAP` | M2TMNXFLX | Evaporation | kg m⁻² s⁻¹ |
| 7 | `GWETROOT` | M2TMNXLND | Root-zone soil moisture | 0–1 |
| 8 | `RUNOFF` | M2TMNXLND | Surface runoff | kg m⁻² s⁻¹ |
| 9 | `SNOMAS` | M2TMNXLND | Snow mass | kg m⁻² |
| 10 | `TOTEXTTAU` | M2TMNXAER | Aerosol optical depth | unitless |

**Optional (if time allows):** GPM IMERG precipitation (1998), GLDAS 2.1 soil moisture (2000), MODIS NDVI / LST (2000), OMI NO₂ (2004).

### 3.2 Data flow
```
NASA (OPeNDAP)  ──►  Mac worker  ──►  DuckDB (local, ~3–5 GB)
                         │
                         ├──► Vercel   : variables.json, trend maps, country/province series, borders  (< 100 MB)
                         └──► R2       : cell tiles (Point mode)                                         (~2.3 GB)
```

### 3.3 Files we produce
| File | Where | Contents | Size (computed) |
|---|---|---|---|
| `variables.json` | Vercel | Variables, units, plain descriptions | KBs |
| `trend_map/{var}.bin` | Vercel | Slope + p-value of every cell | ~1.7 MB / variable → ~17 MB |
| `regions/{country}.bin` | Vercel | Monthly series of the country + its provinces, int16 (~250 files) | ~54 MB total |
| `boundaries.pmtiles` | Vercel | Natural Earth country + province borders (simplified) | estimate: ~10–40 MB |
| `tiles/{var}/{tx}_{ty}.bin` | R2 | 10°×10° tile: 320 cells × 561 months, int16 | ~359 KB / file, 6,480 files, ~2.3 GB |

> Vercel's per-deploy limit is **100 MB** and **15,000 files**. The total has to stay under it. We will measure and verify.

### 3.4 Local DuckDB schema
```sql
CREATE TABLE merra2 (cell_id INTEGER, month DATE,
  t2m REAL, qv2m REAL, speed REAL, prectot REAL,
  evap REAL, gwetroot REAL, runoff REAL, snomas REAL, totexttau REAL);
-- ⚠️ write ORDER BY cell_id, month

CREATE TABLE cells  (cell_id INTEGER, lat REAL, lon REAL, country TEXT, admin1 TEXT);
CREATE TABLE trends (cell_id INTEGER, var TEXT, slope_per_decade REAL,
                     p_value REAL, significant BOOLEAN, period_start DATE, period_end DATE);
```
DuckDB has a single-writer rule: the worker writes to `data_new.duckdb` and, when done, swaps the file with `data.duckdb`.

> There are now **9** variables (SPEED instead of U10M+V10M). The earlier size and time estimates were for 10 variables, so they still hold as upper bounds.

### 3.5 Data interpretation protocol 🧪

From the raw number to the answer to "Is Diyarbakır warming?", **every step has to be fixed and documented**. The worker (Python) and the browser (JS) apply **the same steps**.

#### Step 1: Cleaning
- MERRA-2 `_FillValue` = **1e15** (verified in CMR) → `NaN`.
- For land variables (`GWETROOT`, `RUNOFF`, `SNOMAS`) ocean cells become `NaN` → shown as "no data" on the map.
- If **more than 20% of the years** are missing in a cell, that cell is not tested.

#### Step 2: Unit conversion (the user never sees raw units)
| Variable | Raw unit | Displayed unit | Conversion |
|---|---|---|---|
| `T2M` | K | °C | − 273.15 |
| `QV2M` | kg/kg | g/kg | × 1000 |
| `SPEED` | m/s | m/s | — |
| `PRECTOT`, `EVAP`, `RUNOFF` | kg m⁻² s⁻¹ | mm/day | × 86,400 |
| `GWETROOT` | 0–1 | % | × 100 |
| `SNOMAS` | kg m⁻² | mm water equivalent | — (1 kg/m² = 1 mm) |
| `TOTEXTTAU` | unitless | unitless (AOD) | — |

#### Step 3: Removing seasonality (anomaly)
- **Reference period: 1991–2020.** This is the WMO standard climate normal.
- Anomaly = value − the 1991–2020 mean of that calendar month.
- The chart offers the user **two views**: raw monthly values (the seasonal wave is visible) and anomaly + trend line.

#### Step 4: Trend test
**Measurement (on this Mac, synthetic data, trendless AR(1) noise, 300 repetitions, target false alarm rate 5%):**

| Method | φ = 0.3 | φ = 0.6 | Decision |
|---|---|---|---|
| Plain MK, monthly anomaly | 17.3% ❌ | 30.7% ❌ | Don't use |
| TFPW | 19.7% ❌ | 45.3% ❌ | Don't use |
| Yue-Wang (pymannkendall) | 50% ❌ | 51% ❌ | Don't use |
| Pre-whitening, monthly | 4.7% ✅ | 4.7% ✅ | Fallback method |
| **Plain MK, annual mean anomaly** | **4.3% ✅** | **6.7% ✅** | **Main method** |

**Decision:**
- **Main test:** monthly anomalies → **annual mean** (complete years only: 1980–2025 = 46 points, see §10.4) → **Mann-Kendall** (p) + **Sen's slope** (slope) + a **95% confidence interval** for the slope.
  - Why: simple, explainable to a student ("we look at each year's average"), largely solves the autocorrelation problem, and far cheaper to compute than the monthly test.
- **Fallback / advanced:** pre-whitening MK on the monthly series (`pymannkendall.pre_whitening_modification_test`).
- **Season mode (optional):** the same test on summer-only (Jun-Jul-Aug) or winter-only means. Example question: "Are summers in Diyarbakır getting warmer?"
- **Minimum length:** if the user picks a period **shorter than 10 years**, no test is run and a warning is shown.
- Tomorrow we will measure the lag-1 autocorrelation of the real data and confirm this decision.

#### Step 5: Multiple testing correction (world map only)
- When a separate p < 0.05 test is applied to more than 200,000 cells, **~5% come out "significant" even with no trend at all**. That means ~10,000 fake "significant" cells.
- The map applies **Benjamini-Hochberg FDR** (q = 0.05). Places shown dotted/hatched on the map are the cells that pass FDR.
- When looking at a single region or point, the normal p-value is shown.

#### Step 6: Regional average
- Cells are averaged **area-weighted**: weight = cos(latitude) × the fraction of the cell inside the province.
- The regional mean is taken first, **then** the anomaly and test.

#### Step 7: int16 packing precision
- For each variable, `scale` and `offset` are written to `variables.json`: `value = int16 × scale + offset`.
- Target precision: e.g. **0.01 °C** for temperature, **0.01 mm/day** for precipitation. The deviation after packing is tested (max error < scale/2).

#### Step 8: Telling the user the result (language rules)
| Case | Result card text (template) |
|---|---|
| p < 0.05 and slope > 0 | "📈 **Significant increase:** in {region}, {variable} increased on average by **{slope} {unit}** per decade (95% CI: {low}–{high}). This is unlikely to be chance (p = {p})." |
| p < 0.05 and slope < 0 | "📉 **Significant decrease:** ..." |
| p ≥ 0.05 | "〰️ **No significant trend.** A change is visible ({slope}/decade) but can't be told apart from chance. Try a longer period." |

**Rules:**
- **No cause-and-effect claims.** We never say "because of climate change", only "has changed".
- The word "significant" always comes with a "statistically" explanation (tooltip).
- The total change is shown too: "Total since 1980 ≈ {slope × number of decades} {unit}".
- Every card states the data source: "Source: NASA MERRA-2 reanalysis".

#### Step 9: Validation (before trusting the results)
- [ ] **Python ↔ JS:** both implementations must give the same p and slope for the same series (automated test).
- [ ] **Giovanni comparison:** for 2–3 points, the time series from Giovanni must match ours.
- [ ] **Known result check:** the global `T2M` trend should come out around **+0.2 °C / decade** (a common literature value, a rough sanity check). Polar regions should warm faster.
- [ ] **Fake trend test:** on trendless random data, the false alarm rate should be ~5%.

#### Known limitations (to be stated on the About page)
- MERRA-2 is a **reanalysis**, i.e. not a direct measurement but a blend of model + observations. Because observing systems changed over time, some variables (especially aerosol and precipitation) may have **artificial jumps**, e.g. the years when satellite observations were added for aerosol. This is a general caveat; we have not looked at the details per variable.
- 0.5° resolution (~50 km) does not show small districts or within-city differences.
- A linear trend does not fully capture accelerating or reversing changes.

### 3.6 Reliability layer (target: 99.9%) 🛡️

#### What exactly does "99.9%" mean? (an honest definition)
A statistical test can't be "99.9% correct"; there is always a trade-off between false alarms and misses. We split our target into three **measurable** parts:

| Target | Definition | How it is ensured |
|---|---|---|
| **T1. Software correctness** | Always the same, correct computation for the same data | Tests (L1, L2, L6) |
| **T2. Reliability of the "Strong evidence" label** | Rate of saying "Strong evidence" when there is **no** trend **≤ 0.2%** (≥ 99.8% specificity) | Layered decision rule (L3), **measured** |
| **T3. Protection against data-source errors** | Noticing artificial jumps caused by the reanalysis | Independent source comparison (L4) + warning (L5) |

> One constraint: solving T3 100% with statistics is not possible. We measured this in the next simulation and state it plainly below.

#### Simulation (on this Mac, 1,000 repetitions/scenario, monthly AR(1) φ = 0.6, 47 years)
| Decision rule | Says "trend" when there is none ❌ | Catches a real trend ✅ | Mistakes an artificial jump for a "trend" ⚠️ |
|---|---|---|---|
| R1: annual MK p < 0.05 | 6.0% | 88.0% | 89.7% |
| R2: annual MK p < 0.01 | 1.0% | 71.7% | 71.4% |
| R3: annual MK p < 0.001 | **0.1%** | 43.9% | 40.0% |
| **R4: annual p < 0.01 + pre-whitening p < 0.01 (same direction) + still p < 0.05 after trimming 5 years at each end (same direction)** | **0.2%** | **57.3%** | 60.1% |
| R5: R4 + no jump flag | 0.2% | 55.9% | 46.6% |
| Jump flag (step model, BIC difference > 6) | 0.5% | 2.6% | **17.7%** |

**What did we learn?**
- **R4 is a better balance than R3:** almost the same false alarm rate (0.2% vs 0.1%), but it catches far more real trends (57% vs 44%).
- **Statistics alone can't tell an artificial jump apart:** no rule reliably separated jumps from trends. The jump flag caught only 17.7% of cases. **The real defense is an independent second source (L4).** This is why large institutions also compare several datasets.

#### Layers
**L0. Source integrity** (on every download, automatic)
- NASA CMR **does not provide checksums** for MERRA-2 (checked: `"Name": "Not provided"`). We verify integrity ourselves:
  - Are there **561 months** per collection, with no gaps in the month order?
  - Is each file's grid **361 × 576**?
  - `_FillValue` (1e15) → `NaN`; is the NaN ratio within the expected range? (0% for atmospheric variables, ~70% for land variables)
  - **Physical range check:** e.g. `T2M` 180–340 K, `GWETROOT` 0–1, `PRECTOT` ≥ 0. If an out-of-range value appears, **the worker stops**.
- `manifest.json`: each file's SHA-256, collection version (5.12.4), NASA production date, download date.

**L1. Transformation correctness** (unit tests)
- Unit conversions, the anomaly computation (the 1991–2020 mean of the anomalies should be ≈ 0), area weights summing to 1.
- The `cell_id ↔ lat/lon` and tile index round trips must match **exactly**.
- int16 packing round-trip error must be **< scale/2**.

**L2. Statistical correctness** (automated tests)
- **Exact match** between vectorized MK/Sen and `pymannkendall` on 1,000 random series (verified on 5 series today).
- **Python ↔ JS parity:** difference < 1e-6 for the same series.
- **Known trend recovery:** an injected trend must fall inside the confidence interval.
- **Calibration test:** on trendless data, R1 ≈ 5%, R4 ≤ 0.5%. This test reruns on every change.

**L3. Decision layer:** the user sees 3 levels, modeled on the IPCC's calibrated uncertainty language.

| Label | Rule | Measured false alarm |
|---|---|---|
| 🟢 **Strong evidence** | R4 holds | 0.2% |
| 🟡 **Possible trend** | R1 holds, R4 does not | — |
| ⚪ **No trend shown** | R1 does not hold | — |

The user always sees the slope, the confidence interval and the p-value. Nothing is hidden; only the label is chosen cautiously. The world map applies FDR (Step 5) and "Strong" cells are marked separately.

**L4. Cross-check with an independent source** (for demo scenarios and the global check, free)
| Our variable | Independent source | What is checked |
|---|---|---|
| `T2M` (global mean) | NASA GISTEMP (a small CSV) | Do trend direction and size agree? |
| `PRECTOT` | GPM IMERG (after 2000, Giovanni) | Same trend direction in the demo regions? |
| `GWETROOT` | GLDAS 2.1 (after 2000, Giovanni) | Same trend direction in the demo regions? |
| `TOTEXTTAU` | MODIS AOD (after 2000, Giovanni) | Same trend direction in the demo regions? |
- If the sources agree, a "✔ consistent with an independent source" badge is added to the result card. If they disagree, **that scenario is not used in the demo.**
- This check is done by hand with Giovanni (a few regions). It takes no extra disk space.

**L5. Artificial jump warning**
- If the jump flag (step model, BIC difference > 6) fires, the result card shows "⚠️ possible sudden jump: the change may be a one-off rather than gradual". The warning rarely fires wrongly (2.6% on real trends) but misses most jumps. That is why the main defense is L4.
- Variables that can be affected by changes in observing systems, such as aerosol and precipitation, get a permanent footnote.

**L6. Reproducibility**
- Python dependencies pinned (`requirements.lock` / `uv.lock`), `package-lock.json` in JS.
- A fixed seed wherever there is randomness. The same input must always produce the same output bytes (hash comparison).
- Every result card states the data version: "MERRA-2 v5.12.4, processed: {date}".

**L7. Human check (four-eyes rule)**
- Rumet checks the demo results Enes produces. Enes checks the result card texts Rumet writes against the template.
- **Sanity gallery:** before release, look at 10 known places. For example: is the Arctic warming fast, is the snow mass in the Sahara 0, is soil moisture in the Amazon reasonable?

**L8. Checks in production**
- The frontend checks the schema version of every data file. On a mismatch it shows no result, only an error message.
- In a region with `NaN` or missing data, the card says "no data" and never shows 0.
- Tests run automatically on GitHub Actions. I know it is free for public repos but did not verify it today.

#### Comparison with large institutions (based on general knowledge, not verified one by one today)
| What institutions do (NASA GISTEMP, NOAA, Copernicus/ECMWF, Berkeley Earth, IPCC) | What we do |
|---|---|
| Open code and data, independent reimplementations | ✅ Open repo + two independent Python↔JS implementations (L2) |
| Comparing several independent datasets | ✅ L4 (limited: demo regions + global) |
| Trend analysis and confidence intervals that account for autocorrelation | ✅ Annual MK + pre-whitening + Sen confidence interval |
| Calibrated uncertainty language (IPCC: "likely", "very likely"...) | ✅ L3: 3-level label |
| Field significance / multiple testing correction | ✅ FDR |
| Versioned data and provenance tracking | ✅ manifest + version stamp (L0, L6) |
| Quality control, automated tests, continuous integration | ✅ L0–L2, L8 |
| **Homogenization** (jumps caused by observation changes) | 🟡 **Partly (§3.7-1):** relative jump test on the MERRA-2 − ERA5 difference series + homogenized stations |
| **Ensemble uncertainty** | 🟡 **Partly (§3.7-2):** 2 independent reanalyses (MERRA-2 + ERA5) + effective-sample-size-corrected confidence interval |
| **Peer review** | 🟡 **Partly (§3.7-3):** standard methods + pre-locked rules + expert feedback |
| Station-based local validation | 🟢 **Yes (§3.7-4):** NOAA GHCN-M v4 (homogenized), Diyarbakır and Konya complete for 46/46 years |

#### Cost
**Money: 0 ₺.** All local computation, free tools and manual Giovanni checks. Extra disk need: a few MB. **Time cost** and hackathon priority:

| Priority | Layers | Estimated time |
|---|---|---|
| 🔴 Must | L0, L1, the calibration + parity part of L2, L3, the NaN rule of L8 | ~3–4 hours |
| 🟡 Needed | L4 (3–4 demo regions), L6, L7 sanity gallery | ~2–3 hours |
| 🟢 If time allows | L5 jump flag, GitHub Actions, full manifest | ~1–2 hours |

Computation cost of L3: ~4 tests per cell, but all on a 47-point annual series (except the monthly pre-whitening). It is still expected to stay under 1 hour on the Mac. Not measured yet; we'll measure tomorrow.

### 3.7 Review of the 4 missing topics (free substitutes) 🔬

> **Rule check (Space Apps Legal page, 2026-11-13):** non-NASA data is **not forbidden**. Conditions: the data must be free and publicly available or openly licensed, **every source must be listed with attribution** and its license stated. Without attribution, an award can be revoked.
> | Source | Owner | License | Status |
> |---|---|---|---|
> | MERRA-2 | NASA | NASA open data | ✅ main source |
> | GHCN-M v4 | NOAA (U.S. government) | Public domain | ✅ |
> | ERA5 | Copernicus / ECMWF (EU) | **CC-BY** (verified on the CDS page) | ✅ free with attribution |
> | Natural Earth | Volunteer project | Public domain | ✅ |
> ERA5 is used only for **validation**. The main data and all results come from NASA. All sources and their licenses will be listed in the "References" section of the submission.

> All checked on 2026-11-13 and simulated on this Mac. The station file was downloaded to a temporary folder only for a **feasibility check**; it is not part of the project.

#### 1. Homogenization → **Relative homogeneity test**
**Problem:** when observing systems change, artificial jumps appear in the data. Institutions clean this by comparing pairs of stations (e.g. NOAA's PHA algorithm).

**Our free solution:** build the **MERRA-2 − ERA5 difference series** for the same region and run the jump test on that difference. The real climate signal is shared by both datasets, so it cancels out in the difference; only artificial jumps specific to one dataset remain.

**Simulation (1,000 repetitions, annual series, 0.8 sd jump):**
| | Mistakes a real trend for a "jump" | Catches an artificial jump |
|---|---|---|
| Single dataset (§3.6, L5) | 9.6% | 10.4% |
| **Difference series (MERRA-2 − ERA5)** | **0.3%** | **57.7%** |

Jump detection went up **~5.5×**, false flags went down **~30×**.

**Decision:** the jump flag (L5) will now run on the **difference series**. If flagged: no "Strong evidence" label, and the card shows "⚠️ sudden difference between datasets".

**Limitation:** ERA5 and MERRA-2 share some observations (satellites). A change that affects **both** won't show up in the difference. The station check (item 4) partly catches it.

**ERA5 (verified):** Copernicus CDS, "ERA5 monthly averaged data on single levels", **1940 to present**, 0.25° resolution, free. Needs a CDS account and license acceptance (you will do this). Size can be reduced at download with the `grid` (e.g. 1°) and `area` (region) parameters:
- 1° global monthly data per variable: 181 × 360 × 4 B × 561 months ≈ **146 MB**. Just `T2M` + precipitation ≈ 0.3 GB. **Fits in the 10 GB disk budget.**
- Variable mapping: `T2M` ↔ `2m_temperature`, `PRECTOT` ↔ `total_precipitation`, `SPEED` ↔ `10m_wind_speed`. We'll check the mapping for the others tomorrow.

#### 2. Ensemble uncertainty → **2-member observational ensemble + a correct confidence interval**
**Checked:** ERA5's 10-member ensemble spread is **not offered as monthly means**, only as 3-hourly data. That is far too much data for a hackathon ❌

**Our free solution, in two layers:**
- **(a) Structural uncertainty:** a region's trend is computed with both MERRA-2 and ERA5, and the card shows both slopes side by side. The IPCC also shows the range across several observational datasets.
  - Same direction and both significant → "✔ two independent reanalyses agree" badge.
  - Opposite direction → **no** "Strong evidence" label.
- **(b) Statistical uncertainty:** the confidence interval of Sen's slope is corrected for autocorrelation.

**Simulation (300 repetitions, target 95% coverage):**
| Confidence interval method | φ = 0.3 | φ = 0.5 |
|---|---|---|
| Classic Sen CI | ~79% ❌ (interval too narrow) | 78.7% ❌ |
| Block bootstrap (L = 5 / 8 / 12) | 80–84% ❌ | 77–83% ❌ |
| **Effective-sample-size-corrected Sen CI** | **92.7%** ✅ | **93.0%** ✅ |

**Decision:** use the effective-sample-size-corrected CI. Variance × (1 + r₁)/(1 − r₁), r₁ = lag-1 autocorrelation of the detrended series. More accurate and much cheaper than bootstrap. No need for bootstrap.

**Updated "Strong evidence" rule (R4+):**
R4 (§3.6) **+** same direction in ERA5 with p < 0.05 **+** no jump flag on the difference series.
For variables without ERA5 data, R4 alone stays valid and the card shows a "single source" note.

#### 3. Peer review → **4 free substitutes**
A real peer review process is not possible within a hackathon. The closest free equivalents:

| Substitute | What is done | Cost |
|---|---|---|
| **a. Pre-locked rules** | The decision rules (R4+, FDR, thresholds) were fixed in this file **before seeing the real data**. Changing rules after looking at results (p-hacking) is forbidden; if a change is needed, it is written here with its reason. The equivalent of scientific "pre-registration". | 0 |
| **b. Only established, published methods** | Mann (1945), Kendall (1975), Sen (1968), pre-whitening (von Storch 1995; Yue et al. 2002), effective sample size correction, Benjamini-Hochberg (1995), FDR on climate maps (Wilks 2016). References to be listed in METHODS.md. | 0 |
| **c. Expert feedback** | Subject experts on Space Apps Connect (the FAQ says experts are on that platform) and a climate/statistics professor at the university. Have them read a 1-page METHODS.md. | 0 |
| **d. Reproducible methods page** | A "Methods" page on the site + code: anyone can reproduce the same result and find mistakes. | 0 |

#### 4. Station validation → **NOAA GHCN-Monthly v4** ✅
**Checked** (file downloaded and inspected):
- `ghcnm.tavg.latest.qcf.tar.gz` (**homogenized** mean temperature): **44 MB** compressed, 210 MB unpacked. Updated today (November 13, 2026), v4.0.1.
- **27,900** stations worldwide, **257** in Türkiye.
- **36 Turkish stations with ≥ 40 complete years** between 1980–2025.
- Our demo cities: **Diyarbakır 46/46 years ✅**, **Konya 46/46 ✅**, Ankara 44/46 ✅. Istanbul only 27/46 ⚠️, should not be used in the demo.

**Plan:**
- Only the demo cities and ~36 strong stations are filtered and kept (a few MB). No permanent disk footprint.
- The station trend is compared with the trend of the MERRA-2 cell the station falls in. **Trends are compared, not absolute values**, because a point station and a 50 km cell don't measure the same temperature.
- If they agree, the card shows a "✔ consistent with a ground station (NOAA GHCN)" badge.
- NOAA already homogenizes this data with its own PHA algorithm. For temperature this also partly covers the "shared jump" limitation from item 1.

**Limitation:** this is only for temperature. I did not verify the state of precipitation station data (GHCN-M v4 precipitation).

#### Summary: the new state of the gaps
| Topic | Before | Now | Extra cost |
|---|---|---|---|
| Homogenization | ❌ | 🟡 Relative test on the difference series (jump detection 10% → 58%) | CDS account, ~0.3 GB disk, ~1–2 hours |
| Ensemble uncertainty | ❌ | 🟡 2 reanalyses + corrected CI (coverage 79% → 93%) | Same as ERA5, the CI computation is free |
| Peer review | ❌ | 🟡 Pre-registration + standard methods + expert + open methods | ~1 hour (METHODS.md) |
| Station validation | ❌ | 🟢 GHCN-M v4, complete data in the demo cities | ~1 hour, a few MB |

**Money: 0 ₺.** Extra account: **Copernicus CDS** (free). Hackathon priority: stations (4) and the corrected CI (2b) → 🔴 must. ERA5 comparison (1, 2a) → 🟡 needed. Expert feedback (3c) → if time allows.

---

## 4. Worker (on the Mac)

```
1. Download  earthaccess.search_data → variable subset over OPeNDAP → Parquet (month by month) → delete temp file
2. Load      Parquet → DuckDB (ORDER BY cell_id, month)
3. Compute   anomaly → Mann-Kendall + Sen (vectorized NumPy, 8 processes, 200-cell chunks)
4. Regions   cell → province/country area-weighted mean
5. Pack      trend_map / regions / tiles files (int16)
6. Upload    Vercel (with the frontend deploy) + R2 (boto3, S3 API)
```
Run: `caffeinate -i python worker.py` (keep the Mac awake)

---

## 5. Frontend (Vercel)

- **MapLibre GL JS** (globe projection) + a chart library (Plotly.js or Chart.js, **not decided**)
- **Mode toggle:** `🗺️ Region | 📍 Point`
- **Flow:** the globe spins (trend map in the background) → click a country → `flyTo` → provinces appear → click a province → right panel: chart, trend line, result card, variable description
- **Point mode:** clicked coordinate → tile computed → ~359 KB file fetched from R2 → cell selected → test run in the browser in JS
- **Period slider:** 1980–present. When it changes, the test is recomputed instantly in the browser.
- **Extras:** "What are you curious about?" questions, demo scenarios (Diyarbakır, Konya, Lake Tuz...), a light mode for weak devices
- Heavy textures compressed with WebP/KTX2 and loaded on demand (Vercel: 100 GB traffic per month)

---

## 6. Reality check (checked on 2026-11-13) 🔎

### ✅ Verified
| Claim | How it was verified | Result |
|---|---|---|
| Challenge requirements and resources | Read the challenge page + Resources tab | ✅ |
| Hackathon November 14–15, working beforehand forbidden | Official Participant FAQ | ✅ |
| MERRA-2 since 1980, 561 granules, ~75–80 MB/file | NASA CMR API | ✅ |
| Names, float32 type and 361×576 grid of the 10 variables | NASA CMR UMM-Var | ✅ |
| Every granule has an OPeNDAP link | NASA CMR granule links | ✅ |
| Full files ~173 GB, 10 variables raw ~4.67 GB / int16 ~2.33 GB | Computed | ✅ |
| Mann-Kendall + Sen: 0.57 ms/series on 8 cores → **~20 min** (2.08 M series) | **Measured on this Mac** (M2, 8 cores, 16 GB), identical results to `pymannkendall` | ✅ |
| `earthaccess` (0.18.0): has `login`, `search_data`, `get_requests_https_session` | Installed with pip and inspected | ✅ |
| `duckdb` 2.0.0, `xarray`, `boto3`, `pymannkendall` install fine | Installed with pip | ✅ |
| Vercel Hobby: 100 GB traffic, 100 MB / 15,000 files per deploy, no team features, Git org repos not supported | Official Vercel docs | ✅ |
| R2 free: 10 GB, 1 M writes, 10 M reads, free egress; requires a card | Cloudflare docs + activation screen | ✅ |
| r2.dev is rate-limited, for development only | Cloudflare docs | ✅ (accepted for the demo) |
| MapLibre GL JS globe support | npm: current version **6.18.0**, changelog has globe fixes | ✅ |
| Natural Earth admin-1: **4,596** provinces/states, **251** countries, **Türkiye 81 provinces** | GeoJSON downloaded and counted | ✅ |
| Tiles: 18×36 = 648 tiles, 320 cells, ~359 KB/variable | Computed | ✅ |
| Regional series ~54 MB (4,847 regions × 10 × 561 × 2 B) | Computed | ✅ |
| Node v25.6.1, npm 11.9.0, Python 3.14.5, git 2.50.1 on the Mac | Checked with commands | ✅ |
| `SPEED` (M2TMNXFLX) exists, `_FillValue` = 1e15 | NASA CMR UMM-Var | ✅ |
| Plain monthly MK false alarms 17–31%; annual mean MK and pre-whitening ~5% | **Simulation on this Mac** (AR(1), 300 repetitions) | ✅ |
| "Strong evidence" rule (R4): 0.2% false alarms, 57% detection; the jump flag catches only 17.7% of jumps | **Simulation on this Mac** (1,000 repetitions/scenario) | ✅ |
| CMR gives no checksum for MERRA-2 granules (size only) | NASA CMR UMM-G | ✅ |
| Jump test on the difference series: detection 10.4% → 57.7%, false flags 9.6% → 0.3% | **Simulation on this Mac** (1,000 repetitions) | ✅ |
| Effective-sample-size-corrected Sen CI 93% coverage (classic 79%, bootstrap 77–84%) | **Simulation on this Mac** (300 repetitions) | ✅ |
| ERA5 monthly: 1940 to present, 0.25°, ensemble spread not offered monthly | Copernicus CDS page | ✅ |
| GHCN-M v4 qcf: 27,900 stations, TR 257, 36 stations with ≥40 years; Diyarbakır, Konya 46/46 | File downloaded and counted | ✅ |

### ⚠️ Not verified yet (first thing tomorrow)
| Topic | Risk | Plan B |
|---|---|---|
| OPeNDAP `dap4.ce=/T2M;...` syntax | Needs an Earthdata account, not tested | GES DISC Subsetter web interface or `earthaccess.open` + xarray |
| Download time (~2,244 requests) | Probably > 1 hour | 4–8 parallel downloads, resumable |
| Real compressed DuckDB size (estimate 3–5 GB) | Disk limit | Downsample to 1°, drop ocean cells |
| NetCDF → DuckDB load time | Unknown | Stay in Parquet and only query with DuckDB |
| `boundaries.pmtiles` size | Vercel's 100 MB limit | More aggressive simplification, move borders to R2 |
| Vercel → R2 CORS | Browser requests may be blocked | Fix the CORS policy |
| Chart library choice | Not decided | Plotly.js (batteries included) / Chart.js (lightweight) |

---

## 7. Requirements 📋

### 7.1 Accounts
| Account | Who | Status |
|---|---|---|
| Space Apps registration + team (same Local Event) | Both of us | ✅ |
| **NASA Earthdata** (https://urs.earthdata.nasa.gov/) | Both of us | ⬜ **must be created before 09:00, the OPeNDAP test depends on it** |
| **Copernicus CDS** (for ERA5, free, license acceptance required) | Enes | ⬜ (Day 1 afternoon is fine) |
| **Cloudflare** (R2 active) | Enes | ✅ |
| Cloudflare budget alert ($1) | Enes | ⬜ |
| **GitHub** repo (**personal**, not an org) + collaborator | Person 1 + Person 2 | ⬜ (tomorrow) |
| **Vercel** (Hobby, with the repo owner's account) | Enes | ✅ |
| Confirm the AI rule with the Local Lead | Enes | ⬜ |

### 7.2 Software
**Python (worker):**
```
earthaccess  xarray  h5netcdf  netCDF4  numpy  scipy  pandas  pyarrow
duckdb  boto3  pymannkendall  geopandas  shapely  python-dotenv
```
**Frontend:**
```
Node (installed: v25.6.1)  ·  Vite  ·  maplibre-gl@6  ·  pmtiles  ·  Plotly.js or Chart.js
```
**Tools:** `git`, `vercel` CLI, (optional) `tippecanoe` / `pmtiles` CLI (to convert borders to PMTiles)

### 7.3 Hardware and disk
- Apple M2, 8 cores, 16 GB RAM ✅
- ~77 GB free on disk, but **the project target is ≤ 10 GB**

### 7.4 Secrets (**never** go into git)
Kept in a `.env` file, added to `.gitignore`:
```
EARTHDATA_USERNAME=...      # or ~/.netrc
EARTHDATA_PASSWORD=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=data-may-cry-tiles
```

---

## 8. Hackathon day order (November 14–15)

> ⚠️ **The order matters.** If the contract steps (🔒) are skipped or reordered, Enes's and Rumet's work won't fit together. Don't move on until each 🔒 step is done.

### Folder structure (target)
```
Data_May_Cry/
├── contract/            🔒 single source of truth
│   ├── types.ts         ← TypeScript types of the file formats
│   ├── schema/*.json    ← JSON Schema of the same structure (for Python validation)
│   └── CHANGELOG.md     ← every contract change + version
├── worker/              (Enes, Python)  download → DuckDB → test → packing
│   └── mock.py          ← fake data generator (per the contract)
├── web/                 (Rumet + Enes, TypeScript)
│   ├── src/data.ts      ← Enes: data fetching + int16 decoding + MK (single entry point)
│   ├── src/...          ← Rumet: globe, panels, chart, card
│   └── public/data/     ← fake → real files (swapped in place)
├── PLAN.md  README.md  METHODS.md  LICENSE
```

### Day 1 (November 14)
| # | Time* | Who | Step | Done when |
|---|---|---|---|---|
| 1 | 09:00 | Enes | GitHub repo (personal), `.gitignore` (`.env`, `*.duckdb`, `data/`), folder skeleton, add Rumet as collaborator | Rumet can clone the repo |
| 2 | 09:30 | **Both** | 🔒 **Contract v1.0:** read `contract/types.ts` + JSON Schema + `data.ts` function signatures together | Both approved, "1.0" written in `CHANGELOG.md` |
| 3 | 10:00 | Enes | 🔒 **Fake data v1.0:** `worker/mock.py` → `web/public/data/` (2–3 countries, a few provinces, a few tiles). `data.ts` ready to read the fake data | Fake files pass JSON Schema validation |
| 4 | 10:30 → | Rumet | Vite + MapLibre globe → borders → selection → chart + result card, **only through `data.ts`**, with fake data | Clicking fake Diyarbakır shows a card |
| 5 | 10:30 | Enes | Earthdata login → **OPeNDAP test on 1 file** (critical) | 1 month of T2M on disk, values within 180–340 K |
| 6 | 11:30 | Enes | Download worker (parallel, resumable) → **starts running in the background** | 4 collections downloading, with a progress log |
| 7 | 12:30 | **Both** | 🔒 **Contract freeze:** from now on only **additions** (1.x) | `CHANGELOG.md` says "frozen" |
| 8 | 13:00 → | Enes | R2 bucket, CORS, token · Copernicus CDS · GHCN stations · MK tie correction + tests (L1, L2) | Calibration test passes |
| 9 | 18:00 | Enes | First Vercel deploy (with fake data) | Site opens in a private window |
| 10 | Evening | **Both** | Checkpoint: do the globe + fake data work, where is the download? | — |

### Day 2 (November 15)
| # | Time* | Who | Step | Done when |
|---|---|---|---|---|
| 11 | 09:00 | Enes | DuckDB → anomaly → test (R4+) → regional series → **pack the real files** | Real files pass **the same JSON Schema validation** |
| 12 | 12:00 | Enes | 🔒 **Fake → real swap:** `public/data/` replaced with real files, tiles uploaded to R2. **No code changes outside `data.ts`** | The site shows real data without touching Rumet's code |
| 13 | 12:30 | **Both** | Validation: station/ERA5/GISTEMP badges, sanity gallery (L7), pick demo scenarios | 3–4 demo scenarios approved |
| 14 | 13:00 → | Rumet | Variable descriptions (EN + TR), demo buttons, flair, light mode, colorblind palette | — |
| 15 | 13:00 → | Enes | Point mode (R2 tiles), Python ↔ JS parity test, `METHODS.md`, `LICENSE`, References list | Parity test passes |
| 16 | **19:00** | **Both** | 🔒 **Feature freeze:** no new features, bug fixes only | — |
| 17 | 19:00 → | Rumet | 30 s demo video (English subtitles) + submission page text | Video at a public link |
| 18 | 21:00 | **Both** | Final deploy, private-window test, AI disclosure, References, **"Submit for Judging"** | Submitted **before 23:59** ✅ |

\* Times are targets. What matters is the **order**.

### If the contract changes (after noon on Day 1)
1. Only **additions** are allowed. Removing or renaming needs both people's approval (2.0).
2. In one PR: `types.ts` + JSON Schema + `mock.py` + `data.ts` + `CHANGELOG.md`.
3. Regenerate the fake data and run the validation test.
4. Tell Rumet. The TypeScript compiler shows the places to fix.

---

## 9. Division of work: Enes & Rumet

**Logic:** risky and technically hard work (data pipeline, statistics, binary formats, infrastructure) goes to Enes. Visible, well-documented work that can be done step by step (interface, content, presentation) goes to Rumet. **Enes is the only one who writes to the DB.** Rumet doesn't need the DB; he only uses the files in the contract.

### 👑 Enes: data, infrastructure, hard JS parts
| # | Task |
|---|---|
| 1 | Repo skeleton, `.gitignore`, `.env`, **file format contract** + fake data generator (**Day 1, first hour**) |
| 2 | Earthdata + OPeNDAP test → download worker (parallel, resumable) |
| 3 | DuckDB loading, anomaly + Mann-Kendall + Sen (vectorized) |
| 4 | Cell → province/country mapping (Natural Earth, area-weighted) → regional series |
| 5 | Packing (int16 `regions` / `trend_map` / `tiles`) → R2 (bucket, CORS, token) + Vercel setup |
| 6 | **The hard core of the frontend:** the `data.js` module (fetching files/tiles, int16 decoding), **Mann-Kendall + Sen in JS** (for the period slider) |
| 7 | Reviewing Rumet's PRs, integration, final deploy |

### 🎨 Rumet: interface, content, presentation
| # | Task |
|---|---|
| 1 | Vite + MapLibre globe setup, rotate/zoom, Natural Earth borders |
| 2 | Click a country → `flyTo` → provinces → click a province; 🗺️ Region / 📍 Point toggle |
| 3 | Right panel: chart (Plotly.js / Chart.js), trend line, **result card**, period slider UI |
| 4 | Variable picker + **plain Turkish/English descriptions of the 10 variables** |
| 5 | "What are you curious about?" question flow, demo scenario buttons |
| 6 | Flair: animations, trend map colors, light mode, **testing on the demo device** |
| 7 | **Space Apps project page, demo video, presentation** |

Rumet calls the functions in Enes's `data.js` module (e.g. `getRegionSeries(country, admin1, var)`, `getPointSeries(lat, lon, var)`, `getTrendMap(var)`, `mannKendall(series)`). He doesn't need to know their internals. On Day 1 these functions return **fake data**; on Day 2 they are wired to the real data.

### 📜 Contract and change management (no migrations)
- **Rumet doesn't get the DB, and the DB schema is not shared.** The only shared things are the **format of the output files** (`variables.json`, `trend_map`, `regions`, `tiles`) and the function signatures in `data.ts`.
- **The DuckDB schema is an internal detail owned by Enes.** If it changes there is no migration: the DB is **rebuilt from scratch** from Parquet (the worker is idempotent). Rumet is not affected.
- **Single source of truth:** TypeScript types (`types.ts`) + a JSON Schema of the same structure in the `contract/` folder. Both the fake data generator and the real worker **are validated against the same schema** (the same check as L8).
- Every file has a `schema_version` field. The frontend rejects a mismatched version.
- **Change rules:**
  1. **Additions are free:** adding a new field doesn't break old code. The minor version goes up (1.0 → 1.1).
  2. **Removing or renaming is forbidden.** If unavoidable, the major version goes up (1.x → 2.0) and both decide together.
  3. A contract change is made **in one PR**: types, schema, fake data generator and `data.ts` updated together. The TypeScript compiler shows every place in Rumet's code that needs fixing.
- **The contract is frozen at noon on Day 1.** After that, only additions.

### 🤝 Shared checkpoints
| When | What |
|---|---|
| Day 1 start (~30 min) | Read the contract together, agree on the `data.js` function signatures |
| Day 1 noon | Rumet: do the globe + fake chart work? Enes: did the OPeNDAP test pass? |
| Day 1 evening | Is the download running in the background, was the first Vercel deploy done? |
| Day 2 noon | **Real data connected.** Pick the demo scenarios together |
| Day 2 last 3–4 hours | **No new features.** Bug fixes, video, presentation, submission |

### If stuck
- If Rumet is stuck on something for more than 30 minutes, he asks Enes. Enes's work (download, computation) will be running in the background anyway.
- If time runs short, **the flair is cut first** (animations, question flow). The chart, result card and region mode are **never** cut.

---

## 9.5 GitHub setup

**Repo:** on Enes's **personal** account (Vercel Hobby doesn't support org repos), **public** (open source is required anyway, and branch protection is free on public repos). Created when the hackathon starts.

### Branch flow
```
main  ← protected, every merge = Vercel production deploy
 ├── enes/worker-download     (feature branches: name/topic)
 ├── rumet/globe-panel
 └── enes/contract-v1.1       (a contract change always gets its own branch)
```
- **No direct pushes to `main`**; everything goes in through a PR. Vercel automatically adds a **preview link** to every PR, so flair is tested there without breaking production.
- Merging: **squash merge**, i.e. one commit per PR, a clean history.
- Small, frequent PRs (half a day of work = 1 PR). A big PR means conflicts.

### Rules
| Rule | How |
|---|---|
| `main` is protected | Settings → Branches: PR required, CI must pass |
| `contract/` needs both of your approvals | `.github/CODEOWNERS`: `contract/ @enes @rumet` (usernames to be replaced with the real ones) |
| Enes reviews Rumet's PRs | Four-eyes rule (L7). Rumet takes a quick look at Enes's PRs, at least checking the effect on the interface |
| Data and secrets never go into the repo | `.gitignore`: `.env`, `*.duckdb`, `*.parquet`, `data/raw/`. Only small fake data is committed |

### CI: GitHub Actions (automatic on every PR)
| Job | What it checks |
|---|---|
| `web` | `tsc --noEmit` (types), `vite build`, unit tests (vitest) |
| `worker` | `pytest`: unit conversions, int16 round trip, tile index, MK tie correction, **small calibration test** |
| `contract` | Does the fake data match the JSON Schema? |
| `parity` | Python MK = JS MK for the same series (difference < 1e-6) |
CI never uses real NASA data, only small test data. Downloading and uploading data is done from Enes's Mac.

### Tracking
- **GitHub Projects** board: `To do → In progress → In review → Done`. Cards are created from the 18 steps in §8.
- **Labels:** `worker`, `web`, `contract`, `bug`, `demo`, `docs`.
- **PR template** (`.github/pull_request_template.md`):
  - [ ] Did the contract change? If so, were `CHANGELOG.md` + schema + mock updated?
  - [ ] Do the tests pass?
  - [ ] Was AI used? If so, where?

### AI transparency
- Commits written with AI help get a `Co-Authored-By: Claude ...` line. This naturally meets Space Apps' rule that "AI use in code must be stated in metadata".
- An "AI use" section in the README (§10.1).

### At submission
- Right before submitting, tag **`v1.0-submission`**. The jury sees the code as it was at submission through this tag. Later changes don't affect the submission.
- The repo must contain: `README.md` (what it is, how to run it, live link, demo video), `METHODS.md`, `LICENSE` (Apache-2.0), References / third-party license list.

## 10. Rules, judging and easy-to-miss items (checked on 2026-11-13)

### 10.1 The AI ("SI", Super Intelligence) rule ⚠️ IMPORTANT
According to the Project Submission Guide:
- SI tools (chatbots, LLMs, image generation...) are **allowed**, but should be used as a tool to accelerate innovation and creativity.
- **"SI should not be used to come up with your idea of how to solve the challenge."** The solution idea must come from the team.
- SI use must be **clearly disclosed**:
  - Images and video: a **visible watermark** is required.
  - Code and data: stated in the description and in metadata.
  - Audio: stated in the description and in metadata.
- SI-generated content **may not use the NASA logo, flag or mission insignia.**
- The submission form asks "Did you use SI, and how?". This is only for statistics; the jury doesn't see it. But the jury does see the SI markers in the project.

**What it means for us:**
- **The idea is the team's:** "data detective work" by picking a region/point on a 3D globe, the two modes, the lightweight columnar DB and the worker idea came from Enes.
- **Claude's role:** research, verifying sources/limits, benchmarks and simulations, comparing method options, code help. This will be stated **honestly** in the submission form and the README.
- Code gets a "written with SI" note at the top of the file or in the README. Any SI-generated image gets a watermark.
- In any unclear case, **ask the Local Lead.**

### 10.2 Submission requirements
| Requirement | Detail |
|---|---|
| Team | Everyone must be registered to **the same Local Event** and appear on the team page (max 6 people) |
| Submission window | **November 14 09:00 → November 15 23:59** (in the Local Event's time zone) |
| Demo | **≤ 30 second video** OR **≤ 7 slides** (including the title). On YouTube, Drive or GitHub, with a link that **needs no sign-in** |
| Language | Submission page and all links in **English**. The video may be in Turkish but **English subtitles are required** |
| Final project link | Must be public (Vercel site + GitHub repo). Test in a private window |
| Resources | **Every** external resource (code, data, images, including open source) must be listed in the References field. Otherwise an award can be revoked |
| License | Our own code must be released under an OSI-approved open license (Apache 2.0 if not specified). Put `LICENSE` + a third-party license list in the repo |
| Other | No images or voices of people under 18. No copyrighted music/images |

### 10.3 Judging criteria (1–5 points each) → our answer
| Criterion | What they look for | Our strength |
|---|---|---|
| **Impact** | How important the problem is, how many people it reaches | Students can investigate the climate trend of any place themselves |
| **Creativity** | Originality | Two-mode detective work on a 3D globe + cross-validation badges from 3 sources |
| **Validity** | Scientific basis, feasibility, **usability** | §3.5–3.7: measured false alarm rates, station check, a working live site |
| **Relevance** | Full fit with the challenge, **NASA data at the core of the project** | Main data and all results are NASA MERRA-2. **NASA GISTEMP** should also be highlighted for validation (ERA5 and NOAA as support) |
| **Presentation** | Storytelling, clarity | 30 s video: "Is Diyarbakır warming?" → click → answer + 3 badges |

### 10.4 Easy-to-miss technical issues 🐛
| # | Problem | Solution |
|---|---|---|
| 1 | **2026 is a half year:** data ends in September 2026; a 9-month year in the annual mean would bias the result | Tests use **complete years only: 1980–2025 (46 years)**. The chart shows the 2026 months but they don't enter the test |
| 2 | **Ties:** snow = 0 in deserts, precipitation ≈ 0 in dry regions. Our vectorized MK has no tie correction | Add a tie correction to the MK variance (compare with pymannkendall). No test on completely constant series ("data is constant") |
| 3 | **Tile edge:** 361 latitude rows don't divide evenly by 20 (18 × 20 = 360), the north pole row is left out | The last tile row gets 21 rows, or the pole row is handled separately. Write a test for it |
| 4 | **Drawing the trend map:** drawing 200k cells as separate polygons makes the globe lag | The map is given to MapLibre as a **raster image** (PNG/WebP) via an `image`/`raster` source |
| 5 | **Color blindness:** don't use red-green | A colorblind-friendly blue-red diverging palette + a pattern for "significant" areas |
| 6 | **No WebGL** or the globe doesn't run on a weak device | Error message + a fallback mode with a flat map / list |
| 7 | **No internet at the venue** | Record the demo video in advance; the site should also run locally (`vite preview`) |
| 8 | **Secret keys** | The R2 write key **never** goes into the frontend. `.env` is in `.gitignore` |
| 9 | **Globe texture** | NASA Blue Marble can be used (NASA imagery is generally copyright-free). **Don't use the NASA logo** |
| 10 | **Coastal cells:** cells mixing land and sea when entering the province mean | The area weight is computed from the intersection with the province border (§3.5 Step 6) |

## 11. Open questions

- [x] Chart library → **Plotly.js**
- [x] Frontend → **React + TypeScript** (Rumet knows React)
- [ ] Does anyone on the team know JS/3D? (the amount of flair depends on it)
- [ ] Buy a domain? (not for now)
- [ ] Add the optional datasets (IMERG, MODIS)?
