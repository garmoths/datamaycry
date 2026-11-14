/** Climate fingerprint and area summaries (docs/FEATURE_PLAN.md §1–§2). Written with AI assistance (Claude). */
import { describe, expect, it } from "vitest";
import { summarizeByGrid, summarizeList } from "./areaStats.ts";
import { summarize } from "./continentStats.ts";
import { interpret, levelOfArea, mostSimilar, relative, similarity, type Candidate, type FingerprintRow, type Vector } from "./fingerprint.ts";
import { scaleOf } from "./trendStack.ts";
import type { TrendMap, VarId } from "./data.ts";

const N = 361 * 576;
function fakeMap(): TrendMap {
  return {
    var: "T2M",
    grid: { nlat: 361, nlon: 576, lat0: -90, lon0: -180, dlat: 0.5, dlon: 0.625 },
    years: { start: 1980, end: 2025 },
    slopePerDecade: new Float32Array(N).fill(NaN),
    pValue: new Float32Array(N).fill(NaN),
    level: new Uint8Array(N).fill(255),
    fdr: new Uint8Array(N),
  };
}

describe("area summaries for many places at once", () => {
  it("give exactly what summarize gives, place by place", () => {
    const map = fakeMap();
    const grid = new Uint16Array(N);
    let seed = 3;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < N; k += 7) {
      grid[k] = 1 + Math.floor(rnd() * 5);
      map.slopePerDecade[k] = rnd() * 2 - 1;
      map.level[k] = Math.floor(rnd() * 3);
    }
    const all = summarizeByGrid(map, grid, 5);
    for (let id = 1; id <= 5; id++) {
      const one = summarize(map, grid, id)!;
      const got = all[id - 1]!;
      expect(got.cells).toBe(one.cells);
      expect(got.meanSlope).toBeCloseTo(one.meanSlope, 10);
      expect(got.strongUp).toBeCloseTo(one.strongUp, 10);
      expect(got.strongDown).toBeCloseTo(one.strongDown, 10);
      expect(got.possible).toBeCloseTo(one.possible, 10);
    }
    expect(summarizeList(map, null)!.cells).toBe(summarize(map, null)!.cells);
  });

  it("finds a typical large change per variable (95th percentile of |slope|)", () => {
    const map = fakeMap();
    for (let k = 0; k < N; k++) {
      map.slopePerDecade[k] = (k % 100) / 100; // 0 … 0.99
      map.level[k] = 0;
    }
    expect(scaleOf(map)).toBeCloseTo(0.95, 1);
  });
});

describe("fingerprint rows", () => {
  it("bar length is slope ÷ scale, clipped, and empty without data", () => {
    expect(relative(0.5, 1)).toBe(0.5);
    expect(relative(-9, 1)).toBe(-1.5);
    expect(relative(null, 1)).toBeNull();
    expect(relative(0.5, 0)).toBeNull();
  });

  it("an area is 'strong' only when half of it has strong evidence in the mean direction", () => {
    expect(levelOfArea({ meanSlope: 0.3, strongUp: 0.6, strongDown: 0, possible: 0.1, cells: 9 })).toBe("strong");
    expect(levelOfArea({ meanSlope: -0.3, strongUp: 0.6, strongDown: 0.1, possible: 0.1, cells: 9 })).toBe("none");
    expect(levelOfArea({ meanSlope: 0.3, strongUp: 0.3, strongDown: 0, possible: 0.25, cells: 9 })).toBe("possible");
  });
});

const row = (v: VarId, slope: number | null, level: FingerprintRow["level"]): FingerprintRow => ({ var: v, slope, level, relative: slope, source: "map" });

describe("what the variables show together", () => {
  it("fires a sentence only when every variable it names has evidence in that direction", () => {
    const ids = (rows: FingerprintRow[]) => interpret(rows).map((x) => x.id);
    expect(ids([row("T2M", 0.4, "strong"), row("GWETROOT", -0.2, "possible")])).toContain("warm-dry");
    expect(ids([row("T2M", 0.4, "strong"), row("GWETROOT", -0.2, "none")])).not.toContain("warm-dry");
    expect(ids([row("T2M", 0.4, "strong"), row("GWETROOT", null, "none")])).not.toContain("warm-dry");
    // clear but tiny (a few mm of snow where there is hardly any) is not named
    expect(ids([row("T2M", 0.4, "strong"), row("SNOMAS", -0.05, "possible")])).not.toContain("warm-snow");
    // "no clear change in rainfall" needs rainfall data with no evidence
    expect(ids([row("GWETROOT", -0.2, "strong"), row("PRECTOT", 0.01, "none")])).toContain("dry-steady-rain");
  });

  it("shows at most two sentences, and the quiet one only when nothing changes", () => {
    const busy = interpret([row("T2M", 0.4, "strong"), row("GWETROOT", -0.2, "strong"), row("SNOMAS", -1, "strong"), row("QV2M", 0.1, "strong")]);
    expect(busy.length).toBe(2);
    expect(interpret([row("T2M", 0.01, "none"), row("PRECTOT", 0, "none")]).map((x) => x.id)).toEqual(["quiet"]);
    expect(interpret([row("T2M", 0.4, "strong")])).toEqual([]);
  });
});

describe("similar places", () => {
  const v = (xs: (number | null)[]): Vector => {
    const ids: VarId[] = ["T2M", "QV2M", "SPEED", "PRECTOT", "EVAP", "GWETROOT", "RUNOFF", "SNOMAS", "TOTEXTTAU"];
    return Object.fromEntries(ids.map((id, k) => [id, xs[k] ?? null])) as Vector;
  };

  it("is symmetric, 1 for the same direction, and needs 5 shared variables", () => {
    const a = v([1, 0.5, 0.2, -0.3, 0.4]);
    const b = v([0.8, 0.6, 0.1, -0.2, 0.5]);
    expect(similarity(a, b)).toBeCloseTo(similarity(b, a)!, 12);
    expect(similarity(a, a)).toBeCloseTo(1, 12);
    expect(similarity(v([1, 0.5, 0.2, -0.3]), v([1, 0.5, 0.2, -0.3]))).toBeNull();
  });

  it("ignores places where nothing changes (the direction would be noise)", () => {
    expect(similarity(v([0.05, 0.02, 0.01, 0.03, 0.02]), v([1, 0.5, 0.2, 0.3, 0.4]))).toBeNull();
  });

  it("lists the closest places first and never the place itself", () => {
    const self = v([1, 0.5, 0.2, -0.3, 0.4]);
    const pool: Candidate[] = [
      { kind: "country", id: "SELF", country: "SELF", name: { en: "", tr: "" }, vector: self },
      { kind: "country", id: "NEAR", country: "NEAR", name: { en: "", tr: "" }, vector: v([0.9, 0.5, 0.2, -0.3, 0.4]) },
      { kind: "country", id: "FAR", country: "FAR", name: { en: "", tr: "" }, vector: v([-1, -0.5, -0.2, 0.3, -0.4]) },
      { kind: "country", id: "MID", country: "MID", name: { en: "", tr: "" }, vector: v([1, -0.5, 0.2, 0.3, 0.4]) },
    ];
    const out = mostSimilar(self, "SELF", pool);
    expect(out.map((x) => x.id)).toEqual(["NEAR", "MID"]);
  });
});
