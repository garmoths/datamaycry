// Written with AI assistance (Claude).
import { describe, expect, it } from "vitest";
import { EMPTY_STATE, endFade, finishLoad, startLoad, visibility } from "./trendLayers.ts";

const L = ["trendA", "trendB"] as const;
const drawn = (v: Record<string, string>) => Object.keys(v).filter((k) => v[k] === "visible");

describe("trend layers: only the layers that are needed draw (and load tiles)", () => {
  it("first map: one layer loads, the other stays hidden", () => {
    const { state, back } = startLoad(L, EMPTY_STATE);
    expect(back).toBe("trendA");
    expect(drawn(visibility(L, state, true))).toEqual(["trendA"]);
  });

  it("at rest (zooming, panning) exactly one layer draws", () => {
    let s = startLoad(L, EMPTY_STATE).state;
    s = endFade(finishLoad(s));
    expect(s.front).toBe("trendA");
    expect(drawn(visibility(L, s, true))).toEqual(["trendA"]);
  });

  it("switching variable: the new map loads in the other layer, the old stays until it has faded", () => {
    let s = endFade(finishLoad(startLoad(L, EMPTY_STATE).state));
    const next = startLoad(L, s);
    expect(next.back).toBe("trendB");
    s = next.state;
    expect(drawn(visibility(L, s, true)).sort()).toEqual(["trendA", "trendB"]);
    s = finishLoad(s);
    expect(s).toEqual({ front: "trendB", loading: null, fading: "trendA" });
    expect(drawn(visibility(L, s, true)).sort()).toEqual(["trendA", "trendB"]);
    s = endFade(s);
    expect(drawn(visibility(L, s, true))).toEqual(["trendB"]);
  });

  it("a fast second switch reuses the fading layer and stops its fade", () => {
    let s = finishLoad(startLoad(L, endFade(finishLoad(startLoad(L, EMPTY_STATE).state))).state); // front B, fading A
    const again = startLoad(L, s);
    expect(again.back).toBe("trendA");
    expect(again.state.fading).toBeNull();
    s = again.state;
    expect(drawn(visibility(L, s, true)).sort()).toEqual(["trendA", "trendB"]);
  });

  it("trend map off (checkbox or time travel): nothing draws", () => {
    const s = endFade(finishLoad(startLoad(L, EMPTY_STATE).state));
    expect(drawn(visibility(L, s, false))).toEqual([]);
  });

  it("finishing without a pending load changes nothing", () => {
    const s = endFade(finishLoad(startLoad(L, EMPTY_STATE).state));
    expect(finishLoad(s)).toBe(s);
  });
});
