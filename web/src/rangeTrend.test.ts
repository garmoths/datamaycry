// Written with AI assistance (Claude).
import { describe, expect, it } from "vitest";
import { rangeTrend } from "./rangeTrend.ts";

describe("period trend map", () => {
  // 3 cells × 30 years: a clean rise, pure alternation (no trend), and mostly missing
  const years = 30, cells = 3;
  const v = new Float32Array(years * cells);
  for (let k = 0; k < years; k++) {
    v[k * cells + 0] = 0.05 * k; // +0.5 per decade
    v[k * cells + 1] = k % 2 ? 1 : -1;
    v[k * cells + 2] = k < 5 ? 1 : NaN;
  }
  it("Sen slope per decade and a small p for a clean trend", () => {
    const r = rangeTrend(v, cells, 0, years - 1);
    expect(r.slopePerDecade[0]).toBeCloseTo(0.5, 5);
    expect(r.pValue[0]).toBeLessThan(0.001);
  });
  it("no trend gives a large p", () => {
    const r = rangeTrend(v, cells, 0, years - 1);
    expect(r.pValue[1]).toBeGreaterThan(0.5);
  });
  it("too few years with data → no value", () => {
    const r = rangeTrend(v, cells, 0, years - 1);
    expect(r.level[2]).toBe(255);
    expect(Number.isNaN(r.slopePerDecade[2])).toBe(true);
  });
  it("uses only the chosen years", () => {
    const r = rangeTrend(v, cells, 10, 19);
    expect(r.slopePerDecade[0]).toBeCloseTo(0.5, 5);
    expect(r.level[2]).toBe(255);
  });
});
