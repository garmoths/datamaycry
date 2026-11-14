/**
 * Change month by month (docs/FEATURE_PLAN.md §5): the same trend test as the card, run on
 * each calendar month on its own ("has July warmed?"). Pure functions; the card is
 * MonthStrip.tsx.
 *
 * Twelve tests at once would turn up a "significant" month by chance far too often, so the
 * labels are corrected with Benjamini–Hochberg (q = 0.05) across the twelve — the same
 * correction the world map uses for its cells (PLAN.md §3.5 step 5).
 *
 * Written with AI assistance (Claude).
 */
import { analyzeTrend, type Series, type TrendLevel, type TrendOptions } from "./data.ts";

export interface MonthTrend {
  month: number; // 1–12
  /** per decade, display units; NaN when the month could not be tested */
  slope: number;
  p: number;
  /** after the 12-test correction; "constant" = the value never changes (e.g. no summer snow) */
  level: TrendLevel | "constant" | "untested";
}

/**
 * Benjamini–Hochberg: which of the p-values are discoveries at false-discovery rate q.
 * NaN p-values never are.
 */
export function benjaminiHochberg(p: number[], q = 0.05): boolean[] {
  const idx = p.map((v, k) => [v, k] as const).filter(([v]) => Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
  const m = idx.length;
  let cut = -1;
  idx.forEach(([v], r) => {
    if (v <= ((r + 1) / m) * q) cut = r;
  });
  const out = p.map(() => false);
  for (let r = 0; r <= cut; r++) out[idx[r][1]] = true;
  return out;
}

/** Each calendar month's trend over the card's period (the card's season choice is ignored). */
export function monthlyTrends(series: Series, opts: Pick<TrendOptions, "startYear" | "endYear">): MonthTrend[] {
  const raw = Array.from({ length: 12 }, (_, k) => {
    const r = analyzeTrend(series, { startYear: opts.startYear, endYear: opts.endYear, months: [k + 1] });
    return { month: k + 1, r };
  });
  const pass = benjaminiHochberg(raw.map(({ r }) => (r.status === "ok" ? r.pValue : NaN)));
  return raw.map(({ month, r }, k) => {
    if (r.status === "constant") return { month, slope: 0, p: NaN, level: "constant" };
    if (r.status !== "ok") return { month, slope: NaN, p: NaN, level: "untested" };
    // the month keeps its own label only if it survives the 12-test correction
    return { month, slope: r.slopePerDecade, p: r.pValue, level: pass[k] ? r.level : "none" };
  });
}

export const MONTHS: Record<"tr" | "en", string[]> = {
  tr: ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/**
 * A short summary: the months with the clearest rise / fall (up to three, largest first),
 * and how many months show no clear change.
 */
export function summarizeMonths(m: MonthTrend[]): { up: number[]; down: number[]; quiet: number } {
  const clear = m.filter((x) => x.level === "possible" || x.level === "strong");
  const pick = (sign: 1 | -1) =>
    clear
      .filter((x) => Math.sign(x.slope) === sign)
      .sort((a, b) => Math.abs(b.slope) - Math.abs(a.slope))
      .slice(0, 3)
      .map((x) => x.month);
  return { up: pick(1), down: pick(-1), quiet: m.filter((x) => x.level === "none").length };
}
