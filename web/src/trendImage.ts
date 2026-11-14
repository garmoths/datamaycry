/**
 * The world trend map as a MapLibre raster tile source: trend://{VAR}/{z}/{x}/{y}.
 * The maths (palette, opacity, B-spline tiles) lives in trendField.ts so the tile
 * worker can use it without loading MapLibre.
 * Written with AI assistance (Claude).
 */
import { addProtocol } from "maplibre-gl";
import type { TrendMap, VarId } from "./data.ts";
import { buildField, renderTile, type TrendField } from "./trendField.ts";

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
