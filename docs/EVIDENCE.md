# Evidence

How we know the numbers on Data May Cry are right. Every value below is copied by `worker/report.py` from the result files in [`docs/evidence/`](evidence/); nothing is typed by hand. Pass criteria were written into the scripts before they were run and were not tuned afterwards.

| Group | Result | Script |
|---|---|---|
| Physical consistency of the data | 6 / 6 passed | `worker/evidence.py` |
| Statistical behaviour of the method | 3 / 3 passed | `worker/evidence_stats.py` |
| Independent sources (badges) | stations agree in 954 / 1013 regions; GISTEMP agree | `worker/badges.py` |
| Input provenance | 9 datasets with version, DOI/URL and SHA-256 | `worker/provenance.py` |

## 1. Physical consistency (real MERRA-2 data)

If the data were broken, it would break physics or miss documented events.

| # | Test | Expected (source) | Result | |
|---|---|---|---|---|
| P1 | **Water balance: global precipitation = global evaporation**<br>Over decades the atmosphere stores no extra water, so what evaporates must fall. | \|P − E\| / P < 3 %<br><small>Bosilovich, Robertson, Takacs et al. (2017), J. Climate 30, 1177–1196</small> | precip_mm_day = 2.9553, evap_mm_day = 2.9559, imbalance_pct = 0.02 | ✅ pass |
| P2 | **Clausius-Clapeyron: ocean humidity vs temperature**<br>Saturation vapour pressure grows ~7 % per K; with near-constant relative humidity, so does q. | 5–8 % per K<br><small>Held & Soden (2006), J. Climate 19, 5686–5702</small> | pct_per_K = 7.32, r = 0.996 | ✅ pass |
| P3 | **Arctic amplification**<br>Sea-ice and snow loss lower the surface albedo, so the Arctic warms faster than the globe. | Arctic (≥ 66.5°N) trend / global trend between 2 and 5<br><small>Rantanen et al. (2022), Communications Earth & Environment 3, 168</small> | arctic_C_per_decade = 0.443, global_C_per_decade = 0.162, ratio = 2.74 | ✅ pass |
| P4 | **Mount Pinatubo eruption (June 1991)**<br>Stratospheric sulfate aerosol reflects sunlight: aerosol optical depth peaks, the surface cools the next year. | global AOD maximum in 1991 or 1992 AND 1992 global T2M ≥ 0.1 °C below the 1990–91 mean<br><small>Hansen et al. (1992), GRL 19, 215–218; Soden et al. (2002), Science 296, 727–730</small> | aod_peak_year = 1992, aod_1992 = 0.2376, aod_mean_1980_2025 = 0.1415, t2m_1992_minus_1990_91_C = -0.254 | ✅ pass |
| P5 | **El Niño events in the tropical Pacific**<br>El Niño warms the central/east equatorial Pacific; the data must show the documented events. | ≥ 2 of the 3 warmest Niño-3.4 DJF anomalies are 1982–83, 1997–98, 2015–16<br><small>NOAA CPC Oceanic Niño Index (ONI) event list</small> | warmest_djf_dec_years = [2015, 2023, 1997], anomalies_C = [2.12, 1.83, 1.73] | ✅ pass |
| P6 | **Snow amount vs temperature (NH land 40–70°N)**<br>Warmer years melt more snow and turn more snowfall into rain. | correlation of annual snow and temperature anomalies < −0.3<br><small>Brown & Robinson (2011), The Cryosphere 5, 219–229</small> | r = -0.383, snow_mm_per_decade = -0.435, t2m_C_per_decade = 0.293 | ✅ pass |

## 2. Statistical behaviour of the method (synthetic data)

Synthetic monthly series shaped like the real ones (561 months, seasonal cycle, AR(1) noise), run through the same `protocol.analyze` as the real cards. Seed 20261114.

**S1 False alarms** — With no trend at all, how often does the card claim one? Criterion: possible-or-strong ≤ 7 % and strong ≤ 0.5 % for every phi. ✅ pass

| Noise autocorrelation φ | Runs | Says "possible" or "strong" | Says "strong" |
|---|---|---|---|
| 0.0 | 2000 | 3.75 % | 0.15 % |
| 0.3 | 2000 | 5.45 % | 0.25 % |
| 0.6 | 2000 | 5.35 % | 0.45 % |

**S2 Power** — If a real trend exists, how often do we detect it? (46 years, phi = 0.3) Criterion: a 0.3 SD/decade trend is detected in ≥ 90 % of runs. ✅ pass

| True trend (noise SD per decade) | Runs | Detected | "Strong" |
|---|---|---|---|
| 0.0 | 600 | 4.3 % | 0.2 % |
| 0.05 | 600 | 18.2 % | 2.7 % |
| 0.1 | 600 | 50.5 % | 16.7 % |
| 0.15 | 600 | 88.8 % | 52.5 % |
| 0.2 | 600 | 98.0 % | 83.2 % |
| 0.3 | 600 | 100.0 % | 99.3 % |
| 0.5 | 600 | 100.0 % | 100.0 % |

Where a real card sits: Diyarbakır (TR-21), T2M has a trend of 0.417 °C/decade and a monthly anomaly SD of 1.713 °C, i.e. 0.243 SD/decade.

**S3 Confidence-interval coverage** — Does the 95 % range contain the true trend about 95 % of the time? Criterion: coverage ≥ 90 % (PLAN §3.7-2b measured ~93 %). ✅ pass

| φ | Runs | 95 % range contains the true trend |
|---|---|---|
| 0.3 | 1000 | 94.9 % |
| 0.6 | 1000 | 95.1 % |

## 3. Independent sources

Rule (fixed in `contract/types.ts` before computing): *agree* = same direction and overlapping 95 % ranges.

| Source | Variable | Agree | Disagree | Inconclusive |
|---|---|---|---|---|
| NOAA GHCN-M v4 stations (1980–2025) | T2M | 954 (94 %) | 58 | 1 |
| NASA GPCP v3.3 (1983–2025) | PRECTOT | 2793 (57 %) | 811 | 1257 |

Global temperature vs NASA GISTEMP v4 (GLB.Ts+dSST), 1980–2025: **agree**. MERRA-2 0.16179 °C/decade (95 % 0.10872…0.21993), GISTEMP 0.20667 °C/decade (95 % 0.1625…0.24762), year-to-year correlation r = 0.968.
Stations used: 3383 of 23505 GHCN stations have ≥ 80 % complete years.

Where an independent source disagrees, the card never shows "strong evidence" for a period that covers at least 80 % of the comparison years (the default 1980–2025 card always does).

## 4. Software checks (run on every change)

| Check | Command |
|---|---|
| Python ↔ pymannkendall on 1,000 series, vectorized == scalar, calibration, FDR, int16 round trip | `cd worker && uv run pytest` |
| Python ↔ JavaScript parity of the full card (80 cases), data.ts on mock files | `cd web && npm test` |
| Every data file matches the contract (JSON Schema) | `cd worker && uv run validate.py <folder>` |

## 5. Inputs (provenance)

| Dataset | Version | DOI / URL | Files | Size | SHA-256 (all files) | Licence | Used for |
|---|---|---|---|---|---|---|---|
| NASA MERRA-2 M2TMNXSLV | 5.12.4 | https://doi.org/10.5067/AP1B0BA5PD2K | 561 | 636.3 MB | `50132405057220fd…` | NASA open data | main data |
| NASA MERRA-2 M2TMNXFLX | 5.12.4 | https://doi.org/10.5067/0JRLVL8YV2Y4 | 561 | 1496.1 MB | `47da299200079a8d…` | NASA open data | main data |
| NASA MERRA-2 M2TMNXLND | 5.12.4 | https://doi.org/10.5067/8S35XF81C28F | 561 | 332.4 MB | `99609949c0ff0893…` | NASA open data | main data |
| NASA MERRA-2 M2TMNXAER | 5.12.4 | https://doi.org/10.5067/FH9A0MLJPC7N | 561 | 361.6 MB | `04b51f51bd0a7ae2…` | NASA open data | main data |
| NASA MERRA-2 M2C0NXASM (constants) | 5.12.4 | https://doi.org/10.5067/ME5QX6Q5IGGU | 1 | 0.9 MB | `685b335e98b38ec0…` | NASA open data | land/ocean masks |
| NASA GPCP v3.3 monthly (GPCPMON) | 3.3 | https://doi.org/10.5067/MEASURES/GPCP/DATA306 | 516 | 488.5 MB | `2e3d9607618e63dc…` | NASA open data | independent precipitation check (badges) |
| NOAA GHCN-Monthly v4 TAVG, QC-adjusted (qcf) | v4.0.1.20261113 | https://doi.org/10.7289/V5XW4GTH | 2 | 174.8 MB | `cc6c2b12e0ead09f…` | US Government public domain | station temperature check (badges) |
| NASA GISTEMP v4 global land-ocean index | v4 | https://data.giss.nasa.gov/gistemp/ | 1 | 0.0 MB | `2995ffcfbda95226…` | NASA open data | global temperature check |
| Natural Earth 1:10m admin-0 countries + admin-1 provinces | 5.1.1 | https://www.naturalearthdata.com/ | 2 | 29.8 MB | `8f2c037d25d533e3…` | Public domain | region boundaries and cell overlap |

## 6. Known limitations

- MERRA-2 is a reanalysis (model + observations), not a direct measurement; that is why sections 1 and 3 exist.
- Runoff (RUNOFF) is marked experimental: in some cells monthly runoff far exceeds rainfall. It never gets "strong evidence".
- Precipitation agrees with GPCP less often than temperature agrees with stations; disagreeing regions are capped.
- Grid cells are about 55 × 55 km; provinces smaller than one cell are flagged as low resolution.
- A linear trend does not describe accelerating or reversing changes, and no statement here is about causes.

*Generated 2026-11-14 by `worker/report.py`. Written with AI assistance (Claude).*
