/**
 * Continent-level numbers for the "Continent → Country → City" view.
 *
 * There is no continent time series in the data contract (yet), so the continent
 * card summarises the per-cell world trend map instead: which land cells belong to
 * the continent (country polygons rasterised onto the MERRA-2 grid), then an
 * area-weighted (cos latitude) mean slope and the share of area per evidence level.
 *
 * Written with AI assistance (Claude).
 */
import type { TrendMap } from "./data.ts";
import { CONTINENTS, type Boundaries } from "./geo.ts";

const NLAT = 361;
const NLON = 576;

/** Continent index (1-based, CONTINENTS order) for every grid cell; 0 = none/ocean. */
export function rasterizeContinents(b: Boundaries): Uint8Array {
  const out = new Uint8Array(NLAT * NLON);
  const canvas = document.createElement("canvas");
  canvas.width = NLON;
  canvas.height = NLAT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return out;
  // cell (i, j) is centred on pixel (j + 0.5, 360 − i + 0.5)
  const x = (lon: number) => (lon + 180) / 0.625 + 0.5;
  const y = (lat: number) => (90 - lat) / 0.5 + 0.5;
  CONTINENTS.forEach((c, idx) => {
    ctx.fillStyle = `rgb(${idx + 1},0,0)`;
    ctx.beginPath();
    for (const f of b.countries.features) {
      if (f.properties.continent !== c.id) continue;
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys)
        for (const ring of poly) {
          ring.forEach(([lon, lat], k) => (k ? ctx.lineTo(x(lon), y(lat)) : ctx.moveTo(x(lon), y(lat))));
          ctx.closePath();
        }
    }
    ctx.fill("evenodd");
  });
  const px = ctx.getImageData(0, 0, NLON, NLAT).data;
  for (let row = 0; row < NLAT; row++) {
    const i = NLAT - 1 - row;
    for (let j = 0; j < NLON; j++) {
      const o = (row * NLON + j) * 4;
      // only fully covered pixels: anti-aliased edges could mix two continents
      if (px[o + 3] === 255) out[i * NLON + j] = px[o];
    }
  }
  return out;
}

export interface ContinentSummary {
  /** area-weighted mean Sen slope, display units per decade */
  meanSlope: number;
  strongUp: number;
  strongDown: number;
  possible: number;
  none: number;
  cells: number;
}

/** Shares are fractions of the continent's land area that has data. */
export function summarize(map: TrendMap, grid: Uint8Array, continentIndex: number): ContinentSummary | null {
  const target = continentIndex + 1;
  let w = 0, ws = 0, up = 0, down = 0, possible = 0, none = 0, cells = 0;
  for (let k = 0; k < grid.length; k++) {
    if (grid[k] !== target) continue;
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
