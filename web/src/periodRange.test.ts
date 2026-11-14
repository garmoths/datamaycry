// Written with AI assistance (Claude).
import { describe, expect, it } from "vitest";
import { dragRange, MIN_SPAN, pickEdge, rangeBox, yearAt } from "./periodRange.ts";

const MIN = 1980, MAX = 2025; // 46 stripes

describe("period scale", () => {
  it("finds the year under the pointer, one stripe per year", () => {
    expect(yearAt(0, 460, MIN, MAX)).toBe(1980);
    expect(yearAt(9.9, 460, MIN, MAX)).toBe(1980);
    expect(yearAt(10, 460, MIN, MAX)).toBe(1981);
    expect(yearAt(459, 460, MIN, MAX)).toBe(2025);
    expect(yearAt(-30, 460, MIN, MAX)).toBe(1980); // dragged past the ends
    expect(yearAt(999, 460, MIN, MAX)).toBe(2025);
  });

  it("the selected box covers whole stripes", () => {
    expect(rangeBox([1980, 2025], MIN, MAX)).toEqual({ left: 0, width: 1 });
    const b = rangeBox([1990, 1999], MIN, MAX);
    expect(b.left).toBeCloseTo(10 / 46);
    expect(b.width).toBeCloseTo(10 / 46);
  });

  it("a press grabs the nearer edge", () => {
    expect(pickEdge(1975, [1990, 2010])).toBe("start");
    expect(pickEdge(2020, [1990, 2010])).toBe("end");
    expect(pickEdge(1995, [1990, 2010])).toBe("start");
    expect(pickEdge(2005, [1990, 2010])).toBe("end");
  });

  it("dragging an edge keeps at least 10 years, pushing the other edge along", () => {
    expect(dragRange([1980, 2025], "start", 1995, MIN, MAX)).toEqual([1995, 2025]);
    expect(dragRange([1990, 2005], "start", 2000, MIN, MAX)).toEqual([2000, 2009]);
    expect(dragRange([1990, 2005], "end", 1992, MIN, MAX)).toEqual([1983, 1992]);
    const [a, b] = dragRange([1980, 2025], "start", 2025, MIN, MAX);
    expect(b - a).toBe(MIN_SPAN);
    expect(b).toBe(2025);
  });

  it("never leaves the data years", () => {
    expect(dragRange([1990, 2000], "start", 1950, MIN, MAX)).toEqual([1980, 2000]);
    expect(dragRange([1990, 2000], "end", 2100, MIN, MAX)).toEqual([1990, 2025]);
    expect(dragRange([1990, 2000], "end", 1960, MIN, MAX)).toEqual([1980, 1989]);
  });
});
