/**
 * Rankings (docs/FEATURE_PLAN.md §4): "the provinces of Turkey that warm fastest",
 * "the countries of Europe that dry the most". Pure functions; the drawer tab and the
 * card badge are Ranking.tsx.
 *
 * Two sources, the same as everywhere else:
 *  - provinces of a country with monthly series → each province's own Sen slope, with the
 *    card's period and season, so the rank always matches the card;
 *  - otherwise the world trend map inside the borders (1980–2025, area-weighted).
 * Nothing is dropped for being small (half of Turkey's provinces cover ≤ 2 grid cells);
 * places with no cell centre inside take the nearest cell and are flagged.
 *
 * Written with AI assistance (Claude).
 */
import type { TrendLevel } from "./data.ts";
import type { Lang } from "./i18n.ts";

export type RankMetric = "slope" | "strong";
export type RankDir = "up" | "down";

export interface RankRow {
  id: string;
  /** country of the place (itself for a country) */
  country: string;
  kind: "country" | "province";
  name: Record<Lang, string>;
  /** Sen slope / area-mean slope per decade */
  slope: number;
  level: TrendLevel;
  /** area share with strong evidence of a rise / a fall (trend map only) */
  strongUp: number | null;
  strongDown: number | null;
  /** smaller than one grid cell: the value is the nearest cell's */
  lowRes: boolean;
  source: "series" | "map";
}

/** The value a row is ranked by. Strong shares are only known for map rows. */
export function rankValue(r: RankRow, metric: RankMetric, dir: RankDir): number | null {
  if (metric === "slope") return r.slope;
  const s = dir === "up" ? r.strongUp : r.strongDown;
  return s;
}

/**
 * Rows in rank order: "up" = largest rise first, "down" = largest fall first.
 * Ties keep alphabetical order (stable, language-aware); rows without a value are left out.
 */
export function rankRows(rows: RankRow[], metric: RankMetric, dir: RankDir, lang: Lang): (RankRow & { rank: number })[] {
  const valued = rows
    .map((r) => ({ r, v: rankValue(r, metric, dir) }))
    .filter((x): x is { r: RankRow; v: number } => x.v !== null && Number.isFinite(x.v));
  const sign = metric === "strong" || dir === "up" ? -1 : 1; // strong shares: larger first either way
  valued.sort((a, b) => sign * (a.v - b.v) || a.r.name[lang].localeCompare(b.r.name[lang], lang));
  return valued.map((x, k) => ({ ...x.r, rank: k + 1 }));
}

/**
 * Where one place stands among its peers by slope, in its own direction:
 * a rising place among the largest rises, a falling one among the largest falls.
 */
export function standing(rows: RankRow[], id: string, lang: Lang): { rank: number; of: number; dir: RankDir } | null {
  const self = rows.find((r) => r.id === id);
  if (!self || !Number.isFinite(self.slope) || rows.length < 2) return null;
  const dir: RankDir = self.slope >= 0 ? "up" : "down";
  const order = rankRows(rows, "slope", dir, lang);
  const hit = order.find((r) => r.id === id);
  return hit ? { rank: hit.rank, of: order.length, dir } : null;
}

/** Ordinal for the badge: "12." in Turkish, "12th" in English. */
export function ordinal(n: number, lang: Lang): string {
  if (lang === "tr") return `${n}.`;
  const t = n % 100;
  const s = t >= 11 && t <= 13 ? "th" : n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${s}`;
}
