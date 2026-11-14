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

const fields = new Map<VarId, TrendField>();
let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, (png: ArrayBuffer | null) => void>();

function tileWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./trendTileWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; png: ArrayBuffer | null }>) => {
      waiting.get(e.data.id)?.(e.data.png);
      waiting.delete(e.data.id);
    };
    worker.onerror = () => {
      worker = null; // fall back to the main thread from now on
      for (const done of waiting.values()) done(null);
      waiting.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

async function paintHere(varId: VarId, z: number, x: number, y: number): Promise<ArrayBuffer> {
  const size = 256;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  const field = fields.get(varId);
  if (field) ctx.putImageData(new ImageData(renderTile(field, z, x, y, size) as Uint8ClampedArray<ArrayBuffer>, size, size), 0, 0);
  return (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer();
}

let registered = false;

/** Make a variable's field available to the map; returns the tile URL template. */
export function trendTileUrl(varId: VarId, map: TrendMap): string {
  if (!fields.has(varId)) {
    const field = buildField(map);
    fields.set(varId, field);
    tileWorker()?.postMessage({ kind: "field", varId, field });
  }
  if (!registered) {
    registered = true;
    addProtocol("trend", async (params) => {
      const [v, z, x, y] = params.url.replace("trend://", "").split("/");
      const w = tileWorker();
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

const frameData = new Map<VarId, AnomalyFrames>();
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
  if (!frameData.has(f.var)) {
    frameData.set(f.var, f);
    tileWorker()?.postMessage({ kind: "frames", varId: f.var, grid: f.grid, values: f.values, colorMax: f.colorMax });
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
