/**
 * Trend statistics, browser side (PLAN.md §3.5–3.7).
 * Must give the same numbers as the Python worker (parity test, L2).
 *
 *  - Mann-Kendall with tie correction (same as pymannkendall.original_test)
 *  - Sen's slope, 95% CI corrected for lag-1 autocorrelation (effective sample)
 *  - Pre-whitened monthly MK (same as pymannkendall.pre_whitening_modification_test)
 *
 * Written with AI assistance (Claude).
 */

export interface MKResult {
  n: number;
  s: number;
  varS: number;
  z: number;
  p: number;
}

/** Two-sided Mann-Kendall. NaNs are dropped first. */
export function mannKendall(input: ArrayLike<number>): MKResult {
  const x = Array.from(input).filter((v) => !Number.isNaN(v));
  const n = x.length;
  const s = n > 64 ? mkScoreFast(x) : mkScoreDirect(x);
  const varS = mkVariance(x);
  let z = 0;
  if (varS > 0) {
    if (s > 0) z = (s - 1) / Math.sqrt(varS);
    else if (s < 0) z = (s + 1) / Math.sqrt(varS);
  }
  const p = 2 * (1 - normCdf(Math.abs(z)));
  return { n, s, varS, z, p };
}

/** S = Σ_{i<j} sign(x_j − x_i), the direct O(n²) sum. */
function mkScoreDirect(x: number[]): number {
  let s = 0;
  for (let i = 0; i < x.length - 1; i++) for (let j = i + 1; j < x.length; j++) s += Math.sign(x[j] - x[i]);
  return s;
}

/**
 * The same S in O(n log n) with a Fenwick tree over value ranks: for each j, add the
 * number of earlier values below x_j and subtract those above it. Exact integers, so the
 * result is identical to mkScoreDirect (ties count 0 in both). Used for the ~550-point
 * monthly series, where the direct sum costs ~150 000 steps per test.
 */
function mkScoreFast(x: number[]): number {
  const sorted = [...new Set(x)].sort((a, b) => a - b);
  const rank = new Map(sorted.map((v, k) => [v, k + 1]));
  const tree = new Int32Array(sorted.length + 1);
  const upTo = (r: number) => {
    let c = 0;
    for (; r > 0; r -= r & -r) c += tree[r];
    return c;
  };
  let s = 0;
  for (let j = 0; j < x.length; j++) {
    const r = rank.get(x[j])!;
    const below = upTo(r - 1);
    const above = j - upTo(r);
    s += below - above;
    for (let q = r; q < tree.length; q += q & -q) tree[q]++;
  }
  return s;
}

/** Var(S) with tie correction. */
export function mkVariance(x: number[]): number {
  const n = x.length;
  const counts = new Map<number, number>();
  for (const v of x) counts.set(v, (counts.get(v) ?? 0) + 1);
  let ties = 0;
  for (const t of counts.values()) if (t > 1) ties += t * (t - 1) * (2 * t + 5);
  return (n * (n - 1) * (2 * n + 5) - ties) / 18;
}

/** All pairwise slopes (y_j - y_i)/(t_j - t_i), sorted ascending. */
function pairwiseSlopes(t: number[], y: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < y.length - 1; i++) {
    for (let j = i + 1; j < y.length; j++) out.push((y[j] - y[i]) / (t[j] - t[i]));
  }
  return out.sort((a, b) => a - b);
}

function median(sorted: number[]): number {
  const m = sorted.length;
  if (m === 0) return NaN;
  return m % 2 ? sorted[(m - 1) / 2] : (sorted[m / 2 - 1] + sorted[m / 2]) / 2;
}

export interface SenResult {
  slope: number; // per unit of t
  intercept: number; // at t = t[0]
  ci95: [number, number];
  r1: number; // lag-1 autocorrelation of detrended series (used for CI)
}

/**
 * Sen's slope with a 95% CI. Var(S) is inflated by (1 + r1) / (1 − r1),
 * r1 = lag-1 autocorrelation of the detrended series, clamped to [0, 0.95]
 * so the correction never makes the interval narrower.
 */
export function senSlope(t: number[], y: number[]): SenResult {
  const slopes = pairwiseSlopes(t, y);
  const slope = median(slopes);
  // Same convention as pymannkendall: median(y) − slope · median(t − t0).
  const intercept =
    median([...y].sort((a, b) => a - b)) -
    slope * median(t.map((v) => v - t[0]).sort((a, b) => a - b));
  const resid = y.map((v, k) => v - intercept - slope * (t[k] - t[0]));
  const r1 = Math.min(Math.max(lag1(resid), 0), 0.95);
  const varS = mkVariance(y) * ((1 + r1) / (1 - r1));
  const c = Z975 * Math.sqrt(varS);
  const nSlopes = slopes.length;
  const m1 = Math.round((nSlopes - c) / 2);
  const m2 = Math.round((nSlopes + c) / 2);
  const lo = slopes[Math.min(Math.max(m1 - 1, 0), nSlopes - 1)];
  const hi = slopes[Math.min(Math.max(m2, 0), nSlopes - 1)];
  return { slope, intercept, ci95: [lo, hi], r1 };
}

/** Lag-1 sample autocorrelation (same estimator as pymannkendall's acf). */
export function lag1(x: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const mean = x.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let k = 0; k < n; k++) {
    const d = x[k] - mean;
    den += d * d;
    if (k < n - 1) num += d * (x[k + 1] - mean);
  }
  return den === 0 ? 0 : num / den;
}

/** MK on the pre-whitened series x[1:] − r1·x[:-1] (Yue & Wang 2002 style). */
export function preWhitenedMK(input: ArrayLike<number>): MKResult {
  const x = Array.from(input).filter((v) => !Number.isNaN(v));
  const r1 = lag1(x);
  const w: number[] = [];
  for (let k = 1; k < x.length; k++) w.push(x[k] - r1 * x[k - 1]);
  return mannKendall(w);
}

// ─── Normal CDF (accurate to ~1e-15, needed for Python ↔ JS parity) ─────────

const Z975 = 1.959963984540054;

export function normCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x);
  if (x < 3) return 1 - erfSeries(x);
  // Continued fraction (Lentz) for large x.
  const tiny = 1e-300;
  let f = x;
  let c = x;
  let d = 0;
  for (let k = 1; k < 200; k++) {
    const a = k / 2;
    d = x + a * d;
    d = d === 0 ? tiny : d;
    c = x + a / c;
    c = c === 0 ? tiny : c;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / (f * Math.sqrt(Math.PI));
}

function erfSeries(x: number): number {
  let term = x;
  let sum = x;
  for (let n = 1; n < 200; n++) {
    term *= (-x * x) / n;
    const add = term / (2 * n + 1);
    sum += add;
    if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
}

// ─── Display-only smoothers (charts). Not used by any test or label. ────────

/**
 * LOESS (Cleveland 1979): for every x, a straight line fitted to the nearest
 * `span` share of the points with tricube weights. Shows bends and humps that
 * a single straight trend line hides. x must be sorted ascending.
 */
export function loess(x: number[], y: number[], span = 0.5): number[] {
  const n = x.length;
  const k = Math.max(3, Math.min(n, Math.ceil(span * n)));
  return x.map((x0) => {
    const d = x.map((v) => Math.abs(v - x0));
    const h = [...d].sort((a, b) => a - b)[k - 1] || 1;
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < n; i++) {
      const u = d[i] / h;
      if (u >= 1) continue;
      const w = (1 - u ** 3) ** 3;
      sw += w;
      sx += w * x[i];
      sy += w * y[i];
      sxx += w * x[i] * x[i];
      sxy += w * x[i] * y[i];
    }
    const den = sw * sxx - sx * sx;
    if (Math.abs(den) < 1e-12) return sy / sw;
    const b = (sw * sxy - sx * sy) / den;
    return (sy - b * sx) / sw + b * x0;
  });
}

/** Centred running mean over `window` points; NaN where the window is incomplete or has gaps. */
export function runningMean(values: ArrayLike<number>, window = 12): number[] {
  const n = values.length;
  const before = Math.floor(window / 2);
  const out = new Array<number>(n).fill(NaN);
  for (let i = before; i + (window - before) <= n; i++) {
    let s = 0;
    for (let j = i - before; j < i - before + window; j++) s += values[j];
    out[i] = s / window; // NaN propagates: a gap inside the window gives NaN
  }
  return out;
}
