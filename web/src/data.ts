/**
 * data.ts — the ONLY place the UI gets data from (PLAN.md §8, §9).
 *
 * UI code (globe, panels, chart, result card) calls these functions and never
 * reads files directly. Day 1 they read mock files from /public/data,
 * Day 2 the same files are replaced with real ones — no UI change needed.
 *
 *   loadVariables()                         → variables + units + descriptions
 *   listCountries()                         → countries and their provinces
 *   getRegionSeries(country, admin1, var)   → monthly series (Region mode)
 *   getPointSeries(lat, lon, var)           → monthly series (Point mode)
 *   getTrendMap(var)                        → per-cell slope / p / level (world map)
 *   analyzeTrend(series, options)           → result card numbers
 *   anomalies(series), monthLabels(series)  → chart helpers
 *
 * Written with AI assistance (Claude).
 */
import {
  MISSING_INT16,
  type AnomalyFrames,
  type AnomalyFramesHeader,
  type ContinentId,
  type Packing,
  type RegionHeader,
  type RegionIndexFile,
  type Series,
  type TileHeader,
  type TrendMap,
  type TrendMapHeader,
  type VarId,
  type VariableInfo,
  type VariablesFile,
} from "../../contract/types.ts";

import { analyzeTrend as analyzeRaw } from "./trend.ts";
import { cellOf, checkVersion, DataError, parseDmc, tileOf, unpack } from "./dmc.ts";
import { applyCaps } from "./caps.ts";
export { cellOf, DataError, parseDmc, tileOf } from "./dmc.ts";
import type { Badge, BadgesFile, TrendOptions, TrendResult } from "../../contract/types.ts";

export { anomalies, monthLabels } from "./trend.ts";
export type * from "../../contract/types.ts";

/** Variables flagged `experimental` in variables.json (filled by loadVariables). */
const experimental = new Set<VarId>();
/** Badges per region (filled by loadBadges; empty until loaded or if the file is missing). */
let badgeIndex: Record<string, Badge[]> = {};

/**
 * Result card numbers for a series, with the shared capping rules (caps.ts): "strong" is
 * lowered to "possible" for experimental variables or when an independent source disagrees.
 * Region series also get their `badges` for this variable.
 */
export function analyzeTrend(series: Series, opts?: TrendOptions): TrendResult {
  const badges = series.region ? (badgeIndex[series.region] ?? []).filter((b) => b.var === series.var) : [];
  return applyCaps(analyzeRaw(series, opts), experimental.has(series.var), badges);
}

/** 1.3: independent-source badges for all regions (GPCP precipitation, GHCN stations). */
export function loadBadges(): Promise<Record<string, Badge[]>> {
  return cached("badges", async () => {
    const res = await fetch(`${DATA_URL}regions/badges.json`);
    if (!res.ok) return (badgeIndex = {}); // optional file: no badges, no error
    const doc = (await res.json()) as BadgesFile;
    checkVersion(doc.schema_version, "badges.json");
    return (badgeIndex = doc.regions);
  });
}

/** Badges of one region (continent, country or province), all variables. */
export async function getBadges(regionId: string): Promise<Badge[]> {
  return (await loadBadges())[regionId] ?? [];
}

/**
 * Where the data files live.
 *  - Local development and tests: unset → mock files in web/public/data/
 *  - Production (Vercel env var): VITE_DATA_URL = public Cloudflare R2 URL with the real files
 * Tiles default to `${DATA_URL}tiles/`; VITE_TILES_URL can override them separately.
 */
function withSlash(u: string): string {
  return u.endsWith("/") ? u : `${u}/`;
}
const DATA_URL: string = withSlash(import.meta.env.VITE_DATA_URL || `${import.meta.env.BASE_URL}data/`);
const TILES_URL: string = withSlash(import.meta.env.VITE_TILES_URL || `${DATA_URL}tiles/`);

/** Base URL data is read from (shown in the About page / for debugging). */
export const dataSource = { data: DATA_URL, tiles: TILES_URL };


// ─── Small caches so repeated clicks don't refetch ──────────────────────────
const cache = new Map<string, Promise<unknown>>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    const p = load();
    p.catch(() => cache.delete(key)); // allow retry after a failure
    cache.set(key, p);
  }
  return cache.get(key) as Promise<T>;
}


async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new DataError(`${res.status} while loading ${url}`);
  return res;
}

async function fetchJson<T extends { schema_version: string }>(url: string): Promise<T> {
  const json = (await (await fetchOk(url)).json()) as T;
  checkVersion(json.schema_version, url);
  return json;
}


async function fetchDmc<H extends { schema_version: string }>(url: string) {
  return parseDmc<H>(await (await fetchOk(url)).arrayBuffer(), url);
}


// ─── Public API ─────────────────────────────────────────────────────────────

export function loadVariables(): Promise<VariablesFile> {
  return cached("variables", async () => {
    const v = await fetchJson<VariablesFile>(`${DATA_URL}variables.json`);
    for (const x of v.variables) if (x.experimental) experimental.add(x.id);
    return v;
  });
}

export async function getVariable(id: VarId): Promise<VariableInfo> {
  const v = (await loadVariables()).variables.find((x) => x.id === id);
  if (!v) throw new DataError(`Unknown variable ${id}`);
  return v;
}

export function listCountries(): Promise<RegionIndexFile> {
  return cached("regions", () => fetchJson<RegionIndexFile>(`${DATA_URL}regions/index.json`));
}

/**
 * Monthly series for a country (admin1 = null) or one of its provinces.
 * Example: getRegionSeries("TUR", "TR-21", "T2M") → Diyarbakır temperature.
 */
export async function getRegionSeries(
  country: string,
  admin1: string | null,
  varId: VarId,
): Promise<Series> {
  const [file, index, info] = await Promise.all([
    cached(`region:${country}`, () => fetchDmc<RegionHeader>(`${DATA_URL}regions/${country}.bin`)),
    listCountries(),
    getVariable(varId),
    loadBadges(),
  ]);
  const { header, data } = file;
  const r = admin1 === null ? 0 : header.regions.findIndex((x) => x.id === admin1);
  if (r < 0) throw new DataError(`No data for ${country}/${admin1}`);
  const v = header.vars.indexOf(varId);
  if (v < 0) throw new DataError(`${varId} not in ${country}.bin`);
  const n = header.months;
  const at = (r * header.vars.length + v) * n;

  const c = index.countries.find((x) => x.id === country);
  const a = c?.admin1.find((x) => x.id === admin1);
  const cname = c?.name ?? { en: country, tr: country };
  const label = a
    ? { en: `${a.name.en}, ${cname.en}`, tr: `${a.name.tr}, ${cname.tr}` }
    : cname;

  return {
    var: varId,
    unit: info.unit,
    start: header.start,
    values: unpack(data.subarray(at, at + n), header.packing[v]),
    label,
    region: admin1 ?? country,
  };
}

/**
 * 1.2: monthly series for a continent ("AF", "AN", "AS", "EU", "NA", "OC", "SA").
 * Example: getContinentSeries("EU", "T2M").
 */
export async function getContinentSeries(continent: ContinentId, varId: VarId): Promise<Series> {
  const [file, index, info] = await Promise.all([
    cached("region:continents", () => fetchDmc<RegionHeader>(`${DATA_URL}regions/continents.bin`)),
    listCountries(),
    getVariable(varId),
    loadBadges(),
  ]);
  const { header, data } = file;
  const r = header.regions.findIndex((x) => x.id === continent);
  if (r < 0) throw new DataError(`No data for continent ${continent}`);
  const v = header.vars.indexOf(varId);
  if (v < 0) throw new DataError(`${varId} not in continents.bin`);
  const n = header.months;
  const at = (r * header.vars.length + v) * n;
  const c = index.continents?.find((x) => x.id === continent);
  return {
    var: varId,
    unit: info.unit,
    start: header.start,
    values: unpack(data.subarray(at, at + n), header.packing[v]),
    label: c?.name ?? { en: continent, tr: continent },
    region: continent,
  };
}



function fmtCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lon).toFixed(2)}°${ew}`;
}

/** Monthly series for the grid cell nearest to (lat, lon). Point mode. */
export async function getPointSeries(lat: number, lon: number, varId: VarId): Promise<Series> {
  const cell = cellOf(lat, lon);
  const { tx, ty } = tileOf(cell.i, cell.j);
  const [{ header, data }, info] = await Promise.all([
    cached(`tile:${varId}:${ty}_${tx}`, () =>
      fetchDmc<TileHeader>(`${TILES_URL}${varId}/${ty}_${tx}.bin`),
    ),
    getVariable(varId),
  ]);
  const k = (cell.i - header.i0) * header.nlon + (cell.j - header.j0);
  const n = header.months;
  const text = fmtCoord(cell.lat, cell.lon);
  return {
    var: varId,
    unit: info.unit,
    start: header.start,
    values: unpack(data.subarray(k * n, (k + 1) * n), header.packing),
    label: { en: text, tr: text },
  };
}

/** Per-cell trend for the world map. Index = i * 576 + j. */
export function getTrendMap(varId: VarId): Promise<TrendMap> {
  return cached(`trend:${varId}`, async () => {
    const { header, data } = await fetchDmc<TrendMapHeader>(`${DATA_URL}trend_map/${varId}.bin`);
    const ncell = header.grid.nlat * header.grid.nlon;
    const field = (name: TrendMapHeader["fields"][number]) => {
      const f = header.fields.indexOf(name);
      if (f < 0) throw new DataError(`trend_map/${varId}: missing field ${name}`);
      return { raw: data.subarray(f * ncell, (f + 1) * ncell), p: header.packing[f] };
    };
    const toF32 = (x: { raw: Int16Array; p: Packing }) => Float32Array.from(unpack(x.raw, x.p));
    const toU8 = (x: { raw: Int16Array }) =>
      Uint8Array.from(x.raw, (v) => (v === MISSING_INT16 ? 255 : v));
    return {
      var: header.var,
      grid: header.grid,
      years: header.years,
      slopePerDecade: toF32(field("slope_per_decade")),
      pValue: toF32(field("p_value")),
      level: toU8(field("level")),
      fdr: toU8(field("fdr")),
    };
  });
}

// ─── 1.4: yearly anomaly maps for the "time travel" animation ──────────────

/** One map per year (1980–2025) of the difference from the 1991–2020 normal. */
const framesOrder: string[] = [];
export function getAnomalyFrames(varId: VarId): Promise<AnomalyFrames> {
  // ~10 MB per variable once unpacked: keep the last two in memory (phones)
  const key = `frames:${varId}`;
  const at = framesOrder.indexOf(key);
  if (at >= 0) framesOrder.splice(at, 1);
  framesOrder.push(key);
  while (framesOrder.length > 2) cache.delete(framesOrder.shift()!);
  return cached(key, async () => {
    const { header, data } = await fetchDmc<AnomalyFramesHeader>(`${DATA_URL}anomaly_frames/${varId}.bin`);
    const years = Array.from({ length: header.years.end - header.years.start + 1 }, (_, k) => header.years.start + k);
    return {
      var: header.var,
      grid: header.grid,
      years,
      values: Float32Array.from(unpack(data, header.packing)),
      colorMax: header.color_max,
    };
  });
}

/** Area-weighted (cos latitude) mean of frame k over cells with data. */
export function frameMean(f: AnomalyFrames, k: number): number {
  const { nlat, nlon, lat0, dlat } = f.grid;
  const off = k * nlat * nlon;
  let s = 0, w = 0;
  for (let i = 0; i < nlat; i++) {
    const wi = Math.cos(((lat0 + i * dlat) * Math.PI) / 180);
    if (wi <= 0) continue;
    for (let j = 0; j < nlon; j++) {
      const v = f.values[off + i * nlon + j];
      if (Number.isFinite(v)) {
        s += wi * v;
        w += wi;
      }
    }
  }
  return w > 0 ? s / w : NaN;
}

/** Centred running mean over `window` years for every cell (NaN-aware; edges use the years available). */
export function runningFrames(f: AnomalyFrames, window = 5): AnomalyFrames {
  const n = f.grid.nlat * f.grid.nlon;
  const ny = f.years.length;
  const half = Math.floor(window / 2);
  const out = new Float32Array(f.values.length);
  for (let c = 0; c < n; c++) {
    for (let k = 0; k < ny; k++) {
      let s = 0, m = 0;
      for (let q = Math.max(0, k - half); q <= Math.min(ny - 1, k + half); q++) {
        const v = f.values[q * n + c];
        if (Number.isFinite(v)) {
          s += v;
          m++;
        }
      }
      out[k * n + c] = m ? s / m : NaN;
    }
  }
  return { ...f, values: out };
}
