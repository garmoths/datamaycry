/**
 * Pure playback logic for the "time travel" animation (no React, easy to test).
 * Written with AI assistance (Claude).
 */
export interface Timeline {
  /** first and last year that exist in the data */
  min: number;
  max: number;
  /** chosen range */
  from: number;
  to: number;
  year: number;
}

export const SPEEDS = [1, 2, 4] as const;
/** years per second at speed 1× */
export const BASE_RATE = 3;

/** Keep the range inside the data, at least 2 years long, and the year inside the range. */
export function clampTimeline(t: Timeline): Timeline {
  const from = Math.max(t.min, Math.min(t.from, t.max - 1));
  const to = Math.min(t.max, Math.max(t.to, from + 1));
  const year = Math.max(from, Math.min(t.year, to));
  return { ...t, from, to, year };
}

/** The year after `year`, or null at the end of the range (playback stops there). */
export function nextYear(t: Timeline): number | null {
  return t.year >= t.to ? null : t.year + 1;
}

/** Pressing play at the end of the range starts again from the beginning. */
export function playFrom(t: Timeline): number {
  return t.year >= t.to ? t.from : t.year;
}

/** Milliseconds per frame for a speed multiplier. */
export function frameMs(speed: number): number {
  return 1000 / (BASE_RATE * speed);
}
