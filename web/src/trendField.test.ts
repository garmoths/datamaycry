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
