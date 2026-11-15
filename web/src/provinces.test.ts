/**
 * Every country, one by one: its province file exists, every province can be drawn,
 * gets a dot that sits inside its own borders, and maps to at least one grid cell.
 * Written with AI assistance (Claude).
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { cellsInside } from "./continentStats.ts";
import { bboxOf, labelPoint, mainBbox, parseAdmin1, pointInFeature, type CountryProps } from "./geo.ts";
import { readLink, writeLink } from "./share.ts";

const DIR = fileURLToPath(new URL("../public/boundaries/", import.meta.url));
const read = <P,>(file: string) => JSON.parse(readFileSync(DIR + file, "utf8")) as FeatureCollection<Polygon | MultiPolygon, P>;
const countries = read<CountryProps>("countries.geojson").features;
const files = new Set(readdirSync(DIR + "admin1").map((f) => f.replace(".geojson", "")));
// read the way the app does (geo.ts parseAdmin1), so a file the browser cannot parse fails here too
const provinces = (id: string) => parseAdmin1(readFileSync(`${DIR}admin1/${id}.geojson`, "utf8")).features;

function nearVertex(f: Feature<Polygon | MultiPolygon>, dot: { lon: number; lat: number }): boolean {
  const walk = (c: unknown): boolean =>
    typeof (c as number[])[0] === "number"
      ? Math.abs((c as number[])[0] - dot.lon) <= 0.011 && Math.abs((c as number[])[1] - dot.lat) <= 0.011
      : (c as unknown[]).some(walk);
  return walk(f.geometry.coordinates);
}

describe("province boundaries, all countries", () => {
  it("every country has a province file with at least one province", () => {
    const missing = countries.map((c) => c.properties.id).filter((id) => !files.has(id) || provinces(id).length === 0);
    expect(missing).toEqual([]);
  });

  it("every province has a name, a unique id and a dot inside its own borders", () => {
    const seen = new Set<string>();
    const bad: string[] = [];
    let total = 0;
    for (const id of files)
      for (const f of provinces(id)) {
        total++;
        const p = f.properties;
        if (!p.name_en || !p.name_tr || p.country !== id || seen.has(p.id)) bad.push(`${p.id}: properties`);
        seen.add(p.id);
        const dot = labelPoint(f);
        // 20 micro-provinces (Malta's councils, Maldives atolls, the Vatican) are smaller than the
        // files' 0.01° rounding and have no inside at all: there the dot must sit on the shape itself
        const onShape = () => JSON.stringify(f.geometry.coordinates).includes(`[${dot.lon},${dot.lat}]`) || nearVertex(f, dot);
        if (!pointInFeature(dot.lon, dot.lat, f) && !onShape()) bad.push(`${p.id}: dot outside`);
      }
    expect(bad).toEqual([]);
    expect(total).toBeGreaterThan(4000);
  });

  it("every province maps to at least one grid cell", () => {
    const empty: string[] = [];
    for (const id of ["RUS", "USA", "TUR", "FJI", "MCO", "KIR", "CHL"])
      for (const f of provinces(id)) if (cellsInside(f, labelPoint(f)).length === 0) empty.push(f.properties.id);
    expect(empty).toEqual([]);
  });

  it("province ids survive the share link, odd ones included", () => {
    for (const a of ["TR-21", "RU-AD", "ASM-5001", "BVT+00?"]) {
      expect(readLink(writeLink({ c: "RUS", a })).a).toBe(a);
    }
  });
});

describe("camera boxes", () => {
  const country = (id: string) => countries.find((c) => c.properties.id === id) as Feature<Polygon | MultiPolygon>;
  it("frames Russia and Fiji around the antimeridian instead of the whole world", () => {
    for (const id of ["RUS", "FJI"]) {
      const [w, , e] = bboxOf([country(id)]);
      expect(e - w).toBeLessThan(200);
    }
  });
  it("leaves far-away small parts out of the country view", () => {
    const [w, s, e, n] = mainBbox(country("FRA"));
    expect([w > -10, e < 12, s > 40, n < 52]).toEqual([true, true, true, true]);
  });
});
