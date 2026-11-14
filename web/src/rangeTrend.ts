/**
 * Trend of every grid cell for a chosen period, from the yearly anomaly maps (contract 1.4,
 * 1° × 1.25°). Same family of methods as the cards: Mann-Kendall test (normal approximation
 * with continuity correction) and Sen's slope, here on annual values, per decade.
 * Used for the map only; the cards keep the full protocol on monthly series.
 * Runs in the tile worker (~0.3–1 s for 52 128 cells × 46 years).
 * Written with AI assistance (Claude).
 */
import { normCdf } from "./stats.ts";

export interface RangeTrend {
  slopePerDecade: Float32Array;
  pValue: Float32Array;
  /** 0 = has a value, 255 = too few years with data */
  level: Uint8Array;
}

/** k-th smallest of a[0..n-1] (reorders a). */
function select(a: Float64Array, n: number, k: number): number {
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const pivot = a[(lo + hi) >> 1];
    let i = lo, j = hi;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) {
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return a[k];
  }
  return a[k];
}

/** values: [year][cell] for all years; i0…i1 = first and last year index of the period. */
export function rangeTrend(values: Float32Array, nCells: number, i0: number, i1: number): RangeTrend {
  const ny = i1 - i0 + 1;
  const slope = new Float32Array(nCells).fill(NaN);
  const pValue = new Float32Array(nCells).fill(NaN);
  const level = new Uint8Array(nCells).fill(255);
  const t = new Float64Array(ny), y = new Float64Array(ny);
  const pairs = new Float64Array((ny * (ny - 1)) / 2);
  const minYears = Math.max(10, Math.ceil(0.8 * ny));
  for (let c = 0; c < nCells; c++) {
    let m = 0;
    for (let k = 0; k < ny; k++) {
      const v = values[(i0 + k) * nCells + c];
      if (Number.isFinite(v)) {
        t[m] = k;
        y[m] = v;
        m++;
      }
    }
    if (m < minYears) continue;
    let s = 0, np = 0;
    for (let a = 0; a < m - 1; a++)
      for (let b = a + 1; b < m; b++) {
        const d = y[b] - y[a];
        s += d > 0 ? 1 : d < 0 ? -1 : 0;
        pairs[np++] = d / (t[b] - t[a]);
      }
    const varS = (m * (m - 1) * (2 * m + 5)) / 18;
    const z = s === 0 ? 0 : (s - Math.sign(s)) / Math.sqrt(varS);
    const half = np >> 1;
    const med = np % 2 ? select(pairs, np, half) : (select(pairs, np, half - 1) + select(pairs, np, half)) / 2;
    slope[c] = med * 10;
    pValue[c] = 2 * (1 - normCdf(Math.abs(z)));
    level[c] = 0;
  }
  return { slopePerDecade: slope, pValue, level };
}
