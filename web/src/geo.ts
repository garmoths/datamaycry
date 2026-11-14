/**
 * Globe helpers: boundary files, continents, and the 4×4 tile grid.
 *
 * Boundaries are map decoration, not data: they come from
 * public/data/boundaries (Natural Earth, public domain) and are the only files
 * the UI reads outside data.ts. Series always come from data.ts.
 *
 * Written with AI assistance (Claude).
 */
import type { FeatureCollection, Feature, LineString, Polygon, MultiPolygon, Position } from "geojson";

export type Bounds = [west: number, south: number, east: number, north: number];

export const WORLD: Bounds = [-180, -85, 180, 85];
const BOUNDARIES = `${import.meta.env.BASE_URL}data/boundaries/`;

export interface CountryProps {
  id: string;
  name_en: string;
  name_tr: string;
  continent: string;
}

export interface Boundaries {
  countries: FeatureCollection<Polygon | MultiPolygon, CountryProps>;
  admin1: FeatureCollection<Polygon | MultiPolygon, { id: string; country: string; name_en: string; name_tr: string }>;
}

let boundaries: Promise<Boundaries> | undefined;
export function loadBoundaries(): Promise<Boundaries> {
  boundaries ??= (async () => {
    const [countries, admin1] = await Promise.all(
      ["countries", "admin1"].map(async (n) => {
        const res = await fetch(`${BOUNDARIES}${n}.geojson`);
        if (!res.ok) throw new Error(`${res.status} while loading boundaries/${n}.geojson`);
        return res.json();
      }),
    );
    return { countries, admin1 } as Boundaries;
  })();
  boundaries.catch(() => (boundaries = undefined));
  return boundaries;
}

/** Bounding box of any polygon feature(s). Handles the antimeridian crudely (Russia, Fiji…) by skipping far-east slivers. */
export function bboxOf(features: Feature<Polygon | MultiPolygon>[]): Bounds {
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (c: unknown): void => {
    if (typeof (c as Position)[0] === "number") {
      const [x, y] = c as Position;
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    } else (c as unknown[]).forEach(walk);
  };
  for (const f of features) walk(f.geometry.coordinates);
  return [w, s, e, n];
}

/** Continents → names + camera box. The two Americas stay separate (Natural Earth does the same). */
export const CONTINENTS: { id: string; en: string; tr: string; bbox: Bounds }[] = [
  { id: "Africa", en: "Africa", tr: "Afrika", bbox: [-18, -35, 52, 38] },
  { id: "Asia", en: "Asia", tr: "Asya", bbox: [26, -10, 146, 56] },
  { id: "Europe", en: "Europe", tr: "Avrupa", bbox: [-25, 35, 45, 71] },
  { id: "North America", en: "North America", tr: "Kuzey Amerika", bbox: [-168, 7, -52, 72] },
  { id: "South America", en: "South America", tr: "Güney Amerika", bbox: [-82, -56, -34, 13] },
  { id: "Oceania", en: "Oceania", tr: "Okyanusya", bbox: [112, -48, 180, -5] },
  { id: "Antarctica", en: "Antarctica", tr: "Antarktika", bbox: [-180, -85, 180, -62] },
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
