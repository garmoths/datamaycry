/**
 * Data May Cry — file format contract (single source of truth).
 *
 * Every file the worker (Python) produces and the web app (TypeScript) reads
 * is described here. The same structure exists as JSON Schema in
 * `contract/schema/*.json` so Python can validate its own output.
 *
 * Change rules (PLAN.md §9):
 *  - Adding a field  → minor bump (1.0 → 1.1). Old code keeps working.
 *  - Removing / renaming → major bump (2.0), both Enes and Rumet must agree.
 *  - One PR: types.ts + schema + worker/mock.py + web/src/data.ts + CHANGELOG.md.
 *
 * Written with AI assistance (Claude).
 */

export const SCHEMA_VERSION = "1.1" as const;

// ─────────────────────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────────────────────

/** MERRA-2 variable ids. Order here = order inside multi-variable files. */
export type VarId =
  | "T2M"
  | "QV2M"
  | "SPEED"
  | "PRECTOT"
  | "EVAP"
  | "GWETROOT"
  | "RUNOFF"
  | "SNOMAS"
  | "TOTEXTTAU";

/** Year-month, e.g. "1980-01". */
export type YearMonth = string;

/** Text in both UI languages (PLAN.md decision #16). */
export interface I18nText {
  en: string;
  tr: string;
}

/**
 * Global MERRA-2 grid. Cell (i, j): lat = lat0 + i*dlat, lon = lon0 + j*dlon.
 * cell_id = i * nlon + j.
 */
export interface Grid {
  nlat: 361;
  nlon: 576;
  lat0: -90;
  lon0: -180;
  dlat: 0.5;
  dlon: 0.625;
}

/**
 * int16 packing. Stored values are already converted to display units.
 *   value = int16 * scale + offset
 *   int16 == MISSING_INT16 → NaN ("no data", never shown as 0)
 */
export interface Packing {
  scale: number;
  offset: number;
}

export const MISSING_INT16 = -32768;

// ─────────────────────────────────────────────────────────────────────────────
// 1) variables.json  (Vercel: /data/variables.json)
// ─────────────────────────────────────────────────────────────────────────────

export interface VariableInfo {
  id: VarId;
  /** MERRA-2 collection, e.g. "M2TMNXSLV". */
  collection: string;
  name: I18nText;
  /** One or two plain sentences for students. */
  description: I18nText;
  /** Unit shown to the user, e.g. "°C", "mm/day". */
  unit: string;
  /** Raw MERRA-2 unit, for the Methods page. */
  unit_raw: string;
  /** display = raw * mul + add */
  convert: { mul: number; add: number };
  packing: Packing;
  /** Decimals to show in the UI. */
  decimals: number;
  /** Only defined over land (ocean cells are NaN). */
  land_only: boolean;
  /** Permanent footnote, e.g. observing-system changes (PLAN.md L5). */
  caveat?: I18nText;
  /**
   * 1.1: known data-quality problems. The variable is shown, but analyzeTrend
   * never gives it the "strong" level and the card must show `caveat`.
   * (RUNOFF: monthly runoff far above precipitation in ~1,200 cells, more often after 2016.)
   */
  experimental?: boolean;
  /** 1.1: the MERRA-2 field actually used, when it differs from `id` (e.g. "PRECTOTCORR"). */
  source_field?: string;
}

export interface VariablesFile {
  schema_version: string;
  kind: "variables";
  /** e.g. "MERRA-2 v5.12.4" */
  dataset: string;
  /** ISO date the worker produced the files. "mock" data says so here. */
  processed_at: string;
  is_mock: boolean;
  grid: Grid;
  /** First and last month in every series file. */
  period: { start: YearMonth; end: YearMonth; months: number };
  /** Only complete years enter trend tests (PLAN.md §10.4-1). */
  test_years: { start: number; end: number };
  /** Anomaly reference period (WMO normal). */
  baseline_years: { start: 1991; end: 2020 };
  variables: VariableInfo[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) regions/index.json  (Vercel: /data/regions/index.json)
// ─────────────────────────────────────────────────────────────────────────────

export interface Admin1Info {
  /** Natural Earth admin-1 code (iso_3166_2 when present), e.g. "TR-21". */
  id: string;
  name: I18nText;
}

export interface CountryInfo {
  /** Natural Earth ADM0_A3, e.g. "TUR". Also the file name: regions/TUR.bin */
  id: string;
  name: I18nText;
  /** [minLon, minLat, maxLon, maxLat] for flyTo. */
  bbox: [number, number, number, number];
  admin1: Admin1Info[];
}

export interface RegionIndexFile {
  schema_version: string;
  kind: "region_index";
  countries: CountryInfo[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Binary container "DMC1" — used by regions/*.bin, trend_map/*.bin, tiles/*.bin
//
//   bytes 0..3   ASCII "DMC1"
//   bytes 4..7   uint32 little-endian H = header length in bytes
//   bytes 8..    UTF-8 JSON header (H bytes), space-padded so that
//                8 + H is a multiple of 8
//   then         payload: int16 little-endian, layout given by the header
// ─────────────────────────────────────────────────────────────────────────────

export const DMC_MAGIC = "DMC1";

// 3) regions/{COUNTRY}.bin — country + its admin-1 monthly series
//    payload layout: [region][var][month]  (region-major)
export interface RegionHeader {
  schema_version: string;
  kind: "region";
  country: string;
  start: YearMonth;
  months: number;
  /** Same order as payload. Index 0 is always the whole country. */
  regions: { id: string; level: "country" | "admin1" }[];
  vars: VarId[];
  /** Per-variable packing, same order as `vars`. */
  packing: Packing[];
}

// 4) trend_map/{VAR}.bin — one value per grid cell for the world map
//    payload layout: [field][cell_id]  (field-major, cell_id = i*nlon + j)
export type TrendField = "slope_per_decade" | "p_value" | "level" | "fdr";
export interface TrendMapHeader {
  schema_version: string;
  kind: "trend_map";
  var: VarId;
  grid: Grid;
  years: { start: number; end: number };
  fields: TrendField[];
  /** Same order as `fields`.
   *  level: 0 = none, 1 = possible, 2 = strong (scale 1, offset 0)
   *  fdr:   1 = passes Benjamini-Hochberg q=0.05, 0 = not       */
  packing: Packing[];
}

// 5) tiles/{VAR}/{ty}_{tx}.bin — 10°×10° tile for Point mode (Cloudflare R2)
//    ty = 0..17 (south→north), tx = 0..35 (west→east)
//    rows i0..i0+nlat-1 (last tile row has 21 rows: includes the north pole row)
//    payload layout: [cell][month], cell = (i - i0) * nlon + (j - j0)
export interface TileHeader {
  schema_version: string;
  kind: "tile";
  var: VarId;
  tx: number;
  ty: number;
  i0: number;
  j0: number;
  nlat: number;
  nlon: number;
  start: YearMonth;
  months: number;
  packing: Packing;
}

// ─────────────────────────────────────────────────────────────────────────────
// data.ts public API (what the UI calls). Rumet only uses these.
// ─────────────────────────────────────────────────────────────────────────────

/** A monthly time series in display units. NaN = missing. */
export interface Series {
  var: VarId;
  unit: string;
  start: YearMonth;
  values: Float64Array;
  /** Human label: "Diyarbakır, Türkiye" or "37.50°N, 40.00°E". */
  label: I18nText;
}

export type TrendLevel = "strong" | "possible" | "none";

export type TrendStatus =
  | "ok"
  | "too_short" // fewer than 10 years selected
  | "insufficient_data" // > 20% of years missing
  | "constant"; // series has no variation (e.g. snow = 0 in the Sahara)

export interface TrendOptions {
  startYear?: number; // default: test_years.start
  endYear?: number; // default: test_years.end
  /** Months to average per year. Default all 12. Summer = [6,7,8]. */
  months?: number[];
}

export interface TrendResult {
  status: TrendStatus;
  startYear: number;
  endYear: number;
  nYears: number;
  /** Sen's slope, display units per 10 years. */
  slopePerDecade: number;
  /** 95% CI of the slope, effective-sample corrected (PLAN.md §3.7-2b). */
  ci95: [number, number];
  /** Mann-Kendall two-sided p on annual mean anomalies. */
  pValue: number;
  level: TrendLevel;
  /** 1.1: true when the variable is experimental and "strong" was lowered to "possible". */
  capped?: boolean;
  /** slopePerDecade × (nYears − 1) / 10 */
  totalChange: number;
  /** Annual mean anomalies used for the test (for the chart). */
  annual: { years: number[]; anomalies: number[] };
  /** Trend line on the anomaly chart: y = intercept + slopePerYear * (year − startYear). */
  line: { intercept: number; slopePerYear: number };
}

export interface TrendMap {
  var: VarId;
  grid: Grid;
  years: { start: number; end: number };
  slopePerDecade: Float32Array; // NaN = no data
  pValue: Float32Array;
  level: Uint8Array; // 0 none, 1 possible, 2 strong, 255 no data
  fdr: Uint8Array; // 1 passes FDR
}
