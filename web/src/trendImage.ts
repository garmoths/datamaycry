/**
 * Paints the world trend map into a PNG data URL for MapLibre's `image` source
 * (PLAN.md §10.4-4: never draw 200k cells as polygons).
 *
 * Colour-blind-safe diverging blue ↔ orange-red (no red/green, §10.4-5).
 * Opacity encodes evidence: strong = solid, possible = medium, none = faint.
 * Cells that pass the FDR test get a bright dot pattern.
 *
 * Written with AI assistance (Claude).
 */
import type { TrendMap } from "./data.ts";

/**
 * MapLibre stretches an `image` source linearly in Web-Mercator between its corners,
 * so the picture is resampled row by row into Mercator space (otherwise latitudes drift).
 * Columns stay one per grid column, shifted half a cell west because MERRA-2 cell j is
 * centred on lon −180 + j·0.625 (same edges as the Point-mode scale ladder in geo.ts).
 */
const MAX_LAT = 85.0511287798;
const HALF_CELL = 0.3125;
const IMAGE_HEIGHT = 1024;
export const IMAGE_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [
  [-180 - HALF_CELL, MAX_LAT],
  [180 - HALF_CELL, MAX_LAT],
  [180 - HALF_CELL, -MAX_LAT],
  [-180 - HALF_CELL, -MAX_LAT],
];

/** Grid row shown on Mercator image row y (0 = north). */
export function rowForMercatorY(y: number, height = IMAGE_HEIGHT): number {
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / height))) * 180) / Math.PI;
  return Math.round((lat + 90) / 0.5);
}

export const COLD = [43, 123, 186] as const; // falling
export const WARM = [228, 87, 46] as const; // rising
const MID = [236, 236, 236] as const;

function mix(a: readonly number[], b: readonly number[], t: number): number[] {
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t));
}

export function trendColor(norm: number): number[] {
  const x = Math.max(-1, Math.min(1, norm));
  return x >= 0 ? mix(MID, WARM, x) : mix(MID, COLD, -x);
}

export function renderTrendImage(map: TrendMap): string | null {
  const { nlat, nlon } = map.grid;
  const h = IMAGE_HEIGHT;
  const canvas = document.createElement("canvas");
  canvas.width = nlon;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(nlon, h);

  // Scale colours so the strongest 2 % of cells saturate.
  const mags: number[] = [];
  for (let k = 0; k < map.slopePerDecade.length; k += 7) {
    const v = Math.abs(map.slopePerDecade[k]);
    if (Number.isFinite(v)) mags.push(v);
  }
  mags.sort((a, b) => a - b);
  const top = mags[Math.floor(mags.length * 0.98)] || 1;

  for (let y = 0; y < h; y++) {
    const i = Math.min(nlat - 1, Math.max(0, rowForMercatorY(y, h)));
    for (let j = 0; j < nlon; j++) {
      const k = i * nlon + j;
      const lvl = map.level[k];
      const slope = map.slopePerDecade[k];
      const o = (y * nlon + j) * 4;
      if (lvl === 255 || !Number.isFinite(slope)) continue; // transparent = no data
      const [r, g, b] = trendColor(slope / top);
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      let a = lvl === 2 ? 235 : lvl === 1 ? 150 : 55;
      // Cells that survive the FDR test get a sparse light dot (only where the evidence is strong).
      if (lvl === 2 && map.fdr[k] === 1 && y % 6 === 0 && j % 4 === 0) {
        img.data[o] = img.data[o + 1] = img.data[o + 2] = 250;
        a = 240;
      }
      img.data[o + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}
