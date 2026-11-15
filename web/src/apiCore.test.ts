/**
 * The public API on the mock data package: same answers as the site's analysis, clear errors.
 * Written with AI assistance (Claude).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createApi, fold, handle, readQuery, type FileSource } from "./apiCore.ts";
import { analyzeTrend } from "./trend.ts";

const DIR = fileURLToPath(new URL("../public/data/", import.meta.url));
const files: FileSource = {
  text: async (p) => readFileSync(DIR + p, "utf8"),
  bin: async (p) => {
    const b = readFileSync(DIR + p);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  },
};
const api = createApi(files);

describe("public API", () => {
  it("lists the nine variables with units", async () => {
    const v = await api.variables();
    expect(v.variables.map((x) => x.id)).toContain("T2M");
    expect(v.variables.length).toBe(9);
    expect(v.test_years.start).toBe(1980);
  });

  it("finds places with Turkish-aware search", async () => {
    expect(fold("Diyarbakır")).toBe("diyarbakir");
    const r = await api.places("diyarbakir");
    expect(r.places[0]).toMatchObject({ id: "TR-21", kind: "province", country: "TUR" });
    const tur = await api.places("Türkiye");
    expect(tur.places[0].id).toBe("TUR");
  });

  it("trend = the site's analysis, with total = per decade × decades", async () => {
    const t = await api.trend({ place: "TR-21", var: "T2M", from: 1980, to: 2025 });
    expect(t.status).toBe("ok");
    const s = await api.series({ place: "TR-21", var: "T2M" });
    const values = Float64Array.from(s.months, (m) => m.value ?? NaN);
    const r = analyzeTrend({ var: "T2M", unit: "°C", start: s.start, values, label: { en: "", tr: "" } }, { startYear: 1980, endYear: 2025 });
    expect(t.p_value).toBeCloseTo(r.pValue, 5);
    if (t.evidence !== "none") {
      expect(t.change_per_decade).toBeCloseTo(r.slopePerDecade, 3);
      expect(t.change_total!).toBeCloseTo((t.change_per_decade! * (t.years_used! - 1)) / 10, 3);
      expect(t.text?.tr).toContain("1980–2025");
    }
    expect(t.annual.length).toBe(46);
  });

  it("no clear change → no direction and no numbers", async () => {
    // a short, noisy window on the mock series
    for (const v of ["SPEED", "QV2M", "EVAP", "PRECTOT"]) {
      const t = await api.trend({ place: "TR-21", var: v, from: 2000, to: 2009 });
      if (t.evidence === "none") {
        expect(t.change_per_decade).toBeNull();
        expect(t.change_total).toBeNull();
        expect(t.meaning).toBeNull();
        return;
      }
    }
  });

  it("works for a grid cell by coordinates and for a continent", async () => {
    const cell = await api.trend({ lat: 37.9, lon: 40.2, var: "T2M" });
    expect(cell.status).toBe("ok");
    expect(cell).toHaveProperty("cell.lat", 38);
    const eu = await api.trend({ place: "EU", var: "T2M" });
    expect(eu).toHaveProperty("place.kind", "continent");
  });

  it("explains bad requests", async () => {
    const bad = async (q: Parameters<typeof api.trend>[0]) => (await handle(() => api.trend(q))).status;
    expect(await bad({ place: "TR-21", var: "NOPE" })).toBe(400);
    expect(await bad({ place: "XX-99", var: "T2M" })).toBe(404);
    expect(await bad({ place: "TR-21", var: "T2M", from: 2020, to: 2025 })).toBe(400);
    expect(await bad({ var: "T2M" })).toBe(400);
    expect(await bad({ place: "TR-21", var: "T2M", season: "monsoon" })).toBe(400);
    const r = await handle(() => api.trend({ place: "XX-99", var: "T2M" }));
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect((await r.json()).error).toContain("XX-99");
  });

  it("reads the query string", () => {
    const q = readQuery(new URL("https://x/api/v1/trend?place=TR-21&var=prectot&from=1990&to=2020&season=winter"));
    expect(q).toMatchObject({ place: "TR-21", var: "prectot", from: 1990, to: 2020, season: "winter", lat: null });
  });
});
