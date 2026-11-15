# Aeolus 🌍🔍

*A project by team Data May Cry*

**NASA Space Apps Challenge 2026: _Be An Earth System Trend Detective!_**

🌐 **Live site:** <https://aeolusclimate.vercel.app> · **API:** <https://aeolusclimate.vercel.app/#api>

A web tool where the user picks a region of the world and a variable, sees how that variable has changed from 1980 to today, and learns whether the change is **statistically significant**.

> Challenge page: <https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/>
>
> 📌 **For the current decisions, see [PLAN.md](PLAN.md).** Instead of the "FastAPI backend" plan in this README, we chose a **static setup (Vercel + Cloudflare R2)** and **2 selection modes (Region + Point)**.

---

## Contents
1. [What does the challenge ask for?](#1-what-does-the-challenge-ask-for)
2. [Data: which variables?](#2-data-which-variables)
3. [Download strategy (≤ 10 GB)](#3-download-strategy--10-gb)
4. [Storage: DuckDB](#4-storage-duckdb)
5. [Worker and trend computation](#5-worker-and-trend-computation)
6. [Architecture: separate backend and frontend](#6-architecture-separate-backend-and-frontend)
7. [Interface: 3D globe](#7-interface-3d-globe)
8. [Priorities and division of work](#8-priorities-and-division-of-work)
9. [Open issues / to-do](#9-open-issues--to-do)
10. [Resources](#10-resources)

---

## 1. What does the challenge ask for?

In one sentence: **pick data → pick a region → draw a chart → say whether there is a trend and whether it is significant.**

A successful solution has to do 4 things:

| # | Step | How we do it |
|---|------|--------------|
| 1 | **Pick a variable** whose trend can be investigated | Variable picker + plain-language descriptions |
| 2 | Get the variable for **a specific region** (most trends are not global) | Country → province selection on a 3D globe |
| 3 | Plot a **time series** long enough for statistics | Monthly chart from 1980 to today |
| 4 | **Rate of change** and a **significance test** (t-test, Mann-Kendall, confidence interval) | Sen's slope + Mann-Kendall, result card |

**Audience:** high school and university students, and members of the public with some science background. The user should feel like a "data detective".

**Things that earn extra points (optional):**
- Plain definitions of the variables
- 1–2 demo examples showing how the tool works (e.g. Diyarbakır, Konya, Lake Tuz)
- A "What / where are you curious about?" question flow that suggests variables
- AI suggestions for interesting regions/variables

**Scope notes:**
- A linear trend is enough. Non-linear, complex analyses are out of scope.
- **Removing seasonality is required:** use anomalies or Seasonal Mann-Kendall.
- A trend that is not significant still counts as interesting. Sometimes you just need a longer record.

---

## 2. Data: which variables?

> All dates, sizes and data types below were **verified in the NASA CMR catalog** (2026-11-13).
> Note: the claim "since 1983" is wrong. MERRA-2 starts in **January 1980**.

### Core: MERRA-2 (monthly, 0.5° × 0.625°)

- **Period:** 1980-01 → present (561 monthly files)
- **Grid:** 361 × 576 = **207,936 cells**
- **Format:** NetCDF4, all variables **float32**

| # | Variable | Collection | What it describes | Unit |
|---|----------|-----------|-------------------|------|
| 1 | `T2M` | M2TMNXSLV | 2 m air temperature | K |
| 2 | `QV2M` | M2TMNXSLV | 2 m specific humidity | kg/kg |
| 3 | `U10M` | M2TMNXSLV | 10 m wind (east-west) | m/s |
| 4 | `V10M` | M2TMNXSLV | 10 m wind (north-south) | m/s |
| 5 | `PRECTOT` | M2TMNXFLX | Total precipitation | kg m⁻² s⁻¹ |
| 6 | `EVAP` | M2TMNXFLX | Evaporation | kg m⁻² s⁻¹ |
| 7 | `GWETROOT` | M2TMNXLND | Root-zone soil moisture | 0–1 |
| 8 | `RUNOFF` | M2TMNXLND | Surface runoff | kg m⁻² s⁻¹ |
| 9 | `SNOMAS` | M2TMNXLND | Snow mass | kg m⁻² |
| 10 | `TOTEXTTAU` | M2TMNXAER | Aerosol optical depth (air pollution / dust) | unitless |

### Optional (higher resolution, shorter period)

| Variable | Dataset | Start | Data type | Grid |
|----------|---------|-------|-----------|------|
| Precipitation (fine) | GPM IMERG `precipitation` (GPM_3IMERGM v07) | 1998 | float32 | 1800 × 3600 (0.1°) |
| Soil moisture 0–10 cm | GLDAS 2.1 `SoilMoi0_10cm_inst` | 2000 | float32 | 600 × 1440 (0.25°) |
| Vegetation (NDVI) | MODIS MOD13C2 | 2000 | int16 (scaled) | 3600 × 7200 (0.05°) |
| Land surface temperature (LST) | MODIS MOD11C3 `LST_Day_CMG` | 2000 | uint16 (scaled) | 3600 × 7200 |
| NO₂ pollution | OMI OMNO2d | 2004 | float32 | 720 × 1440, **daily** |

---

## 3. Download strategy (≤ 10 GB)

**Rule:** we **never** download whole files. With OPeNDAP we cut out only the variables we need from each file.

### Space estimate

| What | Size |
|------|------|
| Full files of the 4 MERRA-2 collections | ~173 GB ❌ |
| Full files of all candidate datasets | ~340 GB ❌ |
| 10 variables, raw float32 (576 × 361 × 4 B × 561 months × 10) | **~4.7 GB** |
| Parquet / DuckDB, compressed (estimate, not measured) | **~2–4 GB** ✅ |

### Flow: fetch → convert → delete
```
for each collection (SLV, FLX, LND, AER), for each month:
  1. find the granule in CMR (earthaccess.search_data)
  2. fetch only the needed variables over OPeNDAP   (~1–3 MB)
  3. open with xarray → write Parquet (one file per month)
  4. delete the temporary file
at the end: Parquet → DuckDB (ORDER BY cell_id, month)
```

### Watch out for
- **An Earthdata account is required** (free): <https://urs.earthdata.nasa.gov/>
- **Don't build file names by hand.** File prefixes change by period (`MERRA2_100`, `200`, `300`, `400`...). Always take links from the CMR search result.
- Every granule has a Cloud OPeNDAP link, e.g.:
  `https://opendap.earthdata.nasa.gov/collections/C1276812859-GES_DISC/granules/M2TMNXSLV.5.12.4%3AMERRA2_100.tavgM_2d_slv_Nx.198001.nc4`
- Variable subsetting syntax (**not tested yet**):
  `<opendap_url>.dap.nc4?dap4.ce=/T2M;/QV2M;/U10M;/V10M;/lat;/lon;/time`
- Use **4–8 parallel downloads**. Too many parallel requests may get throttled by NASA.
- **Make it resumable:** skip Parquet files that already exist, and pick up where you left off if the connection drops.
- Total requests: 4 collections × 561 months ≈ **2,244**. In practice it will most likely take **more than 1 hour**.

### Fallbacks if it doesn't fit
1. **Downsample to 1°** (average of 2×2 cells) → size ÷4 → ~1.2 GB
2. **Drop ocean cells** for land variables (`GWETROOT`, `RUNOFF`, `SNOMAS`)
3. Cut the number of variables to 6–7

---

## 4. Storage: DuckDB

**Why DuckDB?** It is embedded (no server, a single file), columnar, compresses well, and talks directly to Python/pandas/Parquet.

| Storage | Estimated size |
|---------|----------------|
| NetCDF / Zarr | ~2–5 GB |
| **DuckDB / Parquet** ✅ | **~3–5 GB** |
| PostgreSQL (cell × month = row) | ~10–12 GB ❌ |

**Considered and rejected:**
- **PostgreSQL:** bloats because of per-row overhead.
- **SQLite:** row-based, inefficient at this volume.
- **ClickHouse / chDB:** powerful, but their main strengths (clusters, streaming, many users) are things we don't need. `clickhouse-local` and chDB can run without a server, but the ecosystem is not as convenient as DuckDB's.

### Schema
```sql
-- Raw data: ~117 million rows (207,936 cells × 561 months)
CREATE TABLE merra2 (
  cell_id   INTEGER,   -- lat_idx * 576 + lon_idx  (0..207935)
  month     DATE,      -- 1980-01-01 .. present
  t2m REAL, qv2m REAL, u10m REAL, v10m REAL,
  prectot REAL, evap REAL,
  gwetroot REAL, runoff REAL, snomas REAL,
  totexttau REAL
);
-- ⚠️ CRITICAL: write the data ORDER BY cell_id, month.
-- Thanks to zonemaps, a "45 years of one cell" query then takes milliseconds.

-- Cell → coordinate / region mapping
CREATE TABLE cells (
  cell_id INTEGER, lat REAL, lon REAL,
  country TEXT, admin1 TEXT
);

-- Precomputed trend results (~2 million rows, a few tens of MB)
CREATE TABLE trends (
  cell_id          INTEGER,
  var              TEXT,
  slope_per_decade REAL,     -- Sen's slope
  p_value          REAL,
  significant      BOOLEAN,  -- p < 0.05
  period_start     DATE,
  period_end       DATE
);
```

### ⚠️ Single-writer rule
In DuckDB only **one process can write** to a file at a time. So:
- The worker writes to `data_new.duckdb` and, when done, swaps it with `data.duckdb` (atomic rename).
- The web app opens the data **read-only** (`read_only=True`).

---

## 5. Worker and trend computation

### Flow
```
1. Download → data from NASA (first run: 1980 to today, then only the new month)
2. Load     → DuckDB merra2 table
3. Compute  → per cell × variable: anomaly → Mann-Kendall + Sen's slope
4. Save     → trends table + ready-made series per country/province
```

- **Not an always-on service.** An ordinary Python script run by **cron** once a month (MERRA-2 updates monthly).
- **It runs on our own Mac** (not on a server):
  ```bash
  caffeinate -i python worker.py   # keep the Mac awake
  ```
- A **custom period** the user picks (e.g. 2000–2020) or a multi-cell **regional average** is not precomputed; it is computed on request. The test on a single 561-point series takes milliseconds.

### Scientific method
1. **Anomaly:** subtract each calendar month's long-term mean from every value (removes the seasonal cycle).
2. **Mann-Kendall test** → p-value (significant if p < 0.05).
3. **Sen's slope** → rate of change (×120 months for per decade).
4. Optional: **Seasonal Mann-Kendall**, autocorrelation correction.

### Benchmark (actually measured)
**Machine:** Apple M2, 8 cores, 16 GB RAM
**Test:** synthetic data at MERRA-2 size (561 months), anomaly + Mann-Kendall + Sen's slope.
Vectorized NumPy results are **identical** to `pymannkendall` (p and slope).

| Method | ms / series |
|--------|-------------|
| `pymannkendall`, in a loop | 6.71 |
| Vectorized NumPy, single core | 2.06 |
| **Vectorized NumPy, 8 cores** | **0.57** |

**All data** (10 variables × 207,936 cells ≈ 2.08 million series):

| Method | Time |
|--------|------|
| `pymannkendall` loop | ~3.9 hours |
| Vectorized, single core | ~70 min |
| **Vectorized, 8 cores** | **~15–20 min** ✅ |

- Skipping empty land cells over the ocean brings the series count down to ~1.6 million.
- Memory: processed in chunks (200 cells per chunk), 8 processes use ~1 GB RAM in total.
- **The real bottleneck is downloading**, not computing.

The core of the vectorized approach:
```python
# x: (n_cells, 561) anomaly matrix
s = 0
for k in range(1, n):
    d = x[:, k:] - x[:, :-k]          # all i<j pairs, lag k
    s += np.sign(d).sum(axis=1)       # Mann-Kendall S
    slopes.append(d / k)              # slopes for Sen
var = n*(n-1)*(2n+5)/18
z = (s - sign(s)) / sqrt(var);  p = 2*(1 - Φ(|z|))
sen = median(concat(slopes), axis=1)
```

---

## 6. Architecture: separate backend and frontend

```
┌──────────────────────┐      ┌───────────────────────┐      ┌──────────────────────┐
│  WORKER (Mac M2)     │      │  BACKEND (server)     │      │  FRONTEND (browser)  │
│                      │      │                       │      │                      │
│ earthaccess+OPeNDAP  │ ───► │ FastAPI               │ ◄──► │ MapLibre GL (globe)  │
│ → Parquet → DuckDB   │upload│ + DuckDB (read-only)  │ JSON │ + Plotly / Chart.js  │
│ → trend computation  │      │ + ready region series │      │                      │
└──────────────────────┘      └───────────────────────┘      └──────────────────────┘
```

### Backend: FastAPI + DuckDB
Example endpoints:
| Endpoint | Returns |
|----------|---------|
| `GET /variables` | Variable list + plain descriptions |
| `GET /trend-map?var=t2m` | World trend map (slope, p per cell or region) |
| `GET /regions/{country}` | The country's provinces (admin-1) |
| `GET /timeseries?region=TR-21&var=t2m&from=1980&to=2026` | Time series + trend result |

### An idea that makes hosting easier
Province and country borders are fixed, so regional series **can be precomputed**:
- How much of each MERRA-2 cell falls into which province is computed once (area-weighted).
- ~4,500 provinces/states + ~250 countries × 10 variables × 561 months ≈ 27 million values → **~100 MB**.
- That way the server may not even need the 3–5 GB of cell data.

**Hosting candidates** (free-tier limits not verified yet):
- Hugging Face Spaces (data in an HF dataset repo)
- A small VPS (Hetzner etc., a few dollars a month)
- Plan B: run locally and record a demo video

> Streamlit was **rejected**: not enough for a 3D globe interface.

---

## 7. Interface: 3D globe

**Technology: MapLibre GL JS (v5 and later, globe projection).** A rotatable 3D globe from afar, a smooth transition to a flat map when zooming in, easy clicking on country and province borders, free.

| Option | Decision |
|--------|----------|
| **MapLibre GL JS** | ✅ Chosen |
| Globe.gl (three.js) | Cool, but weak when zooming to province level |
| CesiumJS | Too heavy for a hackathon |

### User flow
```
1. The globe spins → the selected variable's trend map in the background
   (red = increasing, blue = decreasing, faded = not significant)
2. Click a country → the camera flies there (flyTo), the border is highlighted
3. Zooming in reveals provinces → click a province
4. The right panel opens:
   ├─ Time series chart + trend line
   ├─ Result card: "In Diyarbakır, temperature changed by +X °C per decade,
   │               p = 0.00X → significant ✅"
   └─ Plain description of the variable
```
- **Top left:** variable picker + "What are you curious about?" questions (e.g. picking "Drought" suggests `GWETROOT` + `PRECTOT`).
- **Demo examples:** ready-made scenarios ("Diyarbakır summer temperature", "Lake Tuz soil moisture"...).
- **Period picker:** a slider from 1980 to present. Changing it reruns the test instantly.

### Border data
- **Natural Earth** admin-0 (countries) + admin-1 (provinces/states). Public domain, includes Türkiye's 81 provinces. ✅
- GADM is more detailed, but its license does not allow commercial use. ❌

---

## 8. Priorities and division of work

### Priority order
1. 🥇 **Data pipeline + trend test + chart + result card.** This is where the challenge's points are.
2. 🥈 Region selection (it should work even on a flat map)
3. 🥉 3D globe, animations, question flow, AI suggestions

> A 3D globe takes time for a two-person team. If time runs short, a flat map with clickable provinces does the job too.

### Division of work (2 people)
| Person | Responsibility |
|--------|----------------|
| **Person 1: Data** | earthaccess/OPeNDAP download → Parquet → DuckDB → trend computation → regional series → FastAPI |
| **Person 2: Interface** | MapLibre globe, country/province selection, charts, result card, variable descriptions, demo examples |

**Shared contract:** from the start, Person 1 sets up the `get_timeseries(region, var)` and `get_trend_map(var)` functions/endpoints **with fake data**. That way Person 2 can start without waiting for the real data.

---

## 9. Open issues / to-do

- [ ] Create Earthdata accounts (both people)
- [ ] Test the OPeNDAP `dap4.ce` variable subsetting syntax on the first file
- [ ] Measure the real compressed size (estimate: 2–4 GB)
- [ ] Measure NetCDF → DuckDB load time
- [ ] Build the cell → province mapping (area-weighted) with Natural Earth admin-1
- [ ] Verify free-tier limits of the hosting options
- [ ] Does anyone on the team know JS? (the 3D globe decision depends on it)
- [ ] Pick demo scenarios (Diyarbakır, Konya, Lake Tuz, Istanbul aerosol...)

---

## 10. Resources

### Resources provided by the challenge
**NASA**
- [Giovanni](https://giovanni.gsfc.nasa.gov/): variable menu, generating and downloading time series
- [Hydrology Time Series](https://disc.gsfc.nasa.gov/information/tools?title=Hydrology%20Time%20Series)
- [AppEEARS](https://appeears.earthdatacloud.nasa.gov/): fetching and transforming geospatial data
- [Climate Data Online (NOAA)](https://www.ncei.noaa.gov/cdo-web/)
- [SeaWiFS chlorophyll time series paper (PDF)](https://ntrs.nasa.gov/api/citations/20090042747/downloads/20090042747.pdf): an example of significance testing

**Partners**
- [KNMI Climate Explorer](https://climexp.knmi.nl/)
- [Trend test methods (Medium)](https://medium.com/@snp.kriss/statistical-test-methods-to-detect-trends-in-time-series-data-b361a0ec530b)
- [Guide to statistical significance](https://www.statsig.com/perspectives/a-comprehensive-guide-to-statistical-significance)
- CSA: [RCM data](https://donnees-data.asc-csa.gc.ca/en/dataset/rcm), [Geo.ca](http://geo.ca/), [SWOT](https://www.asc-csa.gc.ca/eng/satellites/swot/), [SAR Python tutorial](https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial)

> NASA does not endorse non-U.S. Government websites. Data on those sites is subject to their own terms of use.

### Technical
- [earthaccess](https://earthaccess.readthedocs.io/): NASA Earthdata Python library
- [NASA CMR Search API](https://cmr.earthdata.nasa.gov/search/)
- [DuckDB](https://duckdb.org/)
- [MapLibre GL JS](https://maplibre.org/)
- [Natural Earth](https://www.naturalearthdata.com/)
- [pymannkendall](https://pypi.org/project/pymannkendall/)
