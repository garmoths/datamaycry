/**
 * Trims Natural Earth (public domain) boundaries for the globe.
 *
 *   node scripts/build-boundaries.mjs <ne_10m_admin_1.geojson> <ne_50m_admin_0.geojson>
 *
 * Output → public/data/boundaries/{countries,admin1}.geojson
 *  - countries: all countries, minimal properties (id, names, continent)
 *  - admin1: only countries listed in public/data/regions/index.json
 *    (so the mock stays small; the real worker will ship boundaries.pmtiles)
 * Coordinates are rounded to 2 decimals (~1 km).
 *
 * Written with AI assistance (Claude).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const [admin1Path, countriesPath] = process.argv.slice(2);
if (!admin1Path || !countriesPath) {
  console.error("usage: node scripts/build-boundaries.mjs <admin1_10m.geojson> <countries_50m.geojson>");
  process.exit(1);
}

const out = new URL("../public/data/boundaries/", import.meta.url);
mkdirSync(out, { recursive: true });

const index = JSON.parse(readFileSync(new URL("../public/data/regions/index.json", import.meta.url), "utf8"));
const wanted = new Set(index.countries.map((c) => c.id));

const round = (c) => (typeof c[0] === "number" ? [+c[0].toFixed(2), +c[1].toFixed(2)] : c.map(round));
const geom = (g) => ({ type: g.type, coordinates: round(g.coordinates) });

const countries = JSON.parse(readFileSync(countriesPath, "utf8"));
writeFileSync(
  new URL("countries.geojson", out),
  JSON.stringify({
    type: "FeatureCollection",
    features: countries.features.map((f) => ({
      type: "Feature",
      properties: {
        id: f.properties.ADM0_A3,
        name_en: f.properties.NAME_EN ?? f.properties.NAME,
        name_tr: f.properties.NAME_TR ?? f.properties.NAME,
        continent: f.properties.CONTINENT,
      },
      geometry: geom(f.geometry),
    })),
  }),
);

const admin1 = JSON.parse(readFileSync(admin1Path, "utf8"));
const kept = admin1.features.filter((f) => wanted.has(f.properties.adm0_a3));
writeFileSync(
  new URL("admin1.geojson", out),
  JSON.stringify({
    type: "FeatureCollection",
    features: kept.map((f) => ({
      type: "Feature",
      properties: {
        id: f.properties.iso_3166_2,
        country: f.properties.adm0_a3,
        name_en: f.properties.name_en ?? f.properties.name,
        name_tr: f.properties.name_tr ?? f.properties.name,
      },
      geometry: geom(f.geometry),
    })),
  }),
);
console.log(`countries: ${countries.features.length}, admin1 kept: ${kept.length}`);
