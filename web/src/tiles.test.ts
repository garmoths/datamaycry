// Written with AI assistance (Claude).
import { describe, expect, it } from "vitest";
import { tilesInView } from "./tiles.ts";

describe("tiles in view", () => {
  it("the whole world at zoom 1 is the four tiles", () => {
    const t = tilesInView({ west: -180, south: -85, east: 180, north: 85 }, 1.6);
    expect(t.map((x) => `${x.z}/${x.x}/${x.y}`).sort()).toEqual(["1/0/0", "1/0/1", "1/1/0", "1/1/1"]);
  });
  it("uses the integer zoom and never goes above maxZoom", () => {
    const v = { west: 30, south: 30, east: 40, north: 40 };
    expect(tilesInView(v, 2.9)[0].z).toBe(2);
    expect(tilesInView(v, 9, 3)[0].z).toBe(3);
  });
  it("Türkiye at zoom 4 gives the right tiles", () => {
    const t = tilesInView({ west: 26, south: 36, east: 45, north: 42 }, 4);
    expect(t).toContainEqual({ z: 4, x: 9, y: 5 }); // Ankara
    expect(t.every((x) => x.x >= 9 && x.x <= 9 + 1 && x.y >= 5 && x.y <= 6)).toBe(true);
  });
  it("tile numbers stay inside the grid and the list is capped", () => {
    const t = tilesInView({ west: -400, south: -90, east: 400, north: 90 }, 6, 6, 32);
    expect(t.length).toBe(32);
    expect(t.every((x) => x.x >= 0 && x.x < 64 && x.y >= 0 && x.y < 64)).toBe(true);
  });
});
