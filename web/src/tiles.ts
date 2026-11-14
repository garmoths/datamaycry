/**
 * Web-Mercator tiles covering a view, for painting every year's tiles before playback.
 * Pure (no MapLibre), so it is unit tested (tiles.test.ts).
 * Written with AI assistance (Claude).
 */
export interface View {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Tiles at the current integer zoom (capped at maxZoom) that cover the view, at most `max`. */
export function tilesInView(v: View, zoom: number, maxZoom = 6, max = 32): { z: number; x: number; y: number }[] {
  const z = Math.max(0, Math.min(maxZoom, Math.floor(zoom)));
  const n = 2 ** z;
  const tx = (lon: number) => Math.floor(((lon + 180) / 360) * n);
  const ty = (lat: number) => {
    const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const y0 = Math.max(0, ty(v.north)), y1 = Math.min(n - 1, ty(v.south));
  let x0 = tx(v.west), x1 = tx(v.east);
  // the whole world in view, or a view across the antimeridian seen as one span
  if (x1 < x0 || v.east - v.west >= 360) [x0, x1] = [0, n - 1];
  const out: { z: number; x: number; y: number }[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (out.length < max) out.push({ z, x: ((x % n) + n) % n, y });
  return out;
}
