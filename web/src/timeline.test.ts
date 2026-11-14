// Written with AI assistance (Claude).
import { describe, expect, it } from "vitest";
import { clampTimeline, frameMs, nextYear, playFrom } from "./timeline.ts";

const t0 = { min: 1980, max: 2025, from: 1980, to: 2025, year: 1980 };

describe("timeline", () => {
  it("steps one year at a time and stops at the end", () => {
    expect(nextYear({ ...t0, year: 1990 })).toBe(1991);
    expect(nextYear({ ...t0, year: 2025 })).toBeNull();
  });
  it("play at the end restarts from the beginning of the range", () => {
    expect(playFrom({ ...t0, from: 2000, year: 2025 })).toBe(2000);
    expect(playFrom({ ...t0, year: 2010 })).toBe(2010);
  });
  it("clamps range and year into the data", () => {
    const c = clampTimeline({ ...t0, from: 1970, to: 2030, year: 1960 });
    expect([c.from, c.to, c.year]).toEqual([1980, 2025, 1980]);
    const d = clampTimeline({ ...t0, from: 2010, to: 2005, year: 2020 });
    expect(d.to).toBe(2011);
    expect(d.year).toBe(2011);
  });
  it("speed sets the frame time", () => {
    expect(frameMs(1)).toBeCloseTo(333.3, 0);
    expect(frameMs(4)).toBeCloseTo(83.3, 0);
  });
});
