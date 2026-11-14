/** Rankings (docs/FEATURE_PLAN.md §4). Written with AI assistance (Claude). */
import { describe, expect, it } from "vitest";
import { ordinal, rankRows, standing, type RankRow } from "./ranking.ts";

const row = (id: string, slope: number, up: number | null = null, down: number | null = null): RankRow => ({
  id,
  country: "X",
  kind: "province",
  name: { en: id, tr: id },
  slope,
  level: "none",
  strongUp: up,
  strongDown: down,
  lowRes: false,
  source: up === null ? "series" : "map",
});

describe("rank order", () => {
  const rows = [row("a", 0.2, 0.1, 0), row("b", -0.4, 0, 0.6), row("c", 0.5, 0.7, 0), row("d", 0.2, 0.3, 0)];

  it("puts the largest rise first, or the largest fall first", () => {
    expect(rankRows(rows, "slope", "up", "en").map((r) => r.id)).toEqual(["c", "a", "d", "b"]);
    expect(rankRows(rows, "slope", "down", "en").map((r) => r.id)).toEqual(["b", "a", "d", "c"]);
  });

  it("keeps ties in alphabetical order and numbers the ranks", () => {
    const r = rankRows(rows, "slope", "up", "en");
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4]);
    expect(r[1].id < r[2].id).toBe(true);
  });

  it("ranks by the share of area with strong evidence, and leaves out rows without one", () => {
    expect(rankRows(rows, "strong", "up", "en").map((r) => r.id)).toEqual(["c", "d", "a", "b"]);
    expect(rankRows(rows, "strong", "down", "en")[0].id).toBe("b");
    expect(rankRows([row("s", 0.3), ...rows], "strong", "up", "en").some((r) => r.id === "s")).toBe(false);
  });
});

describe("standing of one place", () => {
  const rows = [row("a", 0.2), row("b", -0.4), row("c", 0.5), row("e", -0.1)];
  it("counts a rising place among rises and a falling one among falls", () => {
    expect(standing(rows, "a", "en")).toEqual({ rank: 2, of: 4, dir: "up" });
    expect(standing(rows, "b", "en")).toEqual({ rank: 1, of: 4, dir: "down" });
    expect(standing(rows, "zz", "en")).toBeNull();
  });
});

describe("ordinals", () => {
  it("read naturally", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map((n) => ordinal(n, "en"))).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
    expect(ordinal(12, "tr")).toBe("12.");
  });
});
