/**
 * Pure logic of the period scale (PeriodScale.tsx): which year is under the pointer, which
 * edge a press grabs, and how a drag moves the range. A period needs at least 10 years
 * (same rule as the cards). Tested in periodRange.test.ts.
 * Written with AI assistance (Claude).
 */
/** a trend needs at least 10 years: last − first ≥ 9 */
export const MIN_SPAN = 9;

export type Range = [number, number];
export type Edge = "start" | "end";

/** The year whose stripe is under x (0 … width): one stripe per year, min … max. */
export function yearAt(x: number, width: number, min: number, max: number): number {
  const n = max - min + 1;
  const k = Math.floor((x / Math.max(1, width)) * n);
  return Math.max(min, Math.min(max, min + k));
}

/** Left edge and width of the selected stripes, as fractions of the strip. */
export function rangeBox([a, b]: Range, min: number, max: number): { left: number; width: number } {
  const n = max - min + 1;
  return { left: (a - min) / n, width: (b - a + 1) / n };
}

/** A press grabs the nearer edge; inside the range it grabs the edge on that side of the middle. */
export function pickEdge(year: number, [a, b]: Range): Edge {
  if (year <= a) return "start";
  if (year >= b) return "end";
  return year - a <= b - year ? "start" : "end";
}

/** Move one edge to `year`; pushing into the other edge moves both, keeping MIN_SPAN. */
export function dragRange([a, b]: Range, edge: Edge, year: number, min: number, max: number): Range {
  if (edge === "start") {
    const s = Math.max(min, Math.min(year, max - MIN_SPAN));
    return [s, Math.max(b, s + MIN_SPAN)];
  }
  const e = Math.min(max, Math.max(year, min + MIN_SPAN));
  return [Math.min(a, e - MIN_SPAN), e];
}
