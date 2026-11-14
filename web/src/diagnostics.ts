/**
 * The calculation behind a result card, step by step — so the UI can show its working
 * instead of only the verdict. Everything is recomputed from the annual anomalies the
 * card itself used (TrendResult.annual) with the same functions (stats.ts), so the
 * numbers here always match the card.
 *
 *   Mann-Kendall:  S = Σ sign(x_j − x_i),  Z = (S ∓ 1) / √Var(S),  p = 2·(1 − Φ(|Z|))
 *   Kendall's τ:   S / (n·(n−1)/2)
 *   Sen's slope:   median of all pairwise slopes; 95 % CI widened for lag-1 autocorrelation
 *
 * Written with AI assistance (Claude).
 */
import type { TrendResult } from "./data.ts";
import { mannKendall, senSlope } from "./stats.ts";

export type GateId = "p05" | "ci" | "p01" | "robust";

export interface Diagnostics {
  /** complete years that went into the test */
  n: number;
  /** number of year pairs compared: n·(n−1)/2 */
  pairs: number;
  s: number;
  varS: number;
  z: number;
  p: number;
  tau: number;
  /** lag-1 autocorrelation of the detrended annual values (0…0.95) */
  r1: number;
  /** years the data is "worth" after autocorrelation: n·(1−r1)/(1+r1) */
  nEff: number;
  slopePerDecade: number;
  ci95: [number, number];
  /** spread (standard deviation) of the annual values around the trend line */
  noise: number;
  /** signal-to-noise: |total change| ÷ noise */
  snr: number;
  /** the checks behind the label, in the order they are applied */
  gates: { id: GateId; pass: boolean }[];
}

export function diagnose(r: TrendResult): Diagnostics | null {
  if (r.status !== "ok") return null;
  const { years, anomalies } = r.annual;
  if (years.length < 3) return null;
  const mk = mannKendall(anomalies);
  const sen = senSlope(years, anomalies);
  const n = mk.n;
  const pairs = (n * (n - 1)) / 2;
  const resid = anomalies.map((v, k) => v - sen.intercept - sen.slope * (years[k] - years[0]));
  const mean = resid.reduce((a, b) => a + b, 0) / n;
  const noise = Math.sqrt(resid.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  const ci: [number, number] = [sen.ci95[0] * 10, sen.ci95[1] * 10];
  return {
    n,
    pairs,
    s: mk.s,
    varS: mk.varS,
    z: mk.z,
    p: mk.p,
    tau: pairs ? mk.s / pairs : 0,
    r1: sen.r1,
    nEff: (n * (1 - sen.r1)) / (1 + sen.r1),
    slopePerDecade: sen.slope * 10,
    ci95: ci,
    noise,
    snr: noise > 0 ? Math.abs(r.totalChange) / noise : 0,
    gates: [
      { id: "p05", pass: mk.p < 0.05 },
      { id: "ci", pass: ci[0] > 0 || ci[1] < 0 },
      { id: "p01", pass: mk.p < 0.01 },
      // pre-whitened monthly test + trimmed-period test (trend.ts): both passed exactly when
      // the card reached "strong", or would have without being capped
      { id: "robust", pass: r.level === "strong" || !!r.capped },
    ],
  };
}
