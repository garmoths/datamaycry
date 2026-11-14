/**
 * When did the change speed up, slow down or turn? (docs/FEATURE_PLAN.md §3)
 *
 * Not a Pettitt test: Pettitt looks for a jump in level, and a steadily rising series always
 * looks like a jump in the middle, so every warming place would show a "break" around 2002.
 * Here the question is whether ONE straight trend or a trend that BENDS in one year fits the
 * yearly anomalies better:
 *
 *   one line   y = a + b·t                         → SSE₁
 *   bent line  y = a + b·t + c·max(0, t − t_b)     → SSE₂(t_b), continuous, no jump
 *   F = (SSE₁ − min SSE₂) / (min SSE₂ / (n − 3)),  at least MIN_SIDE years on each side of t_b
 *
 * p-value by parametric bootstrap under "a straight trend plus year-to-year memory": fit the
 * line, estimate the residuals' lag-1 autocorrelation (small-sample bias corrected), simulate
 * series from that model and count how often their best F reaches the observed one. So a
 * straight trend, however strong, gives "no bend"; only a real change of pace does.
 * Calibrated in changepoint.test.ts (three scenarios, FEATURE_PLAN §3.4).
 *
 * Kept out of stats.ts on purpose: stats.ts promises the same numbers as the Python worker,
 * and this test has no Python twin.
 *
 * Written with AI assistance (Claude).
 */
import { lag1 } from "./stats.ts";

/** Fewest years allowed on either side of the bend. */
export const MIN_SIDE = 10;
/** Bootstrap series per test (p resolution ≈ 0.002). */
export const BOOT = 500;
export const ALPHA = 0.05;

export interface ChangePoint {
  /** first year of the new pace */
  year: number;
  /** slopes before and after, per decade, in the data's units */
  before: number;
  after: number;
  p: number;
  kind: "faster" | "slower" | "reversed";
}

/** Least squares on the columns [1, t, max(0, t − tb)] (tb = null → straight line). Returns SSE. */
function fit(t: number[], y: number[], tb: number | null): { sse: number; coef: number[] } {
  // normal equations, 2×2 or 3×3, solved directly
  const cols = tb === null ? 2 : 3;
  const x = (k: number, c: number) => (c === 0 ? 1 : c === 1 ? t[k] : Math.max(0, t[k] - tb!));
  const A = Array.from({ length: cols }, () => new Array<number>(cols).fill(0));
  const b = new Array<number>(cols).fill(0);
  for (let k = 0; k < t.length; k++)
    for (let i = 0; i < cols; i++) {
      const xi = x(k, i);
      b[i] += xi * y[k];
      for (let j = 0; j < cols; j++) A[i][j] += xi * x(k, j);
    }
  const coef = solve(A, b);
  let sse = 0;
  for (let k = 0; k < t.length; k++) {
    let f = 0;
    for (let i = 0; i < cols; i++) f += coef[i] * x(k, i);
    sse += (y[k] - f) ** 2;
  }
  return { sse, coef };
}

/** Gaussian elimination with partial pivoting (tiny systems). */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / d;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

/** Best bend: largest F over every allowed year, with its fit. */
function bestBend(t: number[], y: number[]): { F: number; tb: number; coef: number[] } | null {
  const n = t.length;
  if (n < 2 * MIN_SIDE + 1) return null;
  const sse1 = fit(t, y, null).sse;
  let best: { F: number; tb: number; coef: number[] } | null = null;
  for (let k = MIN_SIDE; k <= n - MIN_SIDE; k++) {
    const tb = t[k - 1]; // the pace changes after year t[k−1]; t[k] is the first year of the new pace
    const { sse, coef } = fit(t, y, tb);
    const F = sse > 0 ? ((sse1 - sse) / sse) * (n - 3) : Infinity;
    if (!best || F > best.F) best = { F, tb, coef };
  }
  return best;
}

/** Small seeded generator (same p for the same series, every time). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function gauss(r: () => number): number {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/**
 * The bend in a yearly series, or null when there is none (p ≥ ALPHA, too few years,
 * or no usable data). `years` must be sorted; NaN values are dropped first.
 */
export function changePoint(years: number[], values: number[], opts: { boot?: number; seed?: number } = {}): ChangePoint | null {
  const t: number[] = [];
  const y: number[] = [];
  years.forEach((yr, k) => {
    if (Number.isFinite(values[k])) {
      t.push(yr);
      y.push(values[k]);
    }
  });
  const n = t.length;
  const obs = bestBend(t, y);
  if (!obs || !Number.isFinite(obs.F)) return null;

  // the null model: the straight line plus AR(1) noise
  const line = fit(t, y, null).coef;
  const resid = y.map((v, k) => v - line[0] - line[1] * t[k]);
  const mean = resid.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(resid.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 2));
  if (!(sd > 0)) return null;
  // lag-1 estimates are biased low in short series; Kendall's correction (1 + 3φ)/n
  const r1 = lag1(resid);
  const phi = Math.min(0.95, Math.max(0, r1 + (1 + 3 * r1) / n));
  const innov = sd * Math.sqrt(1 - phi * phi);

  const boot = opts.boot ?? BOOT;
  const rand = rng(opts.seed ?? Math.round(Math.abs(y.reduce((a, b) => a + b * 1e4, 0))) + n);
  let reach = 0;
  const ys = new Array<number>(n);
  for (let b = 0; b < boot; b++) {
    let e = (gauss(rand) * innov) / Math.sqrt(1 - phi * phi);
    for (let k = 0; k < n; k++) {
      if (k > 0) e = phi * e + gauss(rand) * innov;
      ys[k] = line[0] + line[1] * t[k] + e;
    }
    const sim = bestBend(t, ys);
    if (sim && sim.F >= obs.F) reach++;
  }
  const p = (reach + 1) / (boot + 1);
  if (p >= ALPHA) return null;

  const before = obs.coef[1] * 10;
  const after = (obs.coef[1] + obs.coef[2]) * 10;
  // "reversed" only when both sides have a real slope of opposite sign; a near-flat side
  // (a trend that starts or stops) counts as faster / slower
  const big = Math.max(Math.abs(before), Math.abs(after));
  const both = Math.abs(before) >= 0.25 * big && Math.abs(after) >= 0.25 * big;
  const kind: ChangePoint["kind"] =
    both && Math.sign(before) !== Math.sign(after) ? "reversed" : Math.abs(after) > Math.abs(before) ? "faster" : "slower";
  return { year: obs.tb + 1, before, after, p, kind };
}
