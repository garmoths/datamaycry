/**
 * Area summaries from the world trend map — for the world, any continent and any country.
 *
 * Only a few countries have monthly series in the data (regions/*.bin). So that every
 * place still tells the user something, these cards summarise the per-cell trend map:
 * the cells inside the place's borders (country polygons rasterised onto the MERRA-2
 * grid), an area-weighted (cos latitude) mean slope, and the share of area per evidence level.
 *
 * Written with AI assistance (Claude).
 */
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { TrendMap } from "./data.ts";
import { CONTINENTS, pointInFeature, polygonsOf, type Boundaries } from "./geo.ts";

const NLAT = 361;
const NLON = 576;

/**
 * Paint polygons onto the 576 × 361 grid (cell (i, j) = pixel (j, 360 − i)) and read back
 * an id per cell (0 = none). Ids are packed into red + 256 × green, so up to 65 535 shapes.
 */
function rasterize(features: Feature<Polygon | MultiPolygon>[], idOf: (f: Feature<Polygon | MultiPolygon>) => number): Uint16Array {
  const out = new Uint16Array(NLAT * NLON);
  const canvas = document.createElement("canvas");
  canvas.width = NLON;
  canvas.height = NLAT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return out;
  const x = (lon: number) => (lon + 180) / 0.625 + 0.5;
  const y = (lat: number) => (90 - lat) / 0.5 + 0.5;
  for (const f of features) {
    const id = idOf(f);
    if (!id) continue;
    ctx.fillStyle = `rgb(${id & 255},${id >> 8},0)`;
    ctx.beginPath();
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of polys)
      for (const ring of poly) {
        ring.forEach(([lon, lat], k) => (k ? ctx.lineTo(x(lon), y(lat)) : ctx.moveTo(x(lon), y(lat))));
        ctx.closePath();
      }
    ctx.fill("evenodd");
  }
  const px = ctx.getImageData(0, 0, NLON, NLAT).data;
  for (let row = 0; row < NLAT; row++) {
    const i = NLAT - 1 - row;
    for (let j = 0; j < NLON; j++) {
      const o = (row * NLON + j) * 4;
      // only fully covered pixels: anti-aliased edges could mix two neighbours
      if (px[o + 3] === 255) out[i * NLON + j] = px[o] + 256 * px[o + 1];
    }
  }
  return out;
}

/** Continent id per cell: CONTINENTS index + 1. */
export function rasterizeContinents(b: Boundaries): Uint16Array {
  return rasterize(b.countries.features, (f) => CONTINENTS.findIndex((c) => c.id === (f.properties as { continent?: string } | null)?.continent) + 1);
}

/** Country id per cell: position in b.countries.features + 1 (see countryCode). */
export function rasterizeCountries(b: Boundaries): Uint16Array {
  const index = new Map(b.countries.features.map((f, k) => [f, k + 1]));
  return rasterize(b.countries.features, (f) => index.get(f as never) ?? 0);
}

/** Grid id of a country (for summarize), or 0 if unknown. */
export function countryCode(b: Boundaries, id: string): number {
  return b.countries.features.findIndex((f) => f.properties.id === id) + 1;
}

export interface AreaSummary {
  /** area-weighted mean Sen slope, display units per decade */
  meanSlope: number;
  strongUp: number;
  strongDown: number;
  possible: number;
  none: number;
  cells: number;
  /** area-weighted spread (standard deviation) of the cell slopes */
  sd: number;
  /** area-weighted 10th / 50th / 90th percentile of the cell slopes */
  p10: number;
  median: number;
  p90: number;
  /** share of the area whose slope is above zero (any evidence level) */
  upShare: number;
  /** share of the area that passes the false-discovery-rate check */
  fdrShare: number;
  /** area share per slope bin; bins are equal steps from −histRange to +histRange */
  hist: number[];
  histRange: number;
}

const HIST_BINS = 21;

/**
 * Shares are fractions of the area that has data. `target` = the id painted in `grid`;
 * pass grid = null to summarise every cell with data (the whole world).
 */
export function summarize(map: TrendMap, grid: Uint16Array | null, target = 0): AreaSummary | null {
  const cells: number[] = [];
  for (let k = 0; k < NLAT * NLON; k++) if (!grid || grid[k] === target) cells.push(k);
  return summarizeCells(map, cells);
}

/** The same summary for an explicit list of grid cells (index = i · 576 + j). */
export function summarizeCells(map: TrendMap, list: ArrayLike<number>): AreaSummary | null {
  let w = 0, ws = 0, up = 0, down = 0, possible = 0, none = 0, rising = 0, fdr = 0;
  const pts: [slope: number, weight: number][] = [];
  for (let n = 0; n < list.length; n++) {
    const k = list[n];
    const lvl = map.level[k];
    const slope = map.slopePerDecade[k];
    if (lvl === 255 || !Number.isFinite(slope)) continue; // "no data" never counts as 0
    const a = Math.cos(((-90 + Math.floor(k / NLON) * 0.5) * Math.PI) / 180);
    if (a <= 0) continue; // the two pole points have no area
    w += a;
    ws += a * slope;
    pts.push([slope, a]);
    if (slope > 0) rising += a;
    if (map.fdr[k] === 1) fdr += a;
    if (lvl === 2 && slope >= 0) up += a;
    else if (lvl === 2) down += a;
    else if (lvl === 1) possible += a;
    else none += a;
  }
  if (!pts.length || w <= 0) return null;
  const mean = ws / w;
  pts.sort((a, b) => a[0] - b[0]);
  // weighted percentiles: walk the sorted cells until that share of the area is reached
  const quantile = (q: number) => {
    let acc = 0;
    for (const [s, a] of pts) {
      acc += a;
      if (acc >= q * w) return s;
    }
    return pts[pts.length - 1][0];
  };
  let varSum = 0;
  for (const [s, a] of pts) varSum += a * (s - mean) ** 2;
  // histogram range: symmetric around zero, wide enough for 98 % of the area
  const histRange = Math.max(Math.abs(quantile(0.01)), Math.abs(quantile(0.99)), 1e-9);
  const hist = new Array<number>(HIST_BINS).fill(0);
  for (const [s, a] of pts) {
    const b = Math.floor(((s + histRange) / (2 * histRange)) * HIST_BINS);
    hist[Math.min(HIST_BINS - 1, Math.max(0, b))] += a / w;
  }
  return {
    meanSlope: mean,
    strongUp: up / w,
    strongDown: down / w,
    possible: possible / w,
    none: none / w,
    cells: pts.length,
    sd: Math.sqrt(varSum / w),
    p10: quantile(0.1),
    median: quantile(0.5),
    p90: quantile(0.9),
    upShare: rising / w,
    fdrShare: fdr / w,
    hist,
    histRange,
  };
}

/**
 * Grid cells whose centre lies inside a shape (a province). Exact point-in-polygon on each
 * polygon's own box, so small provinces are not lost the way they are when painting a canvas.
 * A shape smaller than one cell gets the single cell nearest to `fallback`.
 */
export function cellsInside(f: Feature<Polygon | MultiPolygon>, fallback?: { lon: number; lat: number }): number[] {
  const out = new Set<number>();
  for (const poly of polygonsOf(f)) {
    let w = 180, e = -180, s = 90, n = -90;
    for (const [x, y] of poly[0]) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
    const one = { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: poly } };
    const i0 = Math.max(0, Math.ceil((s + 90) / 0.5));
    const i1 = Math.min(NLAT - 1, Math.floor((n + 90) / 0.5));
    const j0 = Math.max(0, Math.ceil((w + 180) / 0.625));
    const j1 = Math.min(NLON - 1, Math.floor((e + 180) / 0.625));
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) if (pointInFeature(-180 + j * 0.625, -90 + i * 0.5, one)) out.add(i * NLON + j);
  }
  if (!out.size && fallback) {
    const i = Math.min(NLAT - 1, Math.max(0, Math.round((fallback.lat + 90) / 0.5)));
    const j = ((Math.round((fallback.lon + 180) / 0.625) % NLON) + NLON) % NLON;
    out.add(i * NLON + j);
  }
  return [...out];
}

/** @deprecated name kept for older imports */
export type ContinentSummary = AreaSummary;
