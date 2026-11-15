/**
 * The public Aeolus API, framework-free so it runs in Vercel functions (web/api/) and in
 * unit tests (apiCore.test.ts on the mock files). It reads the same data package as the site and
 * runs the same analysis code (trend.ts, caps.ts, i18n.ts), so an API answer always matches the
 * card on the site.
 *
 *   GET /api/v1/variables
 *   GET /api/v1/places?q=diyarbakir&limit=10
 *   GET /api/v1/trend?place=TR-21&var=T2M&from=1980&to=2025&season=all
 *   GET /api/v1/trend?lat=37.9&lon=40.2&var=PRECTOT
 *   GET /api/v1/series?place=TUR&var=T2M
 *
 * Written with AI assistance (Claude).
 */
import type {
  Badge,
  BadgesFile,
  ContinentId,
  RegionHeader,
  RegionIndexFile,
  Series,
  TileHeader,
  TrendResult,
  VarId,
  VariableInfo,
  VariablesFile,
} from "../../contract/types.ts";
import { applyCaps } from "./caps.ts";
import { cellOf, parseDmc, tileOf, unpack } from "./dmc.ts";
import { cardText, meaningHead, noTrendText } from "./i18n.ts";
import { analyzeTrend, SEASONS, type Season } from "./trend.ts";

/** Where the data package is read from (a URL prefix on Vercel, the mock folder in tests). */
export interface FileSource {
  text(path: string): Promise<string>;
  bin(path: string): Promise<ArrayBuffer>;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const API_VERSION = "1";
export const DOCS_URL = "https://aeolusclimate.vercel.app/#api";
const CONTINENTS: ContinentId[] = ["AF", "AN", "AS", "EU", "NA", "OC", "SA"];

/** Turkish-aware folding for search: "Diyarbakır" ~ "diyarbakir". */
export function fold(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i");
}

export type PlaceKind = "continent" | "country" | "province";
export interface Place {
  id: string;
  kind: PlaceKind;
  name: { en: string; tr: string };
  /** the country of a province */
  country?: string;
}

export interface TrendQuery {
  place?: string | null;
  lat?: number | null;
  lon?: number | null;
  var: string;
  from?: number | null;
  to?: number | null;
  season?: string | null;
}

export function createApi(src: FileSource) {
  const memo = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, load: () => Promise<T>): Promise<T> => {
    if (!memo.has(key)) {
      const p = load();
      p.catch(() => memo.delete(key));
      memo.set(key, p);
    }
    return memo.get(key) as Promise<T>;
  };
  const json = <T>(path: string) => once(path, async () => JSON.parse(await src.text(path)) as T);
  const dmc = <H extends { schema_version: string }>(path: string) => once(path, async () => parseDmc<H>(await src.bin(path), path));

  const variablesFile = () => json<VariablesFile>("variables.json");
  const index = () => json<RegionIndexFile>("regions/index.json");
  const badges = () =>
    once("badges", async () => {
      try {
        return (JSON.parse(await src.text("regions/badges.json")) as BadgesFile).regions;
      } catch {
        return {} as Record<string, Badge[]>; // optional file
      }
    });

  async function variable(id: string): Promise<VariableInfo> {
    const v = (await variablesFile()).variables.find((x) => x.id === id.toUpperCase());
    if (!v) throw new ApiError(400, `Unknown variable "${id}". See /api/v1/variables.`);
    return v;
  }

  /** Every place with a monthly series: continents, countries, provinces. */
  const places = () =>
    once("places", async () => {
      const idx = await index();
      const out: Place[] = [];
      for (const c of idx.continents ?? []) out.push({ id: c.id, kind: "continent", name: c.name });
      for (const c of idx.countries) {
        out.push({ id: c.id, kind: "country", name: c.name });
        for (const a of c.admin1) out.push({ id: a.id, kind: "province", name: a.name, country: c.id });
      }
      return out;
    });

  async function place(id: string): Promise<Place> {
    const all = await places();
    const p = all.find((x) => x.id === id) ?? all.find((x) => x.id.toUpperCase() === id.toUpperCase());
    if (!p) throw new ApiError(404, `Unknown place "${id}". Find ids with /api/v1/places?q=…`);
    return p;
  }

  async function seriesOf(q: { place?: string | null; lat?: number | null; lon?: number | null }, varId: VarId): Promise<{ series: Series; where: Record<string, unknown> }> {
    const info = await variable(varId);
    if (q.place) {
      const p = await place(q.place);
      const file = p.kind === "continent" ? "regions/continents.bin" : `regions/${p.country ?? p.id}.bin`;
      const { header, data } = await dmc<RegionHeader>(file);
      const r = header.regions.findIndex((x) => x.id === p.id);
      const v = header.vars.indexOf(info.id);
      if (r < 0 || v < 0) throw new ApiError(404, `No ${info.id} series for ${p.id}`);
      const n = header.months;
      const at = (r * header.vars.length + v) * n;
      return {
        series: { var: info.id, unit: info.unit, start: header.start, values: unpack(data.subarray(at, at + n), header.packing[v]), label: p.name, region: p.id },
        where: { place: p },
      };
    }
    if (q.lat == null || q.lon == null || !Number.isFinite(q.lat) || !Number.isFinite(q.lon)) {
      throw new ApiError(400, "Give either place=<id> or lat=<number>&lon=<number>.");
    }
    if (Math.abs(q.lat) > 90 || Math.abs(q.lon) > 180) throw new ApiError(400, "lat must be within ±90 and lon within ±180.");
    const cell = cellOf(q.lat, q.lon);
    const { tx, ty } = tileOf(cell.i, cell.j);
    const { header, data } = await dmc<TileHeader>(`tiles/${info.id}/${ty}_${tx}.bin`);
    const k = (cell.i - header.i0) * header.nlon + (cell.j - header.j0);
    const n = header.months;
    const label = `${cell.lat.toFixed(2)}°, ${cell.lon.toFixed(2)}°`;
    return {
      series: { var: info.id, unit: info.unit, start: header.start, values: unpack(data.subarray(k * n, (k + 1) * n), header.packing), label: { en: label, tr: label } },
      where: { cell: { lat: cell.lat, lon: cell.lon, i: cell.i, j: cell.j, size_deg: [0.5, 0.625] } },
    };
  }

  return {
    async variables() {
      const v = await variablesFile();
      return {
        api_version: API_VERSION,
        dataset: v.dataset,
        period: v.period,
        test_years: v.test_years,
        baseline_years: v.baseline_years,
        variables: v.variables.map((x) => ({ id: x.id, name: x.name, unit: x.unit, decimals: x.decimals, land_only: !!x.land_only, experimental: !!x.experimental, description: x.description })),
        docs: DOCS_URL,
      };
    },

    async places(q: string | null, limit = 20) {
      const all = await places();
      const f = q ? fold(q.trim()) : "";
      const rank = (p: Place) => {
        const names = [p.name.en, p.name.tr].map(fold);
        if (names.includes(f) || fold(p.id) === f) return 3;
        if (names.some((n) => n.startsWith(f))) return 2;
        return 1;
      };
      const kind = { continent: 2, country: 1, province: 0 } as const;
      const hits = f
        ? all.filter((p) => fold(`${p.name.en} ${p.name.tr} ${p.id}`).includes(f)).sort((a, b) => rank(b) - rank(a) || kind[b.kind] - kind[a.kind])
        : all.filter((p) => p.kind !== "province");
      return { api_version: API_VERSION, count: hits.length, places: hits.slice(0, Math.max(1, Math.min(limit, 200))), docs: DOCS_URL };
    },

    async series(q: { place?: string | null; lat?: number | null; lon?: number | null; var: string }) {
      const info = await variable(q.var);
      const { series, where } = await seriesOf(q, info.id);
      const [y0, m0] = series.start.split("-").map(Number);
      const months = Array.from(series.values, (v, k) => {
        const m = m0 - 1 + k;
        return { month: `${y0 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`, value: Number.isFinite(v) ? +v.toFixed(5) : null };
      });
      return { api_version: API_VERSION, ...where, variable: { id: info.id, name: info.name, unit: info.unit }, start: series.start, months, docs: DOCS_URL };
    },

    async trend(q: TrendQuery) {
      const vf = await variablesFile();
      const info = await variable(q.var);
      const season = (q.season || "all") as Season;
      if (!(season in SEASONS)) throw new ApiError(400, `season must be one of ${Object.keys(SEASONS).join(", ")}.`);
      const from = q.from ?? vf.test_years.start;
      const to = q.to ?? vf.test_years.end;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < vf.test_years.start || to > vf.test_years.end || to - from < 9) {
        throw new ApiError(400, `from/to must be whole years within ${vf.test_years.start}–${vf.test_years.end}, at least 10 years apart.`);
      }
      const { series, where } = await seriesOf(q, info.id);
      const months = SEASONS[season] ? [...SEASONS[season]!] : undefined;
      let r: TrendResult = analyzeTrend(series, { startYear: from, endYear: to, months });
      const regionBadges = series.region ? ((await badges())[series.region] ?? []).filter((b) => b.var === info.id) : [];
      r = applyCaps(r, !!info.experimental, regionBadges);
      const ok = r.status === "ok";
      const dir = r.slopePerDecade >= 0 ? "up" : "down";
      const text = (lang: "en" | "tr") =>
        !ok
          ? null
          : r.level === "none"
            ? noTrendText(lang, { start: r.startYear, end: r.endYear })
            : cardText(lang, {
                varId: info.id,
                dir,
                level: r.level,
                place: series.label[lang],
                variable: info.name[lang],
                unit: info.unit,
                slope: r.slopePerDecade,
                ci: r.ci95,
                p: r.pValue,
                total: r.totalChange,
                startYear: r.startYear,
                endYear: r.endYear,
                decimals: info.decimals,
              });
      const num = (x: number, d = 4) => (Number.isFinite(x) ? +x.toFixed(d) : null);
      return {
        api_version: API_VERSION,
        ...where,
        variable: { id: info.id, name: info.name, unit: info.unit, experimental: !!info.experimental },
        period: { from, to, season },
        status: r.status,
        evidence: ok ? r.level : null,
        capped: r.capped ? r.cappedReason : null,
        // a non-significant slope has no reliable sign: no numbers for "none"
        change_per_decade: ok && r.level !== "none" ? num(r.slopePerDecade) : null,
        change_total: ok && r.level !== "none" ? num(r.totalChange) : null,
        ci95_per_decade: ok && r.level !== "none" ? r.ci95.map((x) => num(x)) : null,
        p_value: ok ? num(r.pValue, 6) : null,
        years_used: ok ? r.nYears : null,
        meaning: ok && r.level !== "none" ? { en: meaningHead("en", info.id, dir), tr: meaningHead("tr", info.id, dir) } : null,
        text: ok ? { en: text("en"), tr: text("tr") } : null,
        annual: ok ? r.annual.years.map((y, k) => ({ year: y, anomaly: num(r.annual.anomalies[k]) })) : [],
        badges: (r.badges ?? []).map((b) => ({ source: b.source, status: b.status, years: b.years })),
        method: "Monthly anomalies vs 1991–2020 → annual means → Mann-Kendall test + Sen's slope, 95 % range with effective sample size; see docs.",
        source: `${vf.dataset}`,
        docs: DOCS_URL,
      };
    },

    /** Continent ids accepted by place= */
    continents: CONTINENTS,
  };
}

export type Api = ReturnType<typeof createApi>;

/** Parse the query string of a request into a TrendQuery. */
export function readQuery(url: URL): TrendQuery & { q: string | null; limit: number } {
  const g = (k: string) => url.searchParams.get(k);
  const n = (k: string) => (g(k) === null || g(k) === "" ? null : Number(g(k)));
  return {
    place: g("place"),
    lat: n("lat"),
    lon: n("lon"),
    var: g("var") ?? g("variable") ?? "T2M",
    from: n("from"),
    to: n("to"),
    season: g("season"),
    q: g("q"),
    limit: n("limit") ?? 20,
  };
}

/** JSON response with CORS and caching (the data only changes with a new package). */
export function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": status === 200 ? "public, max-age=3600, s-maxage=86400" : "no-store",
    },
  });
}

/** Wrap a handler: errors become JSON with the right status. */
export async function handle(run: () => Promise<unknown>): Promise<Response> {
  try {
    return respond(await run());
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    return respond({ error: e instanceof Error ? e.message : String(e), docs: DOCS_URL }, status);
  }
}
