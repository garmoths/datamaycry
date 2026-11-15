# Requirements

Everything needed to develop and run Data May Cry: accounts, tools, packages, secrets and limits.
Versions were installed and verified on 2026-11-14. Exact versions are in the lock files: `web/package-lock.json` and `worker/uv.lock`.

| Part | Who | Language | Where it runs |
|---|---|---|---|
| **Backend (worker)** | Enes | Python | Enes's Mac (M2). No server in production |
| **Frontend (web)** | Rumet + Enes | TypeScript | Browser, static site on Vercel |
| **Contract** | Both | TS + JSON Schema | The shared file format between the two sides |

---

## 1. Accounts

| Account | Who | What for | Status |
|---|---|---|---|
| GitHub (`garmoths/datamaycry`, public) | Both | Code, PRs, CI | ✅ Rumet's invite pending |
| NASA Earthdata (https://urs.earthdata.nasa.gov) | Both | Downloading MERRA-2 | ✅ Enes (GES DISC approved) · ⬜ Rumet |
| Earthdata → **NASA GESDISC DATA ARCHIVE** application approval | Enes | Downloads return 403 without it | ✅ |
| Cloudflare R2 | Enes | Point mode tiles (~2.3 GB) | ✅ |
| Cloudflare budget alert ($1) | Enes | No surprise bills | ⬜ |
| Vercel (Hobby, repo owner's account) | Enes | Frontend hosting | ✅ |
| Copernicus CDS | Enes | ERA5 validation data (CC-BY) | ⬜ |
| Space Apps team registration (same Local Event) | Both | Submission | ✅ |

---

## 2. Backend (worker) — Python

### 2.1 Tools

| Tool | Version | Note |
|---|---|---|
| Python | **≥ 3.12** (3.13 in development) | `uv` installs the right version itself |
| [uv](https://docs.astral.sh/uv/) | ≥ 0.12 | Package and virtual environment manager |
| git | ≥ 2.40 | |

### 2.2 Setup

```bash
cd worker
uv sync                 # creates .venv, installs the versions in uv.lock
uv run mock.py          # generates the fake data and validates it against the contract
uv run validate.py ../web/public/data
```

For those not using `uv`, the same versions are in `requirements.txt`:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

### 2.3 Packages

| Package | Version | What for |
|---|---|---|
| `earthaccess` | 0.19.0 | Earthdata login, MERRA-2 granule search, authenticated HTTP session |
| `xarray` | 2026.9.0 | Reading NetCDF files |
| `h5netcdf`, `netCDF4` | 1.8.3, 1.7.5 | xarray's NetCDF4/HDF5 readers |
| `numpy` | 2.5.4 | Vectorized computation (MK + Sen) |
| `scipy` | 1.18.1 | Normal distribution, statistics helpers |
| `pandas` | 3.1.1 | Table operations |
| `pyarrow` | 26.0.1 | Intermediate Parquet files |
| `duckdb` | 2.0.0 | Local columnar database |
| `pymannkendall` | 1.4.3 | Reference MK test (parity test, pre-whitening) |
| `geopandas`, `shapely` | 1.2.0, 2.2.0 | Cell → province/country mapping, area weights |
| `boto3` | 1.43.117 | Uploading to R2 (S3 API) |
| `python-dotenv` | 1.2.4 | Reading the `.env` file |
| `jsonschema` | 4.26.0 | Validating generated files against the contract |
| `pytest` (dev) | ≥ 8 | Unit tests |

### 2.4 Optional tools

| Tool | What for |
|---|---|
| `tippecanoe` + `pmtiles` CLI | Converting Natural Earth borders to `boundaries.pmtiles` |
| `vercel` CLI | Manual deploys, environment variables |
| `caffeinate` (built into macOS) | Keeps the Mac awake during long jobs: `caffeinate -i uv run worker.py` |

### 2.5 Hardware and disk

- Apple M2, 8 cores, 16 GB RAM (MK + Sen for the whole world measured at ~20 min).
- **Disk target for the project ≤ 10 GB.** DuckDB estimated at 3–5 GB, ERA5 ~0.3 GB, temporary files deleted after download.

---

## 3. Frontend (web) — TypeScript

### 3.1 Tools

| Tool | Version | Note |
|---|---|---|
| Node.js | **20.19+ or 22.12+** (25.6.1 in development) | Required by Vite 8 |
| npm | ≥ 10 | Comes with Node |

### 3.2 Setup

```bash
cd web
npm install
npm run dev          # http://localhost:5173
npm test             # vitest: data.ts + Python↔JS parity tests
npm run typecheck    # tsc
npm run build        # dist/ (what Vercel publishes)
npm run preview      # local server for the demo if there is no internet
```

### 3.3 Packages

| Package | Version | What for |
|---|---|---|
| `react`, `react-dom` | 19.3 | Interface |
| `maplibre-gl` | 6.18 | 3D globe, country/province borders, selection, `flyTo` |
| `pmtiles` | 4.5 | Feeding the compressed border file to MapLibre |
| `plotly.js-basic-dist-min` | 4.3 | Time series chart, trend line. A light build with only scatter/bar instead of the full package (1.2 MB instead of 4.6 MB), same API |
| `motion` | 14.14 | UI animations (scale ladder, number counter, panel transitions); respects `prefers-reduced-motion` |
| `vite` (dev) | 8.3 | Dev server and build |
| `typescript` (dev) | 7.0 | Type checking (contract types) |
| `vitest` (dev) | 3.2 | Unit and parity tests |
| `@vitejs/plugin-react` (dev) | 6.1 | React support |
| `oxlint` (dev) | 1.90 | Lint |
| `@types/plotly.js-dist-min` (dev) | 2.3 | Plotly types (older than the library, some types may be missing) |

### 3.4 Browser

- **WebGL 2** support is required (for the globe). Without it, an error message and a flat map/list fallback are shown.
- Target: current Chrome, Safari, Firefox, Edge. To be tested on the demo device in advance.

---

## 4. Secrets (never go into git)

| What | Where | Who |
|---|---|---|
| Earthdata username + password | `~/.netrc` (permissions `600`) | Enes ✅ |
| R2 access keys | `worker/.env` | Enes |
| Copernicus CDS key | `~/.cdsapirc` | Enes |

`worker/.env` template: [`worker/.env.example`](worker/.env.example) (bucket: `data-may-cry`).

Only the **read** address goes into the frontend: `VITE_DATA_URL` (R2's public `r2.dev` address + `/v1/`, a Vercel environment variable, template: [`web/.env.example`](web/.env.example)). If left empty, the fake data (`web/public/data`) is used. The R2 write key never goes into the frontend.

---

## 5. Hosting limits

| Service | Limit | Our usage |
|---|---|---|
| Vercel Hobby | 100 MB and 15,000 files per deploy, 100 GB traffic per month | Only the site code + fake data (~18 MB). Real data never goes into git or Vercel |
| Cloudflare R2 (free) | 10 GB storage, 1 M writes, 10 M reads, free egress | **All real data:** 6,102 files, 2.17 GB (web part 64.8 MB + tiles 2.10 GB). Upload: `uv run upload.py` |
| `r2.dev` address | Rate-limited, for development | Accepted for the demo |

---

## 6. Data sources and licenses

| Source | What for | License |
|---|---|---|
| NASA MERRA-2 v5.12.4 (M2TMNXSLV, M2TMNXFLX, M2TMNXLND, M2TMNXAER) | Main data, 1980–present | NASA open data |
| NASA GISTEMP | Global temperature validation | NASA open data |
| NOAA GHCN-M v4 | Station validation | Public domain |
| Copernicus ERA5 | Second reanalysis (validation) | CC-BY |
| Natural Earth | Country and province borders | Public domain |
| NASA Blue Marble (GIBS, `BlueMarble_ShadedRelief_Bathymetry`) | Globe base layer (satellite view), loaded as tiles from GIBS at runtime, not stored in the repo | NASA open data |

All of them will be listed in the References section at submission. Our own code will be Apache-2.0 licensed.
