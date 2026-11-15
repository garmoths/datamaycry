/**
 * Globe helpers: boundary files, continents, and the 4×4 tile grid.
 *
 * Boundaries are map decoration, not data: they come from
 * public/boundaries (Natural Earth, public domain) and are the only files
 * the UI reads outside data.ts. Series always come from data.ts.
 *
 * Written with AI assistance (Claude).
 */
import type { FeatureCollection, Feature, LineString, Polygon, MultiPolygon, Position } from "geojson";
import type { ContinentId } from "./data.ts";

export type Bounds = [west: number, south: number, east: number, north: number];

export const WORLD: Bounds = [-180, -85, 180, 85];
const BOUNDARIES = `${import.meta.env.BASE_URL}boundaries/`;

export interface CountryProps {
  id: string;
  name_en: string;
  name_tr: string;
  continent: string;
}

export interface Admin1Props {
  id: string;
  country: string;
  name_en: string;
  name_tr: string;
}

export interface Boundaries {
  countries: FeatureCollection<Polygon | MultiPolygon, CountryProps>;
  /**
   * Provinces of the countries opened so far. Starts empty and grows as
   * loadAdmin1(country) fetches boundaries/admin1/{COUNTRY}.geojson
   * (one file per country; all 4,596 provinces at once would be ~6 MB).
   * Listen with onAdmin1Change to redraw.
   */
  admin1: FeatureCollection<Polygon | MultiPolygon, Admin1Props>;
}

let boundaries: Promise<Boundaries> | undefined;
export function loadBoundaries(): Promise<Boundaries> {
  boundaries ??= (async () => {
    const res = await fetch(`${BOUNDARIES}countries.geojson`);
    if (!res.ok) throw new Error(`${res.status} while loading boundaries/countries.geojson`);
    const countries = await res.json();
    return { countries, admin1: { type: "FeatureCollection", features: [] } } as Boundaries;
  })();
  boundaries.catch(() => (boundaries = undefined));
  return boundaries;
}

const admin1Loads = new Map<string, Promise<Feature<Polygon | MultiPolygon, Admin1Props>[]>>();
const admin1Listeners = new Set<() => void>();

/** Called after a country's provinces were added to Boundaries.admin1. Returns an unsubscribe. */
export function onAdmin1Change(fn: () => void): () => void {
  admin1Listeners.add(fn);
  return () => admin1Listeners.delete(fn);
}

/**
 * Read a province file. Seven of them (AIA, ATA, COL, KIR, MEX, RUS, VEN) carry one province
 * without a name, written as a bare `NaN` — which is not JSON, so the browser used to reject
 * the whole file and the country showed no provinces at all. Those values are read as
 * "no name" here and the province is labelled as an unnamed area.
 */
export function parseAdmin1(text: string): FeatureCollection<Polygon | MultiPolygon, Admin1Props> {
  const fc = JSON.parse(text.replace(/:\s*NaN\b/g, ":null")) as FeatureCollection<Polygon | MultiPolygon, Admin1Props>;
  for (const f of fc.features) {
    if (typeof f.properties.name_en !== "string" || !f.properties.name_en) f.properties.name_en = "Unnamed area";
    if (typeof f.properties.name_tr !== "string" || !f.properties.name_tr) f.properties.name_tr = "Adsız bölge";
  }
  return fc;
}

/**
 * Provinces of one country (ids identical to the data, see worker/boundaries.py).
 * Fetched once; a country without provinces resolves to [].
 */
export function loadAdmin1(country: string): Promise<Feature<Polygon | MultiPolygon, Admin1Props>[]> {
  let p = admin1Loads.get(country);
  if (!p) {
    p = (async () => {
      const b = await loadBoundaries();
      const res = await fetch(`${BOUNDARIES}admin1/${country}.geojson`);
      if (!res.ok) return [];
      const fc = parseAdmin1(await res.text());
      // a new object, so map sources and React memos see the change
      b.admin1 = { type: "FeatureCollection", features: [...b.admin1.features, ...fc.features] };
      admin1Listeners.forEach((fn) => fn());
      return fc.features;
    })();
    p.catch(() => admin1Loads.delete(country));
    admin1Loads.set(country, p);
  }
  return p;
}

/**
 * Bounding box of any polygon feature(s), antimeridian-aware: the box is computed both in
 * −180…180 and in 0…360 longitude and the narrower one wins, so Russia, Fiji or Chukotka
 * frame their own area instead of the whole world. East may exceed 180 (MapLibre accepts it).
 */
export function bboxOf(features: Feature<Polygon | MultiPolygon>[]): Bounds {
  let w = 180, e = -180, w2 = 360, e2 = 0, s = 90, n = -90;
  const walk = (c: unknown): void => {
    if (typeof (c as Position)[0] === "number") {
      const [x, y] = c as Position;
      const x2 = x < 0 ? x + 360 : x;
      if (x < w) w = x;
      if (x > e) e = x;
      if (x2 < w2) w2 = x2;
      if (x2 > e2) e2 = x2;
      if (y < s) s = y;
      if (y > n) n = y;
    } else (c as unknown[]).forEach(walk);
  };
  for (const f of features) walk(f.geometry.coordinates);
  if (e2 - w2 < e - w - 1e-9) return [w2 > 180 ? w2 - 360 : w2, s, w2 > 180 ? e2 - 360 : e2, n];
  return [w, s, e, n];
}

/** Continents → names + camera box. The two Americas stay separate (Natural Earth does the same). */
/** `code` is the contract's ContinentId (regions/continents.bin, data.getContinentSeries). */
export const CONTINENTS: { id: string; code: ContinentId; en: string; tr: string; bbox: Bounds }[] = [
  { id: "Africa", code: "AF", en: "Africa", tr: "Afrika", bbox: [-18, -35, 52, 38] },
  { id: "Asia", code: "AS", en: "Asia", tr: "Asya", bbox: [26, -10, 146, 56] },
  { id: "Europe", code: "EU", en: "Europe", tr: "Avrupa", bbox: [-25, 35, 45, 71] },
  { id: "North America", code: "NA", en: "North America", tr: "Kuzey Amerika", bbox: [-168, 7, -52, 72] },
  { id: "South America", code: "SA", en: "South America", tr: "Güney Amerika", bbox: [-82, -56, -34, 13] },
  { id: "Oceania", code: "OC", en: "Oceania", tr: "Okyanusya", bbox: [112, -48, 180, -5] },
  { id: "Antarctica", code: "AN", en: "Antarctica", tr: "Antarktika", bbox: [-180, -85, 180, -62] },
];

// ─── Scale ladder (Point mode) ──────────────────────────────────────────────
//
// Built on MERRA-2 cell indices, not degrees, so every level lines up with the
// data (PLAN.md §3.3, contract Grid/TileHeader):
//
//   0 World         361 × 576 cells
//   1 Block  30°×30°   60 × 48 cells   world splits 6 × 12
//   2 Tile   10°×10°   20 × 16 cells   block splits 3 × 3  = one R2 file tiles/{VAR}/{ty}_{tx}.bin
//   3 Sub    2.5°×2.5°  5 ×  4 cells   tile  splits 4 × 4
//   4 Cell   0.5°×0.625°               sub   splits 5 × 4  = one MERRA-2 grid cell
//
// The grid has 361 rows (−90…+90), so the top row of every level is one cell
// taller (the north-pole row), exactly like the contract's top tile row (21 rows).

const NLAT = 361;
const NLON = 576;
const DLAT = 0.5;
const DLON = 0.625;

/** A rectangle of grid cells: rows i0…i0+ni−1, columns j0…j0+nj−1. */
export interface Node {
  level: number;
  i0: number;
  j0: number;
  ni: number;
  nj: number;
}

export interface Scale {
  /** rows × columns this level splits into */
  split: [number, number] | null;
  en: string;
  tr: string;
  size: string;
}

export const SCALES: Scale[] = [
  { split: [6, 12], en: "World", tr: "Dünya", size: "360° × 180°" },
  { split: [3, 3], en: "Block", tr: "Blok", size: "30° × 30°" },
  { split: [4, 4], en: "Data tile", tr: "Veri karosu", size: "10° × 10°" },
  { split: [5, 4], en: "Sub-tile", tr: "Alt karo", size: "2.5° × 2.5°" },
  { split: null, en: "Grid cell", tr: "Izgara hücresi", size: "0.5° × 0.625°" },
];
export const CELL_LEVEL = SCALES.length - 1;

export const WORLD_NODE: Node = { level: 0, i0: 0, j0: 0, ni: NLAT, nj: NLON };

/** Split `n` cells into `parts` bands; the last band takes the remainder (pole row). */
function bands(start: number, n: number, parts: number): [number, number][] {
  const size = Math.floor(n / parts);
  return Array.from({ length: parts }, (_, k) => [start + k * size, k === parts - 1 ? n - k * size : size]);
}

/** Children of a node, row-major from the south-west. Empty at cell level. */
export function children(node: Node): Node[] {
  if (node.level >= CELL_LEVEL) return [];
  // a sub-tile splits into single cells: 5 × 4 normally, 6 × 4 in the pole row
  const split = node.level === CELL_LEVEL - 1 ? [node.ni, node.nj] : SCALES[node.level].split!;
  const out: Node[] = [];
  for (const [i0, ni] of bands(node.i0, node.ni, split[0]))
    for (const [j0, nj] of bands(node.j0, node.nj, split[1])) out.push({ level: node.level + 1, i0, j0, ni, nj });
  return out;
}

/** Edges sit half a cell around the grid points (cell centres are lat0 + i·dlat). */
export function nodeBounds(n: Node): Bounds {
  const lat = (i: number) => Math.max(-90, Math.min(90, -90 + (i - 0.5) * DLAT));
  const lon = (j: number) => -180 + (j - 0.5) * DLON;
  return [lon(n.j0), lat(n.i0), lon(n.j0 + n.nj), lat(n.i0 + n.ni)];
}

/** Centre of a node in degrees. For a cell this is exactly the grid point. */
export function nodeCenter(n: Node): { lat: number; lon: number } {
  const i = n.i0 + (n.ni - 1) / 2;
  const j = n.j0 + (n.nj - 1) / 2;
  return { lat: -90 + i * DLAT, lon: -180 + j * DLON };
}

/** Data tile (10°) a node at level ≥ 2 belongs to — same rule as data.ts tileOf. */
export function dataTileOf(n: Node): { ty: number; tx: number } {
  return { ty: Math.min(Math.floor(n.i0 / 20), 17), tx: Math.floor(n.j0 / 16) };
}

export interface TileProps {
  k: number;
  level: number;
  /** checkerboard colour: (row + column) is odd */
  odd: boolean;
}

function boxFeature(n: Node, k: number, odd: boolean) {
  const [w, s0, e, n0] = nodeBounds(n);
  const s = Math.max(s0, -85); // the globe raster stops at ±85°
  const nn = Math.min(n0, 85);
  return {
    type: "Feature" as const,
    properties: { k, level: n.level, odd },
    geometry: { type: "Polygon" as const, coordinates: [[[w, s], [e, s], [e, nn], [w, nn], [w, s]]] },
  };
}

/**
 * The whole globe cut by meridians and parallels into the 72 blocks (30°),
 * drawn as a checkerboard so the tile view always reads as "squared paper".
 */
export function globeChecker(): FeatureCollection<Polygon, TileProps> {
  // the 648 data tiles (10°), coloured like a chessboard by tile row + column
  const tiles = children(WORLD_NODE).flatMap(children);
  return {
    type: "FeatureCollection",
    features: tiles.map((t, k) => {
      const { ty, tx } = dataTileOf(t);
      return boxFeature(t, k, (ty + tx) % 2 === 1);
    }),
  };
}

/** Cell-edge latitude/longitude of grid row/column index k (edge between k−1 and k). */
const latEdge = (i: number) => -90 + (i - 0.5) * DLAT;
const lonEdge = (j: number) => -180 + (j - 0.5) * DLON;

/**
 * Every MERRA-2 cell edge on the whole globe as meridian/parallel lines (~940 lines,
 * far cheaper than 207 936 polygons). Each line is tagged with the coarsest scale it
 * belongs to (1 block … 4 cell) so the map can draw block lines bold and cell lines fine.
 */
export function gridLines(): FeatureCollection<LineString, { level: number }> {
  const levelOf = (k: number, perTile: number, perSub: number, perBlock: number) =>
    k % perBlock === 0 ? 1 : k % perTile === 0 ? 2 : k % perSub === 0 ? 3 : 4;
  const features: Feature<LineString, { level: number }>[] = [];
  // meridians: j = 0 … 575 (j = 0 is the −180.3° edge, same line as j = 576)
  for (let j = 0; j < NLON; j++) {
    const lon = lonEdge(j);
    const coords: Position[] = [];
    for (let lat = -85; lat <= 85; lat += 5) coords.push([lon, lat]);
    features.push({ type: "Feature", properties: { level: levelOf(j, 16, 4, 48) }, geometry: { type: "LineString", coordinates: coords } });
  }
  // parallels: rows 1 … 360, kept inside the ±85° the globe draws
  for (let i = 1; i < NLAT; i++) {
    const lat = latEdge(i);
    if (Math.abs(lat) > 85) continue;
    const coords: Position[] = [];
    for (let lon = -180; lon <= 180; lon += 10) coords.push([lon, lat]);
    features.push({ type: "Feature", properties: { level: levelOf(i, 20, 5, 60) }, geometry: { type: "LineString", coordinates: coords } });
  }
  return { type: "FeatureCollection", features };
}

/** The chain world → block → tile → sub-tile → cell that contains grid cell (i, j). */
export function pathToCell(i: number, j: number): Node[] {
  const path: Node[] = [WORLD_NODE];
  while (path[path.length - 1].level < CELL_LEVEL) {
    const next = children(path[path.length - 1]).find((c) => i >= c.i0 && i < c.i0 + c.ni && j >= c.j0 && j < c.j0 + c.nj);
    if (!next) break;
    path.push(next);
  }
  return path;
}

// ─── Points and boxes inside polygons (province dots, camera) ───────────────

type Ring = Position[];

/** Planar ring area in degrees² (Natural Earth cuts shapes at ±180°, so no wrap handling). */
function ringArea(r: Ring): number {
  let a = 0;
  for (let k = 0, n = r.length; k < n; k++) {
    const [x1, y1] = r[k];
    const [x2, y2] = r[(k + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

function inRing(x: number, y: number, r: Ring): boolean {
  let inside = false;
  for (let k = 0, j = r.length - 1; k < r.length; j = k++) {
    const [xi, yi] = r[k];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
function inPolygon(x: number, y: number, poly: Ring[]): boolean {
  if (!inRing(x, y, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) return false;
  return true;
}

export function polygonsOf(f: Feature<Polygon | MultiPolygon>): Ring[][] {
  return f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
}

/** Is (lon, lat) inside the feature? */
export function pointInFeature(lon: number, lat: number, f: Feature<Polygon | MultiPolygon>): boolean {
  return polygonsOf(f).some((p) => inPolygon(lon, lat, p));
}

/** Middle of the widest stretch of the polygon along latitude `y`, or null if the line misses it. */
function widestSpan(poly: Ring[], y: number): { x: number; width: number } | null {
  const xs: number[] = [];
  for (const r of poly)
    for (let k = 0, j = r.length - 1; k < r.length; j = k++) {
      const [xi, yi] = r[k];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
  xs.sort((a, b) => a - b);
  let best: { x: number; width: number } | null = null;
  for (let k = 0; k + 1 < xs.length; k += 2) {
    const width = xs[k + 1] - xs[k];
    if (!best || width > best.width) best = { x: (xs[k] + xs[k + 1]) / 2, width };
  }
  return best;
}

/**
 * Where to put a place's dot: a point that is always inside its largest polygon
 * (the bounding-box centre lands in the sea for crescents and island groups).
 * Area centroid first; if that falls outside, the middle of the widest stretch of land
 * on a few latitudes through the shape.
 */
export function labelPoint(f: Feature<Polygon | MultiPolygon>): { lon: number; lat: number } {
  const polys = polygonsOf(f);
  let poly = polys[0];
  let big = -1;
  for (const p of polys) {
    const a = ringArea(p[0]);
    if (a > big) {
      big = a;
      poly = p;
    }
  }
  const r = poly[0];
  let cx = 0, cy = 0, a2 = 0, s = 90, n = -90;
  for (let k = 0, m = r.length; k < m; k++) {
    const [x1, y1] = r[k];
    const [x2, y2] = r[(k + 1) % m];
    const w = x1 * y2 - x2 * y1;
    a2 += w;
    cx += (x1 + x2) * w;
    cy += (y1 + y2) * w;
    if (y1 < s) s = y1;
    if (y1 > n) n = y1;
  }
  if (a2 !== 0) {
    const c = { lon: cx / (3 * a2), lat: cy / (3 * a2) };
    if (inPolygon(c.lon, c.lat, poly)) return c;
  }
  let best: { x: number; width: number; y: number } | null = null;
  for (const q of [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9]) {
    const y = s + (n - s) * q;
    const span = widestSpan(poly, y);
    if (span && (!best || span.width > best.width)) best = { ...span, y };
  }
  return best ? { lon: best.x, lat: best.y } : { lon: r[0][0], lat: r[0][1] };
}

/**
 * Camera box of a country without its far-away small parts: only polygons at least a
 * fifth as large as the biggest one count (France without Guiana, the USA with Alaska
 * but without the far Aleutians).
 */
export function mainBbox(f: Feature<Polygon | MultiPolygon>): Bounds {
  const polys = polygonsOf(f);
  const areas = polys.map((p) => ringArea(p[0]));
  const big = Math.max(...areas);
  const keep = polys.filter((_, k) => areas[k] >= big * 0.2);
  return bboxOf([{ type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: keep } }]);
}
