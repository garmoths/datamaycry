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
