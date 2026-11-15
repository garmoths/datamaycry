/**
 * The climate fingerprint's numbers (docs/FEATURE_PLAN.md §2), shared by the side-menu rows
 * and the PDF report: every variable's trend for the place, the "seen together" sentences
 * and the most alike places. The views are in Fingerprint.tsx.
 * Written with AI assistance (Claude).
 */
import { useEffect, useMemo, useState } from "react";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { analyzeTrend, getContinentSeries, getPointSeries, getRegionSeries, type Series, type TrendOptions, type VarId, type VariableInfo } from "./data.ts";
import { summarizeByGrid, summarizeList, type GridMean } from "./areaStats.ts";
import { cellsInside } from "./continentStats.ts";
import { interpret, levelOfArea, mostSimilar, relative, vectorOf, type Candidate, type FingerprintRow } from "./fingerprint.ts";
import { loadTrendStack, scaleOf, type TrendStack } from "./trendStack.ts";
import type { Lang } from "./i18n.ts";
import type { Target } from "./Panel.tsx";

/** The selected place on the map: its grid cells (null = whole world) and its id. */
export interface PlaceCells {
  id: string;
  cells: number[] | null;
}

// similar-place vectors per loaded set of maps: per country grid, and per province feature
// (from main, "No more stutter on big countries")
const countryCache = new WeakMap<TrendStack, WeakMap<Uint16Array, Candidate[]>>();
const provinceCache = new WeakMap<TrendStack, WeakMap<object, Candidate>>();

export interface FingerprintInputs {
  lang: Lang;
  variables: VariableInfo[];
  /** monthly series of the place (null when it has none) */
  target: Target;
  /** same period and season as the main card */
  opts: TrendOptions;
  place: PlaceCells | null;
  /** similar-places pool: every country, plus the provinces of the open country */
  countryGrid: Uint16Array | null;
  countries: { id: string; name_en: string; name_tr: string }[];
  countryId: string | null;
  provinceFeatures: Feature<Polygon | MultiPolygon, { id: string; country: string; name_en: string; name_tr: string }>[];
}

/** What the fingerprint computes, shared by the side menu rows and the PDF report. */
export interface FingerprintData {
  ready: boolean;
  rows: FingerprintRow[];
  insights: ReturnType<typeof interpret>;
  similar: { near: (Candidate & { score: number })[]; world: (Candidate & { score: number })[] };
}

function loadSeries(target: NonNullable<Target>, v: VarId): Promise<Series> {
  if (target.type === "region") return getRegionSeries(target.country, target.admin1, v);
  if (target.type === "continent") return getContinentSeries(target.id, v);
  return getPointSeries(target.lat, target.lon, v);
}

/**
 * The fingerprint's numbers. `enabled` = false keeps the nine trend maps (~15 MB) from
 * downloading until they are wanted (on phones: until the row is opened).
 */
export function useFingerprint(p: FingerprintInputs, enabled: boolean): FingerprintData {
  const ids = useMemo(() => p.variables.map((v) => v.id), [p.variables]);
  const [stack, setStack] = useState<TrendStack | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let dead = false;
    void loadTrendStack(ids).then((s) => !dead && setStack(s));
    return () => {
      dead = true;
    };
  }, [ids, enabled]);
  const scales = useMemo(() => {
    const out: Partial<Record<VarId, number>> = {};
    if (stack) for (const id of ids) if (stack[id]) out[id] = scaleOf(stack[id]!);
    return out;
  }, [stack, ids]);

  // every variable's monthly series of the place (one file holds them all)
  const targetKey = JSON.stringify(p.target);
  const [series, setSeries] = useState<{ key: string; byVar: Partial<Record<VarId, Series>> }>({ key: "", byVar: {} });
  useEffect(() => {
    if (!p.target || !enabled) return;
    let dead = false;
    const target = p.target;
    void Promise.all(ids.map((v) => loadSeries(target, v).then((s) => [v, s] as const, () => null))).then((pairs) => {
      if (dead) return;
      const byVar: Partial<Record<VarId, Series>> = {};
      for (const x of pairs) if (x) byVar[x[0]] = x[1];
      setSeries({ key: targetKey, byVar });
    });
    return () => {
      dead = true;
    };
  }, [targetKey, ids, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // trend-map means of the place, per variable
  const placeMeans = useMemo(() => {
    const out: Partial<Record<VarId, GridMean | null>> = {};
    if (!stack || !p.place) return out;
    for (const id of ids) out[id] = stack[id] ? summarizeList(stack[id]!, p.place.cells) : null;
    return out;
  }, [stack, p.place, ids]);

  const optsKey = JSON.stringify(p.opts);
  const rows: FingerprintRow[] = useMemo(() => {
    const own = p.target && series.key === targetKey ? series.byVar : {};
    return ids.map((id) => {
      const s = own[id];
      if (s) {
        const r = analyzeTrend(s, p.opts);
        if (r.status === "ok") return { var: id, slope: r.slopePerDecade, level: r.level, relative: relative(r.slopePerDecade, scales[id] ?? 0), source: "series" as const };
      }
      const m = placeMeans[id];
      if (m) return { var: id, slope: m.meanSlope, level: levelOfArea(m), relative: relative(m.meanSlope, scales[id] ?? 0), source: "map" as const };
      return { var: id, slope: null, level: "none" as const, relative: null, source: "map" as const };
    });
    // optsKey stands in for p.opts (a new object every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, series, targetKey, placeMeans, scales, optsKey]);
  const insights = useMemo(() => interpret(rows), [rows]);

  // ── similar places ──
  // The card is rebuilt on every selection, but these depend only on the loaded maps and the
  // borders, which never change: they are worked out once and kept (module-level caches).
  const countryVectors: Candidate[] = useMemo(() => {
    if (!stack || !p.countryGrid) return [];
    const byGrid = countryCache.get(stack) ?? new WeakMap<Uint16Array, Candidate[]>();
    countryCache.set(stack, byGrid);
    const hit = byGrid.get(p.countryGrid);
    if (hit) return hit;
    const per: Partial<Record<VarId, (GridMean | null)[]>> = {};
    for (const id of ids) if (stack[id]) per[id] = summarizeByGrid(stack[id]!, p.countryGrid, p.countries.length);
    const list = p.countries.map((c, k) => {
      const means: Partial<Record<VarId, GridMean | null>> = {};
      // tiny countries (< 3 cells) are too noisy to be a match
      for (const id of ids) {
        const m = per[id]?.[k] ?? null;
        means[id] = m && m.cells >= 3 ? m : null;
      }
      return { kind: "country" as const, id: c.id, country: c.id, name: { en: c.name_en, tr: c.name_tr }, vector: vectorOf(means, scales) };
    });
    byGrid.set(p.countryGrid, list);
    return list;
  }, [stack, p.countryGrid, p.countries, ids, scales]);

  const provinceVectors: Candidate[] = useMemo(() => {
    if (!stack) return [];
    const byFeature = provinceCache.get(stack) ?? new WeakMap<object, Candidate>();
    provinceCache.set(stack, byFeature);
    return p.provinceFeatures.map((f) => {
      const hit = byFeature.get(f);
      if (hit) return hit;
      const cells = cellsInside(f);
      const means: Partial<Record<VarId, GridMean | null>> = {};
      for (const id of ids) means[id] = stack[id] && cells.length >= 3 ? summarizeList(stack[id]!, cells) : null;
      const c: Candidate = { kind: "province", id: f.properties.id, country: f.properties.country, name: { en: f.properties.name_en, tr: f.properties.name_tr }, vector: vectorOf(means, scales) };
      byFeature.set(f, c);
      return c;
    });
  }, [stack, p.provinceFeatures, ids, scales]);

  // two short lists: provinces of the same country, and countries elsewhere
  // (otherwise the nearest neighbours always fill the list)
  const similar = useMemo(() => {
    if (!p.place) return { near: [], world: [] };
    const self = vectorOf(placeMeans, scales);
    return {
      near: mostSimilar(self, p.place.id, provinceVectors, 3),
      world: mostSimilar(self, p.place.id, countryVectors.filter((c) => c.id !== p.countryId), 3),
    };
  }, [p.place, placeMeans, scales, provinceVectors, countryVectors, p.countryId]);

  return { ready: !!stack, rows, insights, similar };
}

