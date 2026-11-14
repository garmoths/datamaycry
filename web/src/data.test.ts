// data.ts reads the mock files exactly like the browser will.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  analyzeTrend,
  anomalies,
  cellOf,
  getContinentSeries,
  getPointSeries,
  getRegionSeries,
  getTrendMap,
  listCountries,
  loadVariables,
  monthLabels,
  tileOf,
} from "./data.ts";

const root = fileURLToPath(new URL("../public/", import.meta.url));

beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    try {
      const buf = await readFile(root + url.replace(/^\//, ""));
      return new Response(buf);
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
});

describe("data.ts on mock data", () => {
  it("loads variables and countries", async () => {
    const v = await loadVariables();
    expect(v.variables).toHaveLength(9);
    expect(v.period.months).toBe(561);
    const c = await listCountries();
    expect(c.countries.map((x) => x.id)).toContain("TUR");
  });

  it("Diyarbakır temperature series → result card", async () => {
    const s = await getRegionSeries("TUR", "TR-21", "T2M");
    expect(s.values).toHaveLength(561);
    expect(s.label.tr).toBe("Diyarbakır, Türkiye");
    expect(monthLabels(s)[0]).toBe("1980-01");
    expect(monthLabels(s)[560]).toBe("2026-09");
    const r = analyzeTrend(s);
    expect(r.status).toBe("ok");
    expect(r.nYears).toBe(46);
    expect(r.slopePerDecade).toBeGreaterThan(0); // mock has +0.4 °C/decade
    expect(r.ci95[0]).toBeLessThan(r.slopePerDecade);
    expect(r.ci95[1]).toBeGreaterThan(r.slopePerDecade);
    expect(["strong", "possible", "none"]).toContain(r.level);
  });

  it("anomalies average ~0 over 1991–2020", async () => {
    const s = await getRegionSeries("TUR", null, "T2M");
    const a = anomalies(s).slice(132, 492); // 1991-01 .. 2020-12
    const mean = a.reduce((x, y) => x + y, 0) / a.length;
    expect(Math.abs(mean)).toBeLessThan(1e-9);
  });

  it("short period is not tested", async () => {
    const s = await getRegionSeries("TUR", "TR-42", "PRECTOT");
    expect(analyzeTrend(s, { startYear: 2018, endYear: 2025 }).status).toBe("too_short");
  });

  it("point mode reads the right tile cell", async () => {
    const c = cellOf(37.9, 40.2);
    expect(tileOf(c.i, c.j)).toEqual({ ty: 12, tx: 22 });
    const s = await getPointSeries(37.9, 40.2, "T2M");
    expect(s.values).toHaveLength(561);
    expect(s.values.some(Number.isNaN)).toBe(false);
  });

  it("north pole row is in the top tile row", () => {
    expect(tileOf(360, 0).ty).toBe(17);
    expect(tileOf(359, 575)).toEqual({ ty: 17, tx: 35 });
  });

  it("experimental variables never get the strong level", async () => {
    const v = await loadVariables();
    expect(v.variables.find((x) => x.id === "RUNOFF")?.experimental).toBe(true);
    // A clean synthetic upward trend is "strong" for normal variables...
    const base = await getRegionSeries("TUR", "TR-21", "T2M");
    const values = Float64Array.from(base.values, (_, k) => k * 0.01 + Math.sin(k) * 0.05);
    expect(analyzeTrend({ ...base, values }).level).toBe("strong");
    // ...but capped for RUNOFF.
    const r = analyzeTrend({ ...base, var: "RUNOFF", values });
    expect(r.level).toBe("possible");
    expect(r.capped).toBe(true);
  });

  it("continents and province resolution (contract 1.2)", async () => {
    const idx = await listCountries();
    expect(idx.continents?.map((c) => c.id)).toEqual(["AF", "AN", "AS", "EU", "NA", "OC", "SA"]);
    const tur = idx.countries.find((c) => c.id === "TUR");
    expect(tur?.continent).toBe("AS");
    expect(tur?.admin1.find((p) => p.id === "TR-77")?.low_resolution).toBe(true);
    expect(tur?.admin1.find((p) => p.id === "TR-42")?.low_resolution).toBe(false);
    const s = await getContinentSeries("EU", "T2M");
    expect(s.values).toHaveLength(561);
    expect(s.label.tr).toBe("Avrupa");
    expect(analyzeTrend(s).status).toBe("ok");
  });

  it("trend map has one value per grid cell", async () => {
    const m = await getTrendMap("T2M");
    expect(m.slopePerDecade).toHaveLength(361 * 576);
    expect(m.level.every((v) => v <= 2)).toBe(true);
  });
});
