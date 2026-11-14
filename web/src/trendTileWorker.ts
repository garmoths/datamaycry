/**
 * Renders map tiles off the main thread so the globe never stutters.
 *   in:  { kind: "trendmap", varId, grid, slope, pValue, level } – trend map, once per variable (field built here)
 *        { kind: "tile", id, varId, z, x, y }                – trend tile
 *        { kind: "frames", varId, grid, values, colorMax }   – yearly anomaly maps (1.4), once per variable
 *        { kind: "atile", id, varId, frame, z, x, y }        – one year's tile (PNG cached)
 *        { kind: "rangetrend", id, varId, key, i0, i1 }      – trend map of a chosen period, from the
 *                                                              yearly maps; tiles then use `key` as varId
 *   out: { id, png: ArrayBuffer | null }
 * Written with AI assistance (Claude).
 */
import { buildAnomalyField, buildField, renderTile, type TrendField } from "./trendField.ts";
import { rangeTrend } from "./rangeTrend.ts";

const fields = new Map<string, TrendField>();
const SIZE = 256;

interface Frames {
  grid: { nlat: number; nlon: number; lat0: number; lon0: number; dlat: number; dlon: number };
  values: Float32Array;
  colorMax: number;
}
const frames = new Map<string, Frames>();
const frameFields = new Map<string, TrendField>(); // `${varId}/${frame}`
// PNG tiles, least recently used first. ~1 000 tiles ≈ 20–40 MB: enough for a whole
// animation at globe zoom plus panning, small enough for phones.
const pngCache = new Map<string, ArrayBuffer>(); // `${kind}/${varId}/${frame}/${z}/${x}/${y}`
const MAX_PNG = 1000;
// keep the yearly maps of the last two variables only (each ~20 MB with its 5-year version)
const MAX_FRAME_VARS = 2;
const frameOrder: string[] = [];

function cacheGet(key: string): ArrayBuffer | undefined {
  const hit = pngCache.get(key);
  if (hit) {
    pngCache.delete(key); // refresh its place in the LRU order
    pngCache.set(key, hit);
  }
  return hit;
}
function cachePut(key: string, png: ArrayBuffer) {
  if (pngCache.size >= MAX_PNG) pngCache.delete(pngCache.keys().next().value!);
  pngCache.set(key, png);
}
function dropVar(varId: string) {
  frames.delete(varId);
  frames.delete(`${varId}#s`);
  for (const k of [...frameFields.keys()]) if (k.startsWith(`${varId}/`)) frameFields.delete(k);
  for (const k of [...pngCache.keys()]) if (k.startsWith(`a/${varId}/`)) pngCache.delete(k);
}

type Msg =
  | { kind: "field"; varId: string; field: TrendField }
  | {
      kind: "trendmap";
      varId: string;
      grid: { nlat: number; nlon: number; lat0: number; lon0: number; dlat: number; dlon: number };
      slope: Float32Array;
      pValue: Float32Array;
      level: Uint8Array;
    }
  | { kind: "tile"; id: number; varId: string; z: number; x: number; y: number }
  | ({ kind: "frames"; varId: string } & Frames)
  | { kind: "atile"; id: number; varId: string; frame: string; z: number; x: number; y: number }
  | { kind: "rangetrend"; id: number; varId: string; key: string; i0: number; i1: number; share?: boolean };

// period maps: keep the last few, they are cheap to recompute
const rangeKeys: string[] = [];
const MAX_RANGES = 6;
function keepRange(key: string) {
  rangeKeys.push(key);
  while (rangeKeys.length > MAX_RANGES) {
    const old = rangeKeys.shift()!;
    fields.delete(old);
    for (const k of [...pngCache.keys()]) if (k.startsWith(`t/${old}/`)) pngCache.delete(k);
  }
}

async function toPng(field: TrendField | undefined, z: number, x: number, y: number): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  if (field && ctx) {
    const px = renderTile(field, z, x, y, SIZE);
    ctx.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, SIZE, SIZE), 0, 0);
  }
  return (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer();
}

/** frame = "<index>" or "<index>s" (5-year running mean, computed here once per variable). */
function frameField(varId: string, frame: string): TrendField | undefined {
  const key = `${varId}/${frame}`;
  let f = frameFields.get(key);
  if (f) return f;
  const fr = frames.get(frame.endsWith("s") ? `${varId}#s` : varId);
  if (!fr) return undefined;
  const k = parseInt(frame, 10);
  f = buildAnomalyField(fr.values, k * fr.grid.nlat * fr.grid.nlon, fr.grid, fr.colorMax);
  frameFields.set(key, f);
  return f;
}

function smooth5(fr: Frames): Frames {
  const n = fr.grid.nlat * fr.grid.nlon;
  const ny = fr.values.length / n;
  const out = new Float32Array(fr.values.length);
  for (let c = 0; c < n; c++)
    for (let k = 0; k < ny; k++) {
      let s = 0, m = 0;
      for (let q = Math.max(0, k - 2); q <= Math.min(ny - 1, k + 2); q++) {
        const v = fr.values[q * n + c];
        if (Number.isFinite(v)) {
          s += v;
          m++;
        }
      }
      out[k * n + c] = m ? s / m : NaN;
    }
  return { ...fr, values: out };
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.kind === "field") {
    fields.set(m.varId, m.field);
    if (m.varId.includes("@")) keepRange(m.varId); // a period map computed by the first worker
    return;
  }
  if (m.kind === "trendmap") {
    fields.set(m.varId, buildField({ grid: m.grid as never, slopePerDecade: m.slope, pValue: m.pValue, level: m.level }));
    return;
  }
  if (m.kind === "frames") {
    const fr = { grid: m.grid, values: m.values, colorMax: m.colorMax };
    frames.set(m.varId, fr);
    frames.set(`${m.varId}#s`, smooth5(fr));
    const at = frameOrder.indexOf(m.varId);
    if (at >= 0) frameOrder.splice(at, 1);
    frameOrder.push(m.varId);
    while (frameOrder.length > MAX_FRAME_VARS) dropVar(frameOrder.shift()!);
    return;
  }
  if (m.kind === "rangetrend") {
    const fr = frames.get(m.varId);
    if (fr && !fields.has(m.key)) {
      const { nlat, nlon, lat0, lon0, dlat, dlon } = fr.grid;
      const r = rangeTrend(fr.values, nlat * nlon, m.i0, m.i1);
      fields.set(m.key, buildField({ grid: { nlat, nlon } as never, ...r }, { lat0, lon0, dlat, dlon }));
      keepRange(m.key);
    }
    // with several tile workers, the others get the finished field (cloned, ~0.8 MB)
    (self as unknown as Worker).postMessage({ id: m.id, png: null, ok: fields.has(m.key), field: m.share ? fields.get(m.key) : undefined });
    return;
  }
  // trend tiles are cached too: panning back or switching back to a variable is instant
  const key = m.kind === "atile" ? `a/${m.varId}/${m.frame}/${m.z}/${m.x}/${m.y}` : `t/${m.varId}/${m.z}/${m.x}/${m.y}`;
  let png = cacheGet(key);
  if (!png) {
    const field = m.kind === "atile" ? frameField(m.varId, m.frame) : fields.get(m.varId);
    png = await toPng(field, m.z, m.x, m.y);
    if (field) cachePut(key, png); // never cache an empty tile painted before the data arrived
  }
  png = png.slice(0); // keep the cached copy, transfer a clone
  (self as unknown as Worker).postMessage({ id: m.id, png }, [png]);
};
