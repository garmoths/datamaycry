/** Change month by month (docs/FEATURE_PLAN.md §5). Written with AI assistance (Claude). */
import { describe, expect, it } from "vitest";
import { benjaminiHochberg, monthlyTrends, summarizeMonths } from "./monthly.ts";
import type { Series } from "./data.ts";

function series(trendFor: (month: number) => number, noise = 0.3, seed = 5): Series {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
  const values = new Float64Array(46 * 12);
  for (let k = 0; k < values.length; k++) {
    const month = (k % 12) + 1;
    const year = Math.floor(k / 12);
    values[k] = 10 + 8 * Math.sin((month / 12) * 2 * Math.PI) + trendFor(month) * year + noise * rnd();
  }
  return { var: "T2M", unit: "°C", start: "1980-01", values, label: { en: "x", tr: "x" } };
}

describe("Benjamini–Hochberg", () => {
  it("matches a worked example", () => {
    // sorted p: .001 .008 .039 .041 .042 .06 .074 .205 .212 .216 .222 .251 (m = 12, q = .05)
    const p = [0.205, 0.001, 0.042, 0.008, 0.06, 0.039, 0.212, 0.041, 0.216, 0.074, 0.222, 0.251];
    const pass = benjaminiHochberg(p);
    // thresholds k/12·0.05: .0042 .0083 .0125 … → only .001 and .008 pass
    expect(p.filter((_, k) => pass[k]).sort()).toEqual([0.001, 0.008]);
  });
  it("ignores missing p-values", () => {
    expect(benjaminiHochberg([NaN, 0.001, NaN])).toEqual([false, true, false]);
  });
});

describe("monthly trends", () => {
  it("finds a summer-only warming in summer and nowhere else", () => {
    const m = monthlyTrends(series((mo) => (mo >= 6 && mo <= 8 ? 0.06 : 0)), { startYear: 1980, endYear: 2025 });
    const clear = m.filter((x) => x.level !== "none").map((x) => x.month);
    expect(clear).toEqual([6, 7, 8]);
    const s = summarizeMonths(m);
    expect(s.up.sort()).toEqual([6, 7, 8]);
    expect(s.down).toEqual([]);
    expect(s.quiet).toBe(9);
  });

  it("marks months that never change as constant, not as zero trend", () => {
    const base = series(() => 0.05);
    const values = base.values.map((v, k) => ((k % 12) + 1 >= 6 && (k % 12) + 1 <= 8 ? 0 : v));
    const m = monthlyTrends({ ...base, values }, { startYear: 1980, endYear: 2025 });
    expect(m.filter((x) => x.level === "constant").map((x) => x.month)).toEqual([6, 7, 8]);
  });
});
