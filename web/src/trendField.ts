/**
 * The world trend map drawn as map tiles, rendered on demand in the browser.
 *
 * Why tiles and not one picture: a single 360° image is drawn on the globe as two huge
 * triangles (a visible diagonal seam) and gets blurry/pixelated when zooming in. A raster
 * tile source is subdivided properly on the globe, and every tile here is computed for its
 * own zoom straight from the data, so the field stays sharp-but-smooth at every scale.
 *
 * - Colour-blind-safe diverging blue ↔ orange-red, 5 stops (no red/green, PLAN §10.4-5).
 * - Opacity = evidence (continuous in the p-value) × size of the change: small or unproven changes fade into the
 *   satellite picture underneath. Missing data stays transparent, never 0.
 * - Cell values are interpolated with a cubic B-spline (C²-smooth, never overshoots the
 *   palette), premultiplied alpha, lossless PNG.
 * - Near the poles the colour runs smoothly into one cap colour per pole (the area-mean of
 *   the polar rows), so the globe's pole caps are coloured too instead of a bald disc.
 *
 * Written with AI assistance (Claude).
 */
import type { TrendMap } from "./data.ts";

// Diverging palette (ColorBrewer RdBu-like, readable for red-green colour blindness)
export const COLD = [33, 102, 172] as const; // falling
const COOL = [146, 197, 222] as const;
const MID = [240, 240, 236] as const;
const WARMISH = [244, 165, 130] as const;
export const WARM = [202, 72, 48] as const; // rising
/** CSS gradient of the same palette, for the legend. */
export const PALETTE_CSS = `linear-gradient(90deg, ${[COLD, COOL, MID, WARMISH, WARM].map((c) => `rgb(${c.join(",")})`).join(", ")})`;

function mix(a: readonly number[], b: readonly number[], t: number): number[] {
  return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t);
}

/** norm in −1…+1 → rgb */
export function trendColor(norm: number): number[] {
  const x = Math.max(-1, Math.min(1, norm));
  if (x >= 0.5) return mix(WARMISH, WARM, (x - 0.5) * 2);
  if (x >= 0) return mix(MID, WARMISH, x * 2);
  if (x >= -0.5) return mix(MID, COOL, -x * 2);
  return mix(COOL, COLD, (-x - 0.5) * 2);
}

/**
 * Evidence 0…1 from the p-value, continuous: p ≥ 0.2 → 0, p ≤ 0.001 → 1 (smoothstep on
 * −log10 p). Using the discrete level (none/possible/strong) here would draw hard edges
 * wherever a cell crosses p = 0.05 — that was the remaining "blocky" look.
 */
export function evidence(p: number): number {
  if (!Number.isFinite(p)) return 0;
  const x = Math.min(1, Math.max(0, (-Math.log10(Math.max(p, 1e-12)) - 0.7) / 2.3));
  return x * x * (3 - 2 * x);
}

/**
 * Opacity of one cell: evidence × how big the change is (0…1). Changes near zero fade to
 * fully transparent (smoothstep), otherwise the light middle of the palette lays a grey
 * haze over the satellite picture.
 */
export function cellAlpha(evid: number, norm: number): number {
  const x = Math.min(1, Math.max(0, (Math.abs(norm) - 0.04) / 0.51));
  return (0.12 + 0.73 * evid) * x * x * (3 - 2 * x);
}

/** Uniform cubic B-spline weights for neighbours −1, 0, +1, +2 at fraction t. */
export function bspline(t: number): [number, number, number, number] {
  const t2 = t * t, t3 = t2 * t, u = 1 - t;
  return [(u * u * u) / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
}

/**
 * How far a latitude is blended into its pole's cap colour: 0 below 76°, 1 from 84.5°.
 * The globe has no tiles beyond ±85° and fills the pole caps by stretching the last pixel
 * row of the edge tiles. That row is one uniform colour here, so the caps are coloured
 * smoothly (no fan of streaks, and no colourless "bald" disc at the poles).
 */
export function polarBlend(lat: number): number {
  const x = Math.min(1, Math.max(0, (Math.abs(lat) - 76) / 8.5));
  return x * x * (3 - 2 * x);
}

/** Polar rows that make up a cap colour (|lat| ≥ this). */
const CAP_FROM = 78;

/** Latitude of Web-Mercator y in 0…1 (0 = north edge). */
export function mercatorLat(yNorm: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * yNorm))) * 180) / Math.PI;
}

export interface TrendField {
  nlat: number;
  nlon: number;
  /** cell centres: lat = lat0 + i·dlat, lon = lon0 + j·dlon (default: the MERRA-2 grid) */
  lat0?: number;
  lon0?: number;
  dlat?: number;
  dlon?: number;
  /** premultiplied RGBA (0…255 colour × alpha 0…1) per grid cell */
  rgba: Float32Array;
  /** premultiplied RGBA of the north / south pole caps (area-mean of the polar rows) */
  capN: [number, number, number, number];
  capS: [number, number, number, number];
}

/** Colour + opacity for every grid cell; built once per variable (~10 ms). */
export function buildField(
  map: Pick<TrendMap, "grid" | "slopePerDecade" | "level" | "pValue">,
  /** cell geometry when it is not the MERRA-2 grid (period maps use the 1° × 1.25° grid) */
  geo?: { lat0: number; lon0: number; dlat: number; dlon: number },
): TrendField {
  const { nlat, nlon } = map.grid;
  const n = nlat * nlon;
  // scale colours so the strongest 2 % of cells saturate
  const mags: number[] = [];
  for (let k = 0; k < n; k += 7) {
    const v = Math.abs(map.slopePerDecade[k]);
    if (Number.isFinite(v)) mags.push(v);
  }
  mags.sort((a, b) => a - b);
  const top = mags[Math.floor(mags.length * 0.98)] || 1;

  let rgba: Float32Array = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) {
    const slope = map.slopePerDecade[k];
    if (map.level[k] === 255 || !Number.isFinite(slope)) continue;
    const norm = slope / top;
    const [r, g, b] = trendColor(norm);
    const a = cellAlpha(evidence(map.pValue[k]), norm);
    rgba.set([r * a, g * a, b * a, a], k * 4);
  }
  // one 1-2-1 pass in each direction before the B-spline: soft, natural transitions
  // (the map is a regional overview; exact cell values are in the panel)
  rgba = smooth121(rgba, nlat, nlon);
  if (geo)
    return { nlat, nlon, rgba, ...geo, capN: capColor(rgba, nlat, nlon, 1, geo.lat0, geo.dlat), capS: capColor(rgba, nlat, nlon, -1, geo.lat0, geo.dlat) };
  return { nlat, nlon, rgba, capN: capColor(rgba, nlat, nlon, 1), capS: capColor(rgba, nlat, nlon, -1) };
}

/** Area-weighted (cos latitude) mean premultiplied colour of the rows poleward of CAP_FROM. */
function capColor(
  rgba: Float32Array, nlat: number, nlon: number, side: 1 | -1, lat0 = -90, dlat = 0.5,
): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  let w = 0;
  for (let i = 0; i < nlat; i++) {
    const lat = lat0 + i * dlat;
    if (lat * side < CAP_FROM) continue;
    const a = Math.max(Math.cos((lat * Math.PI) / 180), 0.004); // the pole row still counts a little
    for (let j = 0; j < nlon; j++) {
      const k = (i * nlon + j) * 4;
      for (let q = 0; q < 4; q++) out[q] += a * rgba[k + q];
      w += a;
    }
  }
  if (w > 0) for (let q = 0; q < 4; q++) out[q] /= w;
  return out;
}

function smooth121(src: Float32Array, nlat: number, nlon: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let i = 0; i < nlat; i++)
    for (let j = 0; j < nlon; j++) {
      const l = (i * nlon + ((j + nlon - 1) % nlon)) * 4, c = (i * nlon + j) * 4, r = (i * nlon + ((j + 1) % nlon)) * 4;
      for (let q = 0; q < 4; q++) tmp[c + q] = 0.25 * src[l + q] + 0.5 * src[c + q] + 0.25 * src[r + q];
    }
  for (let i = 0; i < nlat; i++)
    for (let j = 0; j < nlon; j++) {
      const d = (Math.max(0, i - 1) * nlon + j) * 4, c = (i * nlon + j) * 4, u = (Math.min(nlat - 1, i + 1) * nlon + j) * 4;
      for (let q = 0; q < 4; q++) out[c + q] = 0.25 * tmp[d + q] + 0.5 * tmp[c + q] + 0.25 * tmp[u + q];
    }
  return out;
}

/** RGBA pixels of map tile z/x/y (size × size), sampled from the field with a 2-D B-spline. */
export function renderTile(field: TrendField, z: number, x: number, y: number, size = 256): Uint8ClampedArray {
  const { nlat, nlon, rgba, capN, capS } = field;
  const lat0 = field.lat0 ?? -90, lon0 = field.lon0 ?? -180, dlat = field.dlat ?? 0.5, dlon = field.dlon ?? 0.625;
  const px = new Uint8ClampedArray(size * size * 4);
  const n = 2 ** z;
  // column weights are the same for every row of the tile
  const jIdx = new Int32Array(size * 4);
  const jW = new Float32Array(size * 4);
  for (let c = 0; c < size; c++) {
    const lon = ((x + (c + 0.5) / size) / n) * 360 - 180;
    const f = (lon - lon0) / dlon; // cell j is centred on lon0 + j·dlon
    const j0 = Math.floor(f);
    const w = bspline(f - j0);
    for (let m = 0; m < 4; m++) {
      jIdx[c * 4 + m] = (((j0 - 1 + m) % nlon) + nlon) % nlon;
      jW[c * 4 + m] = w[m];
    }
  }
  for (let r = 0; r < size; r++) {
    const lat = mercatorLat((y + (r + 0.5) / size) / n);
    const blend = polarBlend(lat);
    const cap = lat > 0 ? capN : capS;
    const fi = (lat - lat0) / dlat;
    const i0 = Math.floor(fi);
    const wi = bspline(fi - i0);
    const rows = [0, 1, 2, 3].map((m) => Math.min(nlat - 1, Math.max(0, i0 - 1 + m)) * nlon);
    for (let c = 0; c < size; c++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let a = 0; a < 4; a++) {
        const wa = wi[a];
        if (wa === 0) continue;
        const base = rows[a];
        for (let b = 0; b < 4; b++) {
          const w = wa * jW[c * 4 + b];
          const k = (base + jIdx[c * 4 + b]) * 4;
          R += w * rgba[k];
          G += w * rgba[k + 1];
          B += w * rgba[k + 2];
          A += w * rgba[k + 3];
        }
      }
      if (blend > 0) {
        R += (cap[0] - R) * blend;
        G += (cap[1] - G) * blend;
        B += (cap[2] - B) * blend;
        A += (cap[3] - A) * blend;
      }
      if (A < 0.004) continue; // no data here
      const o = (r * size + c) * 4;
      px[o] = R / A;
      px[o + 1] = G / A;
      px[o + 2] = B / A;
      px[o + 3] = A * 255;
    }
  }
  return px;
}

/**
 * Colour + opacity for one year of the animation (contract 1.4): colour = difference from
 * the 1991–2020 normal on a FIXED scale (colorMax) so years compare; opacity grows with the
 * size of the difference, so near-normal places let the satellite picture show through.
 * No p-value here: a single year is not a trend test.
 */
export function buildAnomalyField(
  values: ArrayLike<number>,
  offset: number,
  grid: { nlat: number; nlon: number; lat0: number; lon0: number; dlat: number; dlon: number },
  colorMax: number,
): TrendField {
  const { nlat, nlon } = grid;
  const n = nlat * nlon;
  const rgba = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) {
    const v = values[offset + k];
    if (!Number.isFinite(v)) continue;
    const norm = v / colorMax;
    const [r, g, b] = trendColor(norm);
    // fully transparent at the normal, clearly visible from ~1/3 of the scale on
    const x = Math.min(1, Math.max(0, (Math.abs(norm) - 0.03) / 0.37));
    const a = 0.9 * x * x * (3 - 2 * x);
    rgba[k * 4] = r * a;
    rgba[k * 4 + 1] = g * a;
    rgba[k * 4 + 2] = b * a;
    rgba[k * 4 + 3] = a;
  }
  // the same polar caps as the trend map, so the animation also reaches the poles
  return {
    ...grid,
    rgba,
    capN: capColor(rgba, nlat, nlon, 1, grid.lat0, grid.dlat),
    capS: capColor(rgba, nlat, nlon, -1, grid.lat0, grid.dlat),
  };
}
