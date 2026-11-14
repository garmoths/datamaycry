/**
 * Calibration of the bend test (docs/FEATURE_PLAN.md §3.4). Three scenarios, 46 years:
 *  1. no trend, AR(1) φ = 0.6        → "no bend" (false alarms ≤ 5 %, with sampling slack)
 *  2. straight trend + AR(1) φ = 0.6  → "no bend" (where a Pettitt test would fail)
 *  3. the slope triples in 1998       → bend found, near 1998
 * Written with AI assistance (Claude).
 */
import { describe, expect, it } from "vitest";
import { changePoint } from "./changepoint.ts";
import { yearSuffix } from "./turkish.ts";

const YEARS = Array.from({ length: 46 }, (_, k) => 1980 + k);

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());
}
function ar1(r: () => number, phi: number, sigma: number): number[] {
  let e = (gauss(r) * sigma) / Math.sqrt(1 - phi * phi);
  return YEARS.map((_, k) => (k === 0 ? e : (e = phi * e + gauss(r) * sigma)));
}

// fewer bootstrap draws in tests keeps the run short; p resolution is still 1/151
const OPTS = { boot: 150 };
const REPS = 300;

describe("bend test calibration", () => {
  it("rarely finds a bend in pure noise with year-to-year memory", () => {
    const r = rng(11);
    let alarms = 0;
    for (let k = 0; k < REPS; k++) if (changePoint(YEARS, ar1(r, 0.6, 0.3), { ...OPTS, seed: k + 1 })) alarms++;
    // 5 % target; 300 runs → the binomial 95 % upper limit of a true 5 % rate is about 7.5 %
    console.log(`no trend: ${alarms}/${REPS} false bends`);
    expect(alarms / REPS).toBeLessThanOrEqual(0.08);
  }, 120_000);

  it("rarely finds a bend in a straight trend (the case a level-shift test gets wrong)", () => {
    const r = rng(23);
    let alarms = 0;
    for (let k = 0; k < REPS; k++) {
      const noise = ar1(r, 0.6, 0.3);
      const y = YEARS.map((yr, i) => 0.04 * (yr - 1980) + noise[i]); // +0.4 per decade, very clear
      if (changePoint(YEARS, y, { ...OPTS, seed: k + 1 })) alarms++;
    }
    console.log(`straight trend: ${alarms}/${REPS} false bends`);
    expect(alarms / REPS).toBeLessThanOrEqual(0.08);
  }, 120_000);

  it("finds a real change of pace, near the right year", () => {
    const r = rng(37);
    let found = 0, near = 0, faster = 0;
    const reps = 150;
    for (let k = 0; k < reps; k++) {
      const noise = ar1(r, 0.3, 0.12);
      // +0.1 per decade until 1997, then +0.6 per decade
      const y = YEARS.map((yr, i) => 0.01 * (yr - 1980) + 0.05 * Math.max(0, yr - 1997) + noise[i]);
      const c = changePoint(YEARS, y, { ...OPTS, seed: k + 1 });
      if (c) {
        found++;
        if (Math.abs(c.year - 1998) <= 4) near++;
        if (c.kind === "faster") faster++;
      }
    }
    console.log(`bend found in ${found}/${reps}, within ±4 years of 1998 in ${near}/${found}`);
    expect(found / reps).toBeGreaterThanOrEqual(0.7);
    expect(near / found).toBeGreaterThanOrEqual(0.7);
    // with a noisy, nearly flat start a few runs read the start as slightly falling ("reversed")
    expect(faster / found).toBeGreaterThanOrEqual(0.9);
  }, 120_000);
});

describe("bend test details", () => {
  it("needs ten years on each side", () => {
    const y = YEARS.slice(0, 19).map((yr) => (yr > 1990 ? yr - 1990 : 0));
    expect(changePoint(YEARS.slice(0, 19), y)).toBeNull();
  });
  it("gives the same answer for the same series", () => {
    const y = YEARS.map((yr) => (yr > 2000 ? (yr - 2000) * 0.08 : 0) + Math.sin(yr) * 0.05);
    expect(changePoint(YEARS, y)).toEqual(changePoint(YEARS, y));
  });
  it("names a reversal when the sign of the slope flips", () => {
    const y = YEARS.map((yr) => (yr <= 2002 ? (yr - 1980) * 0.05 : 1.1 - (yr - 2002) * 0.05) + Math.sin(yr * 1.7) * 0.02);
    expect(changePoint(YEARS, y)?.kind).toBe("reversed");
  });
});

describe("Turkish year suffixes", () => {
  it("follow the last spoken word", () => {
    expect(["1998", "2010", "2003", "1990", "2000", "1986", "2004", "1940"].map((y) => yearSuffix(+y, "de"))).toEqual([
      "1998'de", "2010'da", "2003'te", "1990'da", "2000'de", "1986'da", "2004'te", "1940'ta",
    ]);
    expect(yearSuffix(2012, "den")).toBe("2012'den");
    expect(yearSuffix(1990, "den")).toBe("1990'dan");
  });
});
