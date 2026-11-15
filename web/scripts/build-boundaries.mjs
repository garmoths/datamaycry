/**
 * Trims Natural Earth (public domain) country boundaries for the globe.
 *
 *   node scripts/build-boundaries.mjs <ne_50m_admin_0.geojson>
 *
 * Output → public/boundaries/countries.geojson
 *  (all countries, minimal properties: id, names, continent; coordinates rounded to 2 decimals)
 *
 * Provinces are NOT built here any more: worker/boundaries.py writes
 * public/boundaries/admin1/{COUNTRY}.geojson for all 4,596 provinces, with the same
 * id rule as the data (ISO 3166-2 when valid and unique, else adm1_code).
 *
 * Written with AI assistance (Claude).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const [countriesPath] = process.argv.slice(2);
if (!countriesPath) {
  console.error("usage: node scripts/build-boundaries.mjs <countries_50m.geojson>");
  process.exit(1);
}

const out = new URL("../public/boundaries/", import.meta.url);
mkdirSync(out, { recursive: true });

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

console.log(`countries: ${countries.features.length}`);
