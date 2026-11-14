// Python ↔ JS parity (PLAN.md L2): numbers must match pymannkendall.
import { describe, expect, it } from "vitest";
import cases from "./__fixtures__/mk_parity.json";
import { mannKendall, normCdf, preWhitenedMK, senSlope } from "./stats.ts";

describe("Mann-Kendall parity with pymannkendall", () => {
  it.each(cases.map((c, k) => [k, c] as const))("case %i", (_, c) => {
    const r = mannKendall(c.x);
    expect(r.s).toBe(c.s);
    expect(r.varS).toBeCloseTo(c.var_s, 6);
    expect(Math.abs(r.p - c.p)).toBeLessThan(1e-6);
    const t = c.x.map((_, i) => i);
    const sen = senSlope(t, c.x);
    expect(Math.abs(sen.slope - c.slope)).toBeLessThan(1e-9);
    expect(Math.abs(sen.intercept - c.intercept)).toBeLessThan(1e-9);
    expect(Math.abs(preWhitenedMK(c.x).p - c.pw_p)).toBeLessThan(1e-6);
  });
});

describe("normCdf", () => {
  it("matches known values", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 15);
    expect(normCdf(1.959963984540054)).toBeCloseTo(0.975, 12);
    expect(Math.abs(1 - normCdf(5) - 2.866515718791939e-7)).toBeLessThan(1e-15);
  });
});

describe("display smoothers", () => {
  it("loess reproduces a straight line exactly", async () => {
    const { loess } = await import("./stats.ts");
    const x = Array.from({ length: 46 }, (_, i) => 1980 + i);
    const y = x.map((v) => 0.04 * (v - 1980) - 1);
    loess(x, y, 0.5).forEach((v, i) => expect(v).toBeCloseTo(y[i], 9));
  });
  it("loess follows a hump that a straight line misses", async () => {
    const { loess } = await import("./stats.ts");
    const x = Array.from({ length: 46 }, (_, i) => i);
    const y = x.map((v) => Math.exp(-((v - 23) ** 2) / 50));
    const s = loess(x, y, 0.4);
    expect(s[23]).toBeGreaterThan(0.6);
    expect(s[0]).toBeLessThan(0.2);
  });
  it("running mean: constant stays constant, gaps and edges are NaN", async () => {
    const { runningMean } = await import("./stats.ts");
    const v = new Array(36).fill(5);
    const r = runningMean(v, 12);
    expect(r[6]).toBe(5);
    expect(Number.isNaN(r[0])).toBe(true);
    v[20] = NaN;
    expect(Number.isNaN(runningMean(v, 12)[18])).toBe(true);
  });
});

describe("fast Mann-Kendall score", () => {
  it("gives exactly the direct O(n²) sum, ties included", () => {
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let k = 0; k < 60; k++) {
      const n = 65 + Math.floor(rnd() * 600);
      const x = Array.from({ length: n }, (_, i) => (k % 3 === 0 ? Math.round(rnd() * 6) : rnd() + i * 0.001 * (k % 5)));
      let direct = 0;
      for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) direct += Math.sign(x[j] - x[i]);
      expect(mannKendall(x).s).toBe(direct);
    }
  });
});
