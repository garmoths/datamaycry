/** The "show the working" numbers must be the card's own numbers. Written with AI assistance (Claude). */
import { describe, expect, it } from "vitest";
import { diagnose } from "./diagnostics.ts";
import { analyzeTrend } from "./trend.ts";
import { summarizeCells } from "./continentStats.ts";
import type { Series, TrendMap } from "./data.ts";

function series(slopePerYear: number, noise: number): Series {
  const values = new Float64Array(46 * 12);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let k = 0; k < values.length; k++) values[k] = 10 + slopePerYear * (k / 12) + 3 * Math.sin((k * Math.PI) / 6) + noise * rnd();
  return { var: "T2M", unit: "°C", start: "1980-01", values, label: { en: "x", tr: "x" } };
}

describe("diagnose", () => {
  it("repeats the card's p, slope and interval", () => {
    const r = analyzeTrend(series(0.03, 1));
    const d = diagnose(r)!;
    expect(d.p).toBeCloseTo(r.pValue, 12);
    expect(d.slopePerDecade).toBeCloseTo(r.slopePerDecade, 12);
    expect(d.ci95[0]).toBeCloseTo(r.ci95[0], 12);
    expect(d.ci95[1]).toBeCloseTo(r.ci95[1], 12);
    expect(d.n).toBe(r.annual.years.length);
    expect(d.pairs).toBe((d.n * (d.n - 1)) / 2);
    expect(Math.abs(d.tau)).toBeLessThanOrEqual(1);
    expect(d.nEff).toBeLessThanOrEqual(d.n);
  });

  it("gates agree with the label", () => {
    const strong = diagnose(analyzeTrend(series(0.05, 0.5)))!;
    expect(strong.gates.every((g) => g.pass)).toBe(true);
    const flat = analyzeTrend(series(0, 2));
    expect(flat.level).toBe("none");
    expect(diagnose(flat)!.gates.find((g) => g.id === "robust")!.pass).toBe(false);
  });

  it("has nothing to say when the test could not run", () => {
    expect(diagnose(analyzeTrend(series(0.03, 1), { startYear: 2020, endYear: 2024 }))).toBeNull();
  });
});

describe("summarizeCells", () => {
  it("gives percentiles, spread, shares and a histogram that sums to 1", () => {
    const N = 361 * 576;
    const map: TrendMap = {
      var: "T2M",
      grid: { nlat: 361, nlon: 576, lat0: -90, lon0: -180, dlat: 0.5, dlon: 0.625 },
      years: { start: 1980, end: 2025 },
      slopePerDecade: new Float32Array(N).fill(NaN),
      pValue: new Float32Array(N).fill(NaN),
      level: new Uint8Array(N).fill(255),
      fdr: new Uint8Array(N),
    };
    const row = 180 * 576; // the equator: every cell weighs the same
    const cells = Array.from({ length: 10 }, (_, k) => row + k);
    cells.forEach((c, k) => {
      map.slopePerDecade[c] = k - 4; // −4 … +5
      map.level[c] = 0;
      map.fdr[c] = k < 3 ? 1 : 0;
    });
    const s = summarizeCells(map, cells)!;
    expect(s.cells).toBe(10);
    expect(s.meanSlope).toBeCloseTo(0.5);
    expect(s.median).toBe(0);
    expect(s.p10).toBe(-4);
    expect(s.p90).toBe(4);
    expect(s.upShare).toBeCloseTo(0.5);
    expect(s.fdrShare).toBeCloseTo(0.3);
    expect(s.hist.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(s.sd).toBeCloseTo(Math.sqrt(8.25));
  });
});
