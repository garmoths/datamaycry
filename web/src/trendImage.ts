/**
 * Paints the world trend map as a smooth, continuous field for MapLibre's `image`
 * source (PLAN.md §10.4-4: never draw 200k cells as polygons).
 *
 * - Colour-blind-safe diverging blue ↔ orange-red, 5 stops (no red/green, §10.4-5).
 * - Each grid cell gets a colour and an opacity; opacity = evidence level × size of the
 *   change, so small or unproven changes fade into the satellite picture underneath.
 * - The cell values are resampled with a cubic B-spline (premultiplied alpha) at 2048×2048
 *   directly in Web-Mercator and stored losslessly (PNG), so the result reads as a flowing
 *   field rather than 0.5° blocks. Colour fades out towards the poles. Missing data stays
 *   transparent.
 *
 * Written with AI assistance (Claude).
 */
import type { TrendMap } from "./data.ts";

const MAX_LAT = 85.0511287798;
const SIZE = 2048;
export const IMAGE_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [
  [-180, MAX_LAT],
  [180, MAX_LAT],
  [180, -MAX_LAT],
  [-180, -MAX_LAT],
];

/** Latitude at the centre of Web-Mercator image row y (0 = north). */
export function latForMercatorY(y: number, height = SIZE): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / height))) * 180) / Math.PI;
}

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

/** What the painter needs from a TrendMap (plain arrays, so it can cross into a worker). */
export type TrendInput = Pick<TrendMap, "grid" | "slopePerDecade" | "level">;

/**
 * Turns the trend map into a smooth picture: Mercator-projected RGBA pixels (SIZE × SIZE).
 * Pure function, no DOM — runs in a Web Worker (trendWorker.ts) or on the main thread.
 */
export function paintTrendPixels(map: TrendInput): Uint8ClampedArray {
  const { nlat, nlon } = map.grid;
  const n = nlat * nlon;

  // Scale colours so the strongest 2 % of cells saturate.
  const mags: number[] = [];
  for (let k = 0; k < n; k += 7) {
    const v = Math.abs(map.slopePerDecade[k]);
    if (Number.isFinite(v)) mags.push(v);
  }
  mags.sort((a, b) => a - b);
  const top = mags[Math.floor(mags.length * 0.98)] || 1;

  // 1) premultiplied RGBA per cell
  const field = new Float32Array(n * 4);
  for (let k = 0; k < n; k++) {
    const lvl = map.level[k];
    const slope = map.slopePerDecade[k];
    if (lvl === 255 || !Number.isFinite(slope)) continue; // no data → transparent, never 0
    const norm = slope / top;
    const [r, g, b] = trendColor(norm);
    const a = cellAlpha(lvl, norm);
    field.set([r * a, g * a, b * a, a], k * 4);
  }

  // 2) cubic B-spline resampling straight into Web-Mercator pixels. B-splines are C²-smooth
  //    (no kinks, no diamond artefacts like bilinear) and never overshoot, so colours stay in
  //    the palette. Separable: first along longitude for every grid row, then along latitude.
  const H = new Float32Array(nlat * SIZE * 4);
  for (let x = 0; x < SIZE; x++) {
    const lon = -180 + ((x + 0.5) / SIZE) * 360;
    const f = (lon + 180) / 0.625; // cell j is centred on lon −180 + j·0.625
    const j0 = Math.floor(f);
    const w = bspline(f - j0);
    for (let m = 0; m < 4; m++) {
      const j = (((j0 - 1 + m) % nlon) + nlon) % nlon; // longitude wraps around
      const wm = w[m];
      for (let i = 0; i < nlat; i++) {
        const src = (i * nlon + j) * 4;
        const dst = (i * SIZE + x) * 4;
        H[dst] += wm * field[src];
        H[dst + 1] += wm * field[src + 1];
        H[dst + 2] += wm * field[src + 2];
        H[dst + 3] += wm * field[src + 3];
      }
    }
  }

  const px = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    const lat = latForMercatorY(y);
    const fade = polarFade(lat);
    if (fade <= 0) continue;
    const fi = (lat + 90) / 0.5;
    const i0 = Math.floor(fi);
    const w = bspline(fi - i0);
    const rows = [0, 1, 2, 3].map((m) => Math.min(nlat - 1, Math.max(0, i0 - 1 + m)) * SIZE * 4);
    for (let x = 0; x < SIZE; x++) {
      const c = x * 4;
      const a = w[0] * H[rows[0] + c + 3] + w[1] * H[rows[1] + c + 3] + w[2] * H[rows[2] + c + 3] + w[3] * H[rows[3] + c + 3];
      if (a < 0.004) continue; // fully transparent: no data here
      const o = (y * SIZE + x) * 4;
      for (let q = 0; q < 3; q++)
        px[o + q] = (w[0] * H[rows[0] + c + q] + w[1] * H[rows[1] + c + q] + w[2] * H[rows[2] + c + q] + w[3] * H[rows[3] + c + q]) / a;
      px[o + 3] = a * fade * 255;
    }
  }
  return px;
}

/** Uniform cubic B-spline weights for neighbours −1, 0, +1, +2 at fraction t. */
export function bspline(t: number): [number, number, number, number] {
  const t2 = t * t, t3 = t2 * t, u = 1 - t;
  return [(u * u * u) / 6, (3 * t3 - 6 * t2 + 4) / 6, (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, t3 / 6];
}

/**
 * Colour fades out between 72° and 84° latitude. The globe stretches the image's last row
 * into a fan over the poles; fading avoids that artefact (and Web-Mercator ends at 85°).
 */
export function polarFade(lat: number): number {
  const x = Math.min(1, Math.max(0, (84 - Math.abs(lat)) / 12));
  return x * x * (3 - 2 * x);
}

export const TREND_IMAGE_SIZE = SIZE;

/**
 * Encode pixels as PNG on whatever canvas is available. Lossless on purpose: lossy WebP
 * compresses in 4×4/16×16 blocks, which showed up as pixelation on the smooth field.
 */
export async function encodePixels(px: Uint8ClampedArray): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(SIZE, SIZE);
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, SIZE, SIZE), 0, 0);
    return c.convertToBlob({ type: "image/png" });
  }
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, SIZE, SIZE), 0, 0);
  return new Promise((res) => c.toBlob(res, "image/png"));
}

/**
 * The smooth trend picture as an object URL. Painting + encoding (~0.7 s) runs in a Web
 * Worker so the globe never stutters; falls back to the main thread if workers fail.
 */
export async function renderTrendImage(map: TrendMap): Promise<string | null> {
  const input: TrendInput = { grid: map.grid, slopePerDecade: map.slopePerDecade, level: map.level };
  try {
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const w = new Worker(new URL("./trendWorker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<Blob | null>) => {
        resolve(e.data);
        w.terminate();
      };
      w.onerror = (e) => {
        reject(e);
        w.terminate();
      };
      w.postMessage(input);
    });
    if (blob) return URL.createObjectURL(blob);
  } catch {
    /* fall through to the main thread */
  }
  const blob = await encodePixels(paintTrendPixels(input));
  return blob ? URL.createObjectURL(blob) : null;
}
