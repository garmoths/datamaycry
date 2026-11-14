/**
 * The world trend map drawn as map tiles, rendered on demand in the browser.
 *
 * Why tiles and not one picture: a single 360° image is drawn on the globe as two huge
 * triangles (a visible diagonal seam) and gets blurry/pixelated when zooming in. A raster
 * tile source is subdivided properly on the globe, and every tile here is computed for its
 * own zoom straight from the data, so the field stays sharp-but-smooth at every scale.
 *
 * - Colour-blind-safe diverging blue ↔ orange-red, 5 stops (no red/green, PLAN §10.4-5).
 * - Opacity = evidence level × size of the change: small or unproven changes fade into the
 *   satellite picture underneath. Missing data stays transparent, never 0.
 * - Cell values are interpolated with a cubic B-spline (C²-smooth, never overshoots the
 *   palette), premultiplied alpha, lossless PNG. Colour fades out towards the poles.
 *
 * Written with AI assistance (Claude).
 */
import { addProtocol } from "maplibre-gl";
import type { TrendMap, VarId } from "./data.ts";

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

/** Opacity of one cell: evidence level × how big the change is (0…1). */
export function cellAlpha(level: number, norm: number): number {
  const base = level === 2 ? 0.85 : level === 1 ? 0.6 : 0.22;
  return base * (0.3 + 0.7 * Math.min(1, Math.abs(norm)));
}

/** Uniform cubic B-spline weights for neighbours −1, 0, +1, +2 at fraction t. */
export function bspline(t: number): [number, number, number, number] {
  const t2 = t * t, t3 = t2 * t, u = 1 - t;
  return [(u * u * u) / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
}

/** Colour fades out between 72° and 84° latitude (the globe fans the last row over the poles). */
export function polarFade(lat: number): number {
  const x = Math.min(1, Math.max(0, (84 - Math.abs(lat)) / 12));
  return x * x * (3 - 2 * x);
}

/** Latitude of Web-Mercator y in 0…1 (0 = north edge). */
export function mercatorLat(yNorm: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * yNorm))) * 180) / Math.PI;
}

export interface TrendField {
  nlat: number;
  nlon: number;
  /** premultiplied RGBA (0…255 colour × alpha 0…1) per grid cell */
  rgba: Float32Array;
}

/** Colour + opacity for every grid cell; built once per variable (~10 ms). */
export function buildField(map: Pick<TrendMap, "grid" | "slopePerDecade" | "level">): TrendField {
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

  const rgba = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) {
    const lvl = map.level[k];
    const slope = map.slopePerDecade[k];
    if (lvl === 255 || !Number.isFinite(slope)) continue;
    const norm = slope / top;
    const [r, g, b] = trendColor(norm);
    const a = cellAlpha(lvl, norm);
    rgba.set([r * a, g * a, b * a, a], k * 4);
  }
  return { nlat, nlon, rgba };
}

/** RGBA pixels of map tile z/x/y (size × size), sampled from the field with a 2-D B-spline. */
export function renderTile(field: TrendField, z: number, x: number, y: number, size = 256): Uint8ClampedArray {
  const { nlat, nlon, rgba } = field;
  const px = new Uint8ClampedArray(size * size * 4);
  const n = 2 ** z;
  // column weights are the same for every row of the tile
  const jIdx = new Int32Array(size * 4);
  const jW = new Float32Array(size * 4);
  for (let c = 0; c < size; c++) {
    const lon = ((x + (c + 0.5) / size) / n) * 360 - 180;
    const f = (lon + 180) / 0.625; // cell j is centred on lon −180 + j·0.625
    const j0 = Math.floor(f);
    const w = bspline(f - j0);
    for (let m = 0; m < 4; m++) {
      jIdx[c * 4 + m] = (((j0 - 1 + m) % nlon) + nlon) % nlon;
      jW[c * 4 + m] = w[m];
    }
  }
  for (let r = 0; r < size; r++) {
    const lat = mercatorLat((y + (r + 0.5) / size) / n);
    const fade = polarFade(lat);
    if (fade <= 0) continue;
    const fi = (lat + 90) / 0.5;
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
      if (A < 0.004) continue; // no data here
      const o = (r * size + c) * 4;
      px[o] = R / A;
      px[o + 1] = G / A;
      px[o + 2] = B / A;
      px[o + 3] = A * fade * 255;
    }
  }
  return px;
}

// ── MapLibre tile protocol: trend://{VAR}/{z}/{x}/{y} ───────────────────────

const fields = new Map<VarId, TrendField>();
let registered = false;

/** Make a variable's field available to the map; returns the tile URL template. */
export function trendTileUrl(varId: VarId, map: TrendMap): string {
  if (!fields.has(varId)) fields.set(varId, buildField(map));
  if (!registered) {
    registered = true;
    addProtocol("trend", async (params) => {
      const [v, z, x, y] = params.url.replace("trend://", "").split("/");
      const field = fields.get(v as VarId);
      const size = 256;
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext("2d")!;
      if (field) {
        const px = renderTile(field, +z, +x, +y, size);
        ctx.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
      }
      const blob = await canvas.convertToBlob({ type: "image/png" });
      return { data: await blob.arrayBuffer() };
    });
  }
  return `trend://${varId}/{z}/{x}/{y}`;
}
