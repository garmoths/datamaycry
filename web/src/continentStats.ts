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
import { CONTINENTS, type Boundaries } from "./geo.ts";

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
}

/**
 * Shares are fractions of the area that has data. `target` = the id painted in `grid`;
 * pass grid = null to summarise every cell with data (the whole world).
 */
export function summarize(map: TrendMap, grid: Uint16Array | null, target = 0): AreaSummary | null {
  let w = 0, ws = 0, up = 0, down = 0, possible = 0, none = 0, cells = 0;
  for (let k = 0; k < NLAT * NLON; k++) {
    if (grid && grid[k] !== target) continue;
    const lvl = map.level[k];
    const slope = map.slopePerDecade[k];
    if (lvl === 255 || !Number.isFinite(slope)) continue; // "no data" never counts as 0
    const a = Math.cos(((-90 + Math.floor(k / NLON) * 0.5) * Math.PI) / 180);
    w += a;
    ws += a * slope;
    cells++;
    if (lvl === 2 && slope >= 0) up += a;
    else if (lvl === 2) down += a;
    else if (lvl === 1) possible += a;
    else none += a;
  }
  if (!cells || w <= 0) return null;
  return { meanSlope: ws / w, strongUp: up / w, strongDown: down / w, possible: possible / w, none: none / w, cells };
}

/** @deprecated name kept for older imports */
export type ContinentSummary = AreaSummary;
