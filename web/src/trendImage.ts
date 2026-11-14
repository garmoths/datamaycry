/**
 * The world trend map as a MapLibre raster tile source: trend://{VAR}/{z}/{x}/{y}.
 * The maths (palette, opacity, B-spline tiles) lives in trendField.ts so the tile
 * worker can use it without loading MapLibre.
 * Written with AI assistance (Claude).
 */
import { addProtocol } from "maplibre-gl";
import type { AnomalyFrames, TrendMap, VarId } from "./data.ts";
import { buildAnomalyField, buildField, renderTile, type TrendField } from "./trendField.ts";

export * from "./trendField.ts";

// ── MapLibre tile protocol: trend://{VAR}/{z}/{x}/{y} ───────────────────────
// Tiles are painted in a Web Worker (trendTileWorker.ts); the main thread only routes
// requests. If workers are unavailable, tiles are painted here instead.

const fields = new Map<VarId, TrendField>(); // main-thread fallback only
const sources = new Map<VarId, TrendMap>();
let pool: Worker[] | null | undefined;
let nextId = 1;
const waiting = new Map<number, (png: ArrayBuffer | null) => void>();
const rangeWaiting = new Map<number, (r: { ok: boolean; field?: TrendField }) => void>();
/** Tile painters running side by side: a zoom step asks for 30–80 tiles at once, and one
 *  worker painting them in a row made new zoom levels arrive late. Leave a core free. */
export const POOL_SIZE = Math.max(1, Math.min(3, ((typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 2) - 1));

function onWorkerMessage(e: MessageEvent<{ id: number; png: ArrayBuffer | null; ok?: boolean; field?: TrendField }>) {
  const r = rangeWaiting.get(e.data.id);
  if (r) {
    r({ ok: !!e.data.ok, field: e.data.field });
    rangeWaiting.delete(e.data.id);
    return;
  }
  waiting.get(e.data.id)?.(e.data.png);
  waiting.delete(e.data.id);
}

function workers(): Worker[] | null {
  if (pool !== undefined) return pool;
  try {
    pool = Array.from({ length: POOL_SIZE }, () => {
      const w = new Worker(new URL("./trendTileWorker.ts", import.meta.url), { type: "module" });
      w.onmessage = onWorkerMessage;
      w.onerror = () => {
        pool = null; // fall back to the main thread from now on
        for (const done of waiting.values()) done(null);
        waiting.clear();
        for (const done of rangeWaiting.values()) done({ ok: false });
        rangeWaiting.clear();
      };
      return w;
    });
  } catch {
    pool = null;
  }
  return pool;
}

/** The first worker: it holds the yearly maps (animation, period trends). */
function tileWorker(): Worker | null {
  return workers()?.[0] ?? null;
}

/** The same tile always goes to the same worker, so that worker's PNG cache hits on the way back. */
export function workerIndex(z: number, x: number, y: number, n: number): number {
  return (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) % n;
}

async function paintHere(varId: VarId, z: number, x: number, y: number): Promise<ArrayBuffer> {
  const size = 256;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  let field = fields.get(varId);
  const src = sources.get(varId);
  if (!field && src) fields.set(varId, (field = buildField(src)));
  if (field) ctx.putImageData(new ImageData(renderTile(field, z, x, y, size) as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
  return (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer();
}

let registered = false;

/** Make a variable's field available to the map; returns the tile URL template.
 *  The colour field is built in the tile worker (~60 ms of work kept off the main thread);
 *  without a worker it is built here on first use. */
export function trendTileUrl(varId: VarId, map: TrendMap): string {
  if (!sources.has(varId)) {
    sources.set(varId, map);
    // every worker gets its own copy (transferred, not cloned again)
    for (const w of workers() ?? []) {
      const slope = map.slopePerDecade.slice(), pValue = map.pValue.slice(), level = map.level.slice();
      w.postMessage({ kind: "trendmap", varId, grid: map.grid, slope, pValue, level }, [slope.buffer, pValue.buffer, level.buffer]);
    }
  }
  if (!registered) {
    registered = true;
    addProtocol("trend", async (params) => {
      const [v, z, x, y] = params.url.replace("trend://", "").split("/");
      const p = workers();
      const w = p ? p[workerIndex(+z, +x, +y, p.length)] : null;
      let png: ArrayBuffer | null = null;
      if (w) {
        const id = nextId++;
        png = await new Promise<ArrayBuffer | null>((done) => {
          waiting.set(id, done);
          w.postMessage({ kind: "tile", id, varId: v, z: +z, x: +x, y: +y });
        });
      }
      return { data: png ?? (await paintHere(v as VarId, +z, +x, +y)) };
    });
  }
  return `trend://${varId}/{z}/{x}/{y}`;
}

// ── 1.4: yearly anomaly tiles for the animation: anom://{VAR}/{FRAME}/{z}/{x}/{y} ──
// FRAME = year index ("12") or "12s" for the 5-year running mean. PNGs are cached in the worker.

const frameData = new Map<VarId, AnomalyFrames>(); // main-thread fallback, last two variables
const sentFrames: string[] = []; // variables whose frames the worker holds, oldest first
let anomRegistered = false;

function requestTile(msg: Record<string, unknown>): Promise<ArrayBuffer | null> {
  const w = tileWorker();
  if (!w) return Promise.resolve(null);
  const id = nextId++;
  return new Promise((done) => {
    waiting.set(id, done);
    w.postMessage({ ...msg, id });
  });
}

async function paintFrameHere(varId: VarId, frame: string, z: number, x: number, y: number): Promise<ArrayBuffer> {
  const f = frameData.get(varId);
  const size = 256;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  if (f) {
    const k = parseInt(frame, 10);
    const field = buildAnomalyField(f.values, k * f.grid.nlat * f.grid.nlon, f.grid, f.colorMax);
    ctx.putImageData(new ImageData(renderTile(field, z, x, y, size) as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
  }
  return (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer();
}

/** Hand a variable's yearly maps to the tile worker; returns a URL builder for one frame. */
export function anomalyTileUrl(f: AnomalyFrames): (frame: number, smooth: boolean) => string {
  frameData.set(f.var, f);
  // the worker keeps the last two variables (same rule as here): send again if it may have dropped this one
  if (sentFrames.at(-1) !== f.var) {
    const at = sentFrames.indexOf(f.var);
    if (at >= 0) sentFrames.splice(at, 1);
    if (at < 0 || sentFrames.length >= 1) {
      tileWorker()?.postMessage({ kind: "frames", varId: f.var, grid: f.grid, values: f.values, colorMax: f.colorMax });
    }
    sentFrames.push(f.var);
    while (sentFrames.length > 2) frameData.delete(sentFrames.shift()! as VarId);
  }
  if (!anomRegistered) {
    anomRegistered = true;
    addProtocol("anom", async (params) => {
      const [v, frame, z, x, y] = params.url.replace("anom://", "").split("/");
      const png = await requestTile({ kind: "atile", varId: v, frame, z: +z, x: +x, y: +y });
      return { data: png ?? (await paintFrameHere(v as VarId, frame, +z, +x, +y)) };
    });
  }
  return (frame, smooth) => `anom://${f.var}/${frame}${smooth ? "s" : ""}/{z}/{x}/{y}`;
}

/** Trend map of a chosen period, computed in the worker from the yearly maps (1° × 1.25°).
 *  Resolves to a trend:// URL, or null when it could not be computed. */
export async function rangeTrendUrl(f: AnomalyFrames, from: number, to: number): Promise<string | null> {
  anomalyTileUrl(f); // the worker needs this variable's yearly maps
  const w = tileWorker();
  if (!w) return null;
  const key = `${f.var}@${from}-${to}`;
  const id = nextId++;
  // computed once in the first worker, then handed to the others
  const r = await new Promise<{ ok: boolean; field?: TrendField }>((done) => {
    rangeWaiting.set(id, done);
    w.postMessage({ kind: "rangetrend", id, varId: f.var, key, i0: from - f.years[0], i1: to - f.years[0], share: (workers()?.length ?? 1) > 1 });
  });
  if (r.ok && r.field) for (const other of workers()?.slice(1) ?? []) other.postMessage({ kind: "field", varId: key, field: r.field });
  return r.ok ? `trend://${key}/{z}/{x}/{y}` : null;
}

/** Paint (and cache) the given tiles for every frame ahead of playback. Reports progress 0…1. */
export async function preloadFrames(
  varId: VarId,
  frameIdx: number[],
  smooth: boolean,
  tiles: { z: number; x: number; y: number }[],
  onProgress: (p: number) => void,
): Promise<void> {
  const jobs = frameIdx.flatMap((k) => tiles.map((t) => ({ k, ...t })));
  let done = 0;
  const run = async (j: { k: number; z: number; x: number; y: number }) => {
    await requestTile({ kind: "atile", varId, frame: `${j.k}${smooth ? "s" : ""}`, z: j.z, x: j.x, y: j.y });
    onProgress(++done / jobs.length);
  };
  // a few in flight at a time keeps the worker busy without flooding it
  for (let i = 0; i < jobs.length; i += 6) await Promise.all(jobs.slice(i, i + 6).map(run));
}
