/** Continent summary from the trend map. Written with AI assistance (Claude). */
import { describe, expect, it } from "vitest";
import { summarize } from "./continentStats.ts";
import type { TrendMap } from "./data.ts";

const N = 361 * 576;
function fakeMap(): TrendMap {
  return {
    var: "T2M",
    grid: { nlat: 361, nlon: 576, lat0: -90, lon0: -180, dlat: 0.5, dlon: 0.625 },
    years: { start: 1980, end: 2025 },
    slopePerDecade: new Float32Array(N).fill(NaN),
    pValue: new Float32Array(N).fill(NaN),
    level: new Uint8Array(N).fill(255),
    fdr: new Uint8Array(N),
  };
}

describe("summarize", () => {
  it("area-weights by cos(latitude) and splits shares by evidence level", () => {
    const map = fakeMap();
    const grid = new Uint16Array(N);
    const equator = 180 * 576; // row i = 180 → 0°
    const sixty = 300 * 576; // row i = 300 → 60°N, weight cos 60° = 0.5
    grid[equator] = grid[sixty] = 1;
    map.slopePerDecade[equator] = 0.3;
    map.level[equator] = 2;
    map.slopePerDecade[sixty] = -0.3;
    map.level[sixty] = 0;
    const s = summarize(map, grid, 1)!;
    expect(s.cells).toBe(2);
    expect(s.meanSlope).toBeCloseTo((0.3 * 1 - 0.3 * 0.5) / 1.5);
    expect(s.strongUp).toBeCloseTo(1 / 1.5);
    expect(s.none).toBeCloseTo(0.5 / 1.5);
    expect(s.strongDown).toBe(0);
  });

  it("ignores no-data cells and returns null when nothing is left", () => {
    const map = fakeMap();
    const grid = new Uint16Array(N);
    grid[1000] = 3;
    expect(summarize(map, grid, 3)).toBeNull();
  });
});
