/**
 * When "strong evidence" is lowered to "possible" (shared by the site and the public API):
 *  - the variable is experimental (VariableInfo.experimental), or
 *  - an independent source disagrees for this region over at least 80 % of its years (contract 1.3).
 * Written with AI assistance (Claude).
 */
import type { Badge, TrendResult } from "../../contract/types.ts";

/** Share of the badge's years that the analysed period covers. */
export function coverage(b: Badge, start: number, end: number): number {
  const lo = Math.max(b.years.start, start);
  const hi = Math.min(b.years.end, end);
  return Math.max(0, hi - lo + 1) / (b.years.end - b.years.start + 1);
}

export function applyCaps(r: TrendResult, experimental: boolean, badges: Badge[]): TrendResult {
  if (badges.length) r = { ...r, badges };
  if (r.level !== "strong") return r;
  if (experimental) return { ...r, level: "possible", capped: true, cappedReason: "experimental" };
  if (badges.some((b) => b.status === "disagree" && coverage(b, r.startYear, r.endYear) >= 0.8)) {
    return { ...r, level: "possible", capped: true, cappedReason: "badge_disagree" };
  }
  return r;
}
