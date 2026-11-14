/**
 * Renders trend-map tiles off the main thread so the globe never stutters while new
 * tiles are needed (panning, zooming, switching variables).
 *   in:  { kind: "field", varId, field }          – once per variable
 *        { kind: "tile", id, varId, z, x, y }     – per tile
 *   out: { id, png: ArrayBuffer | null }
 * Written with AI assistance (Claude).
 */
import { renderTile, type TrendField } from "./trendField.ts";

const fields = new Map<string, TrendField>();
const SIZE = 256;

type Msg =
  | { kind: "field"; varId: string; field: TrendField }
  | { kind: "tile"; id: number; varId: string; z: number; x: number; y: number };

self.onmessage = async (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.kind === "field") {
    fields.set(m.varId, m.field);
    return;
  }
  const field = fields.get(m.varId);
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  if (field && ctx) {
    const px = renderTile(field, m.z, m.x, m.y, SIZE);
    ctx.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, SIZE, SIZE), 0, 0);
  }
  const png = await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer();
  (self as unknown as Worker).postMessage({ id: m.id, png }, [png]);
};
