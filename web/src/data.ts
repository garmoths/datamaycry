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
  DMC_MAGIC,
  MISSING_INT16,
  SCHEMA_VERSION,
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

export { analyzeTrend, anomalies, monthLabels } from "./trend.ts";
export type * from "../../contract/types.ts";

const DATA_URL = `${import.meta.env.BASE_URL}data/`;
/** Point-mode tiles live on Cloudflare R2 in production (set VITE_TILES_URL). */
const TILES_URL: string = import.meta.env.VITE_TILES_URL ?? `${DATA_URL}tiles/`;

export class DataError extends Error {}

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

function checkVersion(v: string, what: string): void {
  const major = (s: string) => s.split(".")[0];
  if (major(v) !== major(SCHEMA_VERSION)) {
    throw new DataError(
      `${what}: schema ${v} is not compatible with this app (${SCHEMA_VERSION})`,
    );
  }
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

/** Parse a "DMC1" binary file into its JSON header and int16 payload. */
export function parseDmc<H extends { schema_version: string }>(
  buf: ArrayBuffer,
  what: string,
): { header: H; data: Int16Array } {
  const view = new DataView(buf);
  const magic = String.fromCharCode(...new Uint8Array(buf, 0, 4));
  if (magic !== DMC_MAGIC) throw new DataError(`${what}: not a DMC1 file`);
  const hlen = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hlen))) as H;
  checkVersion(header.schema_version, what);
  const offset = 8 + hlen;
  if (offset % 8 !== 0) throw new DataError(`${what}: header not padded to 8 bytes`);
  // Payload is little-endian int16; every Apple/Intel/ARM browser is little-endian.
  const data = new Int16Array(buf, offset, (buf.byteLength - offset) / 2);
  return { header, data };
}

async function fetchDmc<H extends { schema_version: string }>(url: string) {
  return parseDmc<H>(await (await fetchOk(url)).arrayBuffer(), url);
}

function unpack(raw: Int16Array, p: Packing): Float64Array {
  const out = new Float64Array(raw.length);
  for (let k = 0; k < raw.length; k++) {
    out[k] = raw[k] === MISSING_INT16 ? NaN : raw[k] * p.scale + p.offset;
  }
  return out;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function loadVariables(): Promise<VariablesFile> {
  return cached("variables", () => fetchJson<VariablesFile>(`${DATA_URL}variables.json`));
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
  };
}

/** Grid cell nearest to a coordinate. */
export function cellOf(lat: number, lon: number): { i: number; j: number; lat: number; lon: number } {
  const i = Math.min(360, Math.max(0, Math.round((lat + 90) / 0.5)));
  const j = (((Math.round((lon + 180) / 0.625) % 576) + 576) % 576);
  return { i, j, lat: -90 + i * 0.5, lon: -180 + j * 0.625 };
}

/** Tile that contains cell (i, j). The top tile row (ty = 17) holds 21 rows. */
export function tileOf(i: number, j: number): { tx: number; ty: number } {
  return { ty: Math.min(Math.floor(i / 20), 17), tx: Math.floor(j / 16) };
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
