/**
 * Area summaries for many places at once (docs/FEATURE_PLAN.md §1.2).
 *
 * `summarize` in continentStats.ts walks the whole grid for ONE place. Rankings and the
 * "similar places" list need every country at once, so this walks the grid ONCE and
 * accumulates every id painted in it (~5 ms for 242 countries).
 *
 * Written with AI assistance (Claude).
 */
import type { TrendMap } from "./data.ts";

const NLAT = 361;
const NLON = 576;

/** What the fingerprint and the rankings need per place (shares are of the area with data). */
export interface GridMean {
  meanSlope: number;
  strongUp: number;
  strongDown: number;
  possible: number;
  cells: number;
}

const weightOf = (k: number) => Math.cos(((-90 + Math.floor(k / NLON) * 0.5) * Math.PI) / 180);

/**
 * Summary for every id 1…n painted in `grid` (index 0 of the result = id 1). Same rules as
 * `summarize`: cos(latitude) area weights, "no data" cells skipped, never counted as 0.
 * A place with no data gets null.
 */
export function summarizeByGrid(map: TrendMap, grid: Uint16Array, n: number): (GridMean | null)[] {
  const w = new Float64Array(n + 1), ws = new Float64Array(n + 1);
  const up = new Float64Array(n + 1), down = new Float64Array(n + 1), pos = new Float64Array(n + 1);
  const cnt = new Uint32Array(n + 1);
  for (let k = 0; k < NLAT * NLON; k++) {
    const id = grid[k];
    if (!id || id > n) continue;
    const lvl = map.level[k];
    const slope = map.slopePerDecade[k];
    if (lvl === 255 || !Number.isFinite(slope)) continue;
    const a = weightOf(k);
    if (a <= 0) continue;
    w[id] += a;
    ws[id] += a * slope;
    cnt[id]++;
    if (lvl === 2 && slope >= 0) up[id] += a;
    else if (lvl === 2) down[id] += a;
    else if (lvl === 1) pos[id] += a;
  }
  const out: (GridMean | null)[] = [];
  for (let id = 1; id <= n; id++)
    out.push(cnt[id] && w[id] > 0 ? { meanSlope: ws[id] / w[id], strongUp: up[id] / w[id], strongDown: down[id] / w[id], possible: pos[id] / w[id], cells: cnt[id] } : null);
  return out;
}

/** The same summary for an explicit list of cells (null = the whole world). */
export function summarizeList(map: TrendMap, cells: ArrayLike<number> | null): GridMean | null {
  let w = 0, ws = 0, up = 0, down = 0, pos = 0, cnt = 0;
  const n = cells ? cells.length : NLAT * NLON;
  for (let q = 0; q < n; q++) {
    const k = cells ? cells[q] : q;
    const lvl = map.level[k];
    const slope = map.slopePerDecade[k];
    if (lvl === 255 || !Number.isFinite(slope)) continue;
    const a = weightOf(k);
    if (a <= 0) continue;
    w += a;
    ws += a * slope;
    cnt++;
    if (lvl === 2 && slope >= 0) up += a;
    else if (lvl === 2) down += a;
    else if (lvl === 1) pos += a;
  }
  return cnt && w > 0 ? { meanSlope: ws / w, strongUp: up / w, strongDown: down / w, possible: pos / w, cells: cnt } : null;
}

/** All cells painted with `id` in a grid (a country or a continent). */
export function cellsOfGrid(grid: Uint16Array, id: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < grid.length; k++) if (grid[k] === id) out.push(k);
  return out;
}
