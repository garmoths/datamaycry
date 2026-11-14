/**
 * Renders map tiles off the main thread so the globe never stutters.
 *   in:  { kind: "field", varId, field }                     – trend map, once per variable
 *        { kind: "tile", id, varId, z, x, y }                – trend tile
 *        { kind: "frames", varId, grid, values, colorMax }   – yearly anomaly maps (1.4), once per variable
 *        { kind: "atile", id, varId, frame, z, x, y }        – one year's tile (PNG cached)
 *   out: { id, png: ArrayBuffer | null }
 * Written with AI assistance (Claude).
 */
import { buildAnomalyField, renderTile, type TrendField } from "./trendField.ts";

const fields = new Map<string, TrendField>();
const SIZE = 256;

interface Frames {
  grid: { nlat: number; nlon: number; lat0: number; lon0: number; dlat: number; dlon: number };
  values: Float32Array;
  colorMax: number;
}
const frames = new Map<string, Frames>();
const frameFields = new Map<string, TrendField>(); // `${varId}/${frame}`
const pngCache = new Map<string, ArrayBuffer>(); // `${varId}/${frame}/${z}/${x}/${y}`
const MAX_PNG = 1500;

type Msg =
  | { kind: "field"; varId: string; field: TrendField }
  | { kind: "tile"; id: number; varId: string; z: number; x: number; y: number }
  | ({ kind: "frames"; varId: string } & Frames)
  | { kind: "atile"; id: number; varId: string; frame: string; z: number; x: number; y: number };

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
    return;
  }
  if (m.kind === "frames") {
    const fr = { grid: m.grid, values: m.values, colorMax: m.colorMax };
    frames.set(m.varId, fr);
    frames.set(`${m.varId}#s`, smooth5(fr));
    return;
  }
  let png: ArrayBuffer;
  if (m.kind === "atile") {
    const key = `${m.varId}/${m.frame}/${m.z}/${m.x}/${m.y}`;
    const hit = pngCache.get(key);
    png = hit ?? (await toPng(frameField(m.varId, m.frame), m.z, m.x, m.y));
    if (!hit) {
      if (pngCache.size >= MAX_PNG) pngCache.delete(pngCache.keys().next().value!);
      pngCache.set(key, png);
    }
    png = png.slice(0); // keep the cached copy, transfer a clone
  } else {
    png = await toPng(fields.get(m.varId), m.z, m.x, m.y);
  }
  (self as unknown as Worker).postMessage({ id: m.id, png }, [png]);
};
