/**
 * From a monthly series to a result card (PLAN.md §3.5 steps 3–4, §3.6 L3).
 *
 *   monthly values → anomalies vs 1991–2020 monthly normal
 *   → annual mean of the selected months (complete years only)
 *   → Mann-Kendall p + Sen's slope + 95% CI → level (strong / possible / none)
 *
 * Written with AI assistance (Claude).
 */
import type { Series, TrendOptions, TrendResult } from "../../contract/types.ts";
import { mannKendall, preWhitenedMK, senSlope } from "./stats.ts";

export const BASELINE = { start: 1991, end: 2020 } as const;
export const DEFAULT_TEST_YEARS = { start: 1980, end: 2025 };
export const MIN_YEARS = 10;
export const MAX_MISSING_YEAR_FRACTION = 0.2;

function parseYM(ym: string): { year: number; month: number } {
  const [y, m] = ym.split("-").map(Number);
  return { year: y, month: m };
}

/** Year and month (1–12) of index k in the series. */
export function monthAt(series: Series, k: number): { year: number; month: number } {
  const s = parseYM(series.start);
  const total = s.month - 1 + k;
  return { year: s.year + Math.floor(total / 12), month: (total % 12) + 1 };
}

/** "1980-01", "1980-02", ... — x axis labels for the chart. */
export function monthLabels(series: Series): string[] {
  return Array.from(series.values, (_, k) => {
    const { year, month } = monthAt(series, k);
    return `${year}-${String(month).padStart(2, "0")}`;
  });
}

/** Monthly anomalies vs the 1991–2020 normal of each calendar month. NaN stays NaN. */
export function anomalies(series: Series): Float64Array {
  const sum = new Array(13).fill(0);
  const cnt = new Array(13).fill(0);
  series.values.forEach((v, k) => {
    const { year, month } = monthAt(series, k);
    if (year >= BASELINE.start && year <= BASELINE.end && !Number.isNaN(v)) {
      sum[month] += v;
      cnt[month] += 1;
    }
  });
  const out = new Float64Array(series.values.length);
  series.values.forEach((v, k) => {
    const { month } = monthAt(series, k);
    out[k] = cnt[month] ? v - sum[month] / cnt[month] : NaN;
  });
  return out;
}

export function analyzeTrend(series: Series, opts: TrendOptions = {}): TrendResult {
  const startYear = opts.startYear ?? DEFAULT_TEST_YEARS.start;
  const endYear = opts.endYear ?? DEFAULT_TEST_YEARS.end;
  const months = opts.months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const nYears = endYear - startYear + 1;

  const anom = anomalies(series);

  // Annual means: a year counts only if every selected month is present.
  const byYear = new Map<number, number[]>();
  const monthly: number[] = []; // selected months in time order (for pre-whitening)
  // Winter (Dec–Feb) crosses the new year: December counts towards the NEXT year's winter,
  // so "winter 1990" = Dec 1989 + Jan 1990 + Feb 1990 (standard meteorological seasons).
  const wraps = months.includes(12) && months.includes(1) && months.length < 12;
  anom.forEach((v, k) => {
    const { year, month } = monthAt(series, k);
    const sy = wraps && month === 12 ? year + 1 : year;
    if (sy < startYear || sy > endYear || !months.includes(month)) return;
    monthly.push(v);
    const arr = byYear.get(sy) ?? [];
    arr.push(v);
    byYear.set(sy, arr);
  });
  const years: number[] = [];
  const annual: number[] = [];
  for (let y = startYear; y <= endYear; y++) {
    const arr = byYear.get(y);
    if (arr && arr.length === months.length && arr.every((v) => !Number.isNaN(v))) {
      years.push(y);
      annual.push(arr.reduce((a, b) => a + b, 0) / arr.length);
    }
  }

  const base: TrendResult = {
    status: "ok",
    startYear,
    endYear,
    nYears,
    slopePerDecade: NaN,
    ci95: [NaN, NaN],
    pValue: NaN,
    level: "none",
    totalChange: NaN,
    annual: { years, anomalies: annual },
    line: { intercept: NaN, slopePerYear: NaN },
  };

  if (nYears < MIN_YEARS) return { ...base, status: "too_short" };
  if (years.length < nYears * (1 - MAX_MISSING_YEAR_FRACTION))
    return { ...base, status: "insufficient_data" };
  if (annual.every((v) => v === annual[0])) return { ...base, status: "constant" };

  const mk = mannKendall(annual);
  const sen = senSlope(years, annual);
  const slopePerDecade = sen.slope * 10;
  const sign = Math.sign(sen.slope);

  // L3 decision rule.
  // R1: annual MK p < 0.05                                  → "possible"
  // R4: annual p < 0.01 AND pre-whitened monthly p < 0.01 (same direction)
  //     AND trimming 5 years at both ends still p < 0.05 (same direction) → "strong"
  // (R4+ adds ERA5 agreement + no jump flag; those come as precomputed badges, contract 1.x)
  // Both labels also need the autocorrelation-corrected 95% CI to exclude 0
  // (rule added 2026-11-14 for consistency; same in worker/protocol.py).
  const ciExcludesZero = sen.ci95[0] > 0 || sen.ci95[1] < 0;
  let level: TrendResult["level"] = "none";
  if (mk.p < 0.05 && ciExcludesZero) level = "possible";
  if (mk.p < 0.01 && sign !== 0 && ciExcludesZero) {
    const pw = preWhitenedMK(monthly);
    const trimmed = annual.filter((_, k) => years[k] >= startYear + 5 && years[k] <= endYear - 5);
    const tr = trimmed.length >= MIN_YEARS ? mannKendall(trimmed) : null;
    if (
      pw.p < 0.01 &&
      Math.sign(pw.s) === sign &&
      tr !== null &&
      tr.p < 0.05 &&
      Math.sign(tr.s) === sign
    ) {
      level = "strong";
    }
  }

  // Line anchored at startYear for the chart.
  const intercept = sen.intercept + sen.slope * (startYear - years[0]);

  return {
    ...base,
    slopePerDecade,
    ci95: [sen.ci95[0] * 10, sen.ci95[1] * 10],
    pValue: mk.p,
    level,
    totalChange: (slopePerDecade * (nYears - 1)) / 10,
    line: { intercept, slopePerYear: sen.slope },
  };
}

/** Meteorological seasons (months 1–12). Winter crosses the new year. */
export const SEASONS = {
  all: undefined,
  winter: [12, 1, 2],
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
} as const;
export type Season = keyof typeof SEASONS;

export interface Robustness {
  /** windows that could be tested (at least MIN_YEARS long, inside the data) */
  windows: { startYear: number; endYear: number; level: TrendResult["level"]; slopePerDecade: number }[];
  /** how many give the same answer as the chosen period: same level AND same direction */
  same: number;
}

/**
 * Start/end-year sensitivity: the same test with the period moved by `shift` years
 * (later start, earlier end, earlier start, later end — where the data allows).
 * Display only; the level itself already requires a trimmed check for "strong".
 */
export function robustness(
  series: Series,
  opts: TrendOptions,
  ref: TrendResult,
  limits: { start: number; end: number } = DEFAULT_TEST_YEARS,
  shift = 5,
): Robustness {
  const s0 = ref.startYear;
  const e0 = ref.endYear;
  const cands: [number, number][] = [
    [s0 + shift, e0],
    [s0, e0 - shift],
    [s0 - shift, e0],
    [s0, e0 + shift],
  ];
  const windows = cands
    .filter(([a, b]) => a >= limits.start && b <= limits.end && b - a + 1 >= MIN_YEARS)
    .map(([a, b]) => {
      const r = analyzeTrend(series, { ...opts, startYear: a, endYear: b });
      return { startYear: a, endYear: b, level: r.status === "ok" ? r.level : ("none" as const), slopePerDecade: r.slopePerDecade };
    });
  const dir = Math.sign(ref.slopePerDecade);
  const same = windows.filter(
    (w) => w.level === ref.level && (ref.level === "none" || Math.sign(w.slopePerDecade) === dir),
  ).length;
  return { windows, same };
}

/**
 * When did the evidence appear? Runs the test for every end year from start+MIN_YEARS−1
 * to `endYear` and returns the first end year from which the level stays at least
 * "possible" / "strong" until the end (null if never). Used by the animation.
 */
export function emergence(
  series: Series,
  opts: TrendOptions,
  startYear: number,
  endYear: number,
): { possible: number | null; strong: number | null; levels: Map<number, TrendResult["level"]> } {
  const levels = new Map<number, TrendResult["level"]>();
  for (let e = startYear + MIN_YEARS - 1; e <= endYear; e++) {
    const r = analyzeTrend(series, { ...opts, startYear, endYear: e });
    levels.set(e, r.status === "ok" ? r.level : "none");
  }
  const rank = { none: 0, possible: 1, strong: 2 } as const;
  const since = (min: number): number | null => {
    let first: number | null = null;
    for (let e = endYear; e >= startYear + MIN_YEARS - 1; e--) {
      if (rank[levels.get(e) ?? "none"] >= min) first = e;
      else break;
    }
    return first;
  };
  return { possible: since(1), strong: since(2), levels };
}
