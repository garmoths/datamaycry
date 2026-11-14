// Written with AI assistance (Claude).
import { describe, expect, it } from "vitest";
import { buildAnomalyField, renderTile, type TrendField } from "./trendField.ts";

function field(nlat: number, nlon: number): TrendField {
  const rgba = new Float32Array(nlat * nlon * 4);
  for (let k = 0; k < nlat * nlon; k++) {
    const a = 0.3 + 0.5 * ((k * 7919) % 101) / 101;
    rgba.set([200 * a, 80 * a, 40 * a, a], k * 4);
  }
  return { nlat, nlon, rgba, capN: [0, 0, 0, 0], capS: [0, 0, 0, 0] };
}

describe("renderTile grid", () => {
  it("explicit MERRA grid gives exactly the old output (trend map unchanged)", () => {
    const f = field(361, 576);
    const a = renderTile(f, 1, 1, 0, 64);
    const b = renderTile({ ...f, lat0: -90, lon0: -180, dlat: 0.5, dlon: 0.625 }, 1, 1, 0, 64);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
  it("anomaly field: missing stays transparent, sign picks warm or cold, colour scale is fixed", () => {
    const grid = { nlat: 2, nlon: 2, lat0: 0, lon0: 0, dlat: 1, dlon: 1 };
    const f = buildAnomalyField([NaN, 2, -2, 0.01], 0, grid, 2);
    expect(f.rgba[3]).toBe(0);                    // NaN → no colour
    expect(f.rgba[4]).toBeGreaterThan(f.rgba[6]); // +2 → red > blue
    expect(f.rgba[10]).toBeGreaterThan(f.rgba[8]); // −2 → blue > red
    expect(f.rgba[15]).toBeLessThan(0.01);         // tiny change fades out
  });
});

describe("zooming does not change the colours", () => {
  // a smooth field: what a tile shows must depend on the place, not on the zoom level
  const nlat = 361, nlon = 576;
  const rgba = new Float32Array(nlat * nlon * 4);
  for (let i = 0; i < nlat; i++)
    for (let j = 0; j < nlon; j++) {
      const a = 0.5 + 0.3 * Math.sin(i / 25) * Math.cos(j / 30);
      rgba.set([220 * a, (100 + 80 * Math.cos(i / 40)) * a, 60 * a, a], (i * nlon + j) * 4);
    }
  const f: TrendField = { nlat, nlon, rgba, capN: [0, 0, 0, 0], capS: [0, 0, 0, 0] };
  const px = (t: Uint8ClampedArray, r: number, c: number, size: number) => Array.from(t.slice((r * size + c) * 4, (r * size + c) * 4 + 4));

  it("a parent tile and its four children agree at the same places", () => {
    const size = 64;
    const parent = renderTile(f, 3, 4, 2, size);
    let worst = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const child = renderTile(f, 4, 8 + dx, 4 + dy, size);
      // child pixel (2r+1, 2c+1) sits right next to parent pixel (r + dy·size/2, c + dx·size/2)
      for (let r = 2; r < size / 2 - 2; r += 5)
        for (let c = 2; c < size / 2 - 2; c += 5) {
          const p = px(parent, r + (dy * size) / 2, c + (dx * size) / 2, size);
          const k = px(child, 2 * r + 1, 2 * c + 1, size);
          for (let m = 0; m < 4; m++) worst = Math.max(worst, Math.abs(p[m] - k[m]));
        }
    }
    expect(worst).toBeLessThanOrEqual(3); // out of 255: no visible jump between zoom levels
  });

  it("the same tile is painted the same way every time (cached tiles match fresh ones)", () => {
    const a = renderTile(f, 5, 17, 11, 32);
    const b = renderTile(f, 5, 17, 11, 32);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
