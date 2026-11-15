/**
 * The fast scanline cell lookup gives exactly the cells of the point-by-point test, for
 * every province of every country (including holes, islands and the antimeridian).
 * Written with AI assistance (Claude).
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { cellsInside, scanCells } from "./continentStats.ts";
import { parseAdmin1, pointInFeature, polygonsOf } from "./geo.ts";

const DIR = fileURLToPath(new URL("../public/boundaries/admin1/", import.meta.url));
const NLAT = 361, NLON = 576;

/** the old version: test every cell centre inside each polygon's bounding box */
function bruteCells(f: Feature<Polygon | MultiPolygon>): number[] {
  const out = new Set<number>();
  for (const poly of polygonsOf(f)) {
    let w = 180, e = -180, s = 90, n = -90;
    for (const [x, y] of poly[0]) {
      w = Math.min(w, x);
      e = Math.max(e, x);
      s = Math.min(s, y);
      n = Math.max(n, y);
    }
    const one = { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: poly } };
    for (let i = Math.max(0, Math.ceil((s + 90) / 0.5)); i <= Math.min(NLAT - 1, Math.floor((n + 90) / 0.5)); i++)
      for (let j = Math.max(0, Math.ceil((w + 180) / 0.625)); j <= Math.min(NLON - 1, Math.floor((e + 180) / 0.625)); j++)
        if (pointInFeature(-180 + j * 0.625, -90 + i * 0.5, one)) out.add(i * NLON + j);
  }
  return [...out].sort((a, b) => a - b);
}

describe("cells inside a province", () => {
  const ids = readdirSync(DIR).map((f) => f.replace(".geojson", ""));
  it("scanline = point by point, every province of every country", () => {
    let provinces = 0, cells = 0;
    const wrong: string[] = [];
    for (const id of ids) {
      for (const f of parseAdmin1(readFileSync(`${DIR}${id}.geojson`, "utf8")).features) {
        const fast = scanCells(f).sort((a, b) => a - b);
        const slow = bruteCells(f);
        provinces++;
        cells += slow.length;
        if (fast.length !== slow.length || fast.some((v, k) => v !== slow[k])) wrong.push(`${f.properties.id} ${fast.length}/${slow.length}`);
      }
    }
    expect(wrong).toEqual([]);
    expect(provinces).toBeGreaterThan(4000);
    expect(cells).toBeGreaterThan(50000); // ~69 000 land cells in provinces
  }, 120_000);

  it("is worked out once per province (cached) and the fallback cell still works", () => {
    const f = parseAdmin1(readFileSync(`${DIR}TUR.geojson`, "utf8")).features[0];
    expect(cellsInside(f)).toBe(cellsInside(f));
    const tiny = { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [[[29.01, 41.01], [29.02, 41.01], [29.02, 41.02], [29.01, 41.01]]] } };
    expect(cellsInside(tiny)).toEqual([]);
    expect(cellsInside(tiny, { lon: 29, lat: 41 })).toEqual([Math.round((41 + 90) / 0.5) * NLON + Math.round((29 + 180) / 0.625)]);
  });
});
