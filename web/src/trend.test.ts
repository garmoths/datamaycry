// Python ↔ JS parity for the whole protocol (PLAN.md L2): same series → same card.
import { describe, expect, it } from "vitest";
import cases from "./__fixtures__/trend_parity.json";
import { analyzeTrend } from "./trend.ts";

describe("analyzeTrend parity with worker/protocol.py", () => {
  it.each(cases.map((c, k) => [k, c] as const))("case %i", (_, c) => {
    const values = Float64Array.from(c.values, (v) => (v === null ? NaN : v));
    const series = { var: "T2M" as const, unit: "°C", start: "1980-01", values, label: { en: "", tr: "" } };
    const r = analyzeTrend(series, c.opts);
    expect(r.status).toBe(c.status);
    expect(r.level).toBe(c.level);
    expect(r.annual.years).toEqual(c.years);
    if (c.status === "ok" && c.slopePerDecade !== null && c.pValue !== null && c.ci95[0] !== null && c.ci95[1] !== null) {
      expect(Math.abs(r.slopePerDecade - c.slopePerDecade)).toBeLessThan(1e-9);
      expect(Math.abs(r.ci95[0] - c.ci95[0])).toBeLessThan(1e-9);
      expect(Math.abs(r.ci95[1] - c.ci95[1])).toBeLessThan(1e-9);
      expect(Math.abs(r.pValue - c.pValue)).toBeLessThan(1e-6);
    }
  });
});

describe("emergence", () => {
  it("finds when a growing trend becomes possible, then strong", async () => {
    const { emergence } = await import("./trend.ts");
    // steady rise of 0.04/yr in realistic noise (seeded): no evidence early on,
    // evidence later, and once it appears it stays until the end
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648) - 0.5;
    const values = Float64Array.from({ length: 561 }, (_, k) =>
      8 * Math.cos((2 * Math.PI * ((k % 12) - 6.5)) / 12) + 0.04 * (k / 12) + 2.4 * rnd());
    const series = { var: "T2M" as const, unit: "°C", start: "1980-01", values, label: { en: "", tr: "" } };
    const e = emergence(series, {}, 1980, 2025);
    expect(e.possible).not.toBeNull();
    expect(e.possible!).toBeGreaterThan(1990);
    expect(e.strong).not.toBeNull();
    expect(e.strong!).toBeGreaterThanOrEqual(e.possible!);
    expect(e.levels.get(1989)).toBe("none");
  });
});
