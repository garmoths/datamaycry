/**
 * Rows for a ranking scope (docs/FEATURE_PLAN.md §4), shared by the drawer tab and the card
 * badge (Ranking.tsx). Series-based for the provinces of a country when every province has a
 * monthly series; otherwise the world trend map.
 * Written with AI assistance (Claude).
 */
import { useEffect, useMemo, useState } from "react";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import { analyzeTrend, getRegionSeries, type CountryInfo, type TrendMap, type TrendOptions, type VariableInfo } from "./data.ts";
import { summarizeByGrid, summarizeList } from "./areaStats.ts";
import { cellsInside } from "./continentStats.ts";
import { levelOfArea } from "./fingerprint.ts";
import { labelPoint } from "./geo.ts";
import type { RankRow } from "./ranking.ts";
import type { Lang } from "./i18n.ts";

export const RANK_TAB_LABEL = { tr: "Sıralama", en: "Ranking" } as const;

type ProvinceFeature = Feature<Polygon | MultiPolygon, { id: string; country: string; name_en: string; name_tr: string }>;

/** series-based province rankings, by `${country}|${variable}|${period/season}` (small LRU) */
const rowCache = new Map<string, RankRow[]>();

export type RankScope = { kind: "countries"; continent: string | null } | { kind: "provinces"; country: string };

export interface RankInputs {
  lang: Lang;
  variable: VariableInfo;
  /** card's period and season (used for series-based rankings) */
  opts: TrendOptions;
  /** the trend map's period (map-based rankings), for totals */
  fullYears: [number, number];
  trendMap: TrendMap | null;
  countryGrid: Uint16Array | null;
  /** same order as the country grid's codes (Boundaries.countries, see countryCode) */
  countryRows: { id: string; name_en: string; name_tr: string; continent: string }[];
  index: CountryInfo[];
  provinceFeatures: ProvinceFeature[];
}

/** Rows for one scope; series-based for provinces when every province has a series. */
export function useRankRows(scope: RankScope | null, p: RankInputs): { rows: RankRow[]; source: "series" | "map"; ready: boolean } {
  const { trendMap, countryGrid, countryRows, index, provinceFeatures, variable } = p;
  const countryId = scope?.kind === "provinces" ? scope.country : null;
  const features = useMemo(() => provinceFeatures.filter((f) => f.properties.country === countryId), [provinceFeatures, countryId]);
  // a series ranking only when the data has a series for every province of the border file
  const info = index.find((c) => c.id === countryId);
  const seriesIds = useMemo(() => new Set(info?.admin1.map((a) => a.id) ?? []), [info]);
  const bySeries = !!countryId && features.length > 0 && features.every((f) => seriesIds.has(f.properties.id));

  // map-based province cells, only when the ranking is read from the map (cached per province)
  const provinceCells = useMemo(
    () =>
      bySeries ? [] : features.map((f) => {
        const inside = cellsInside(f);
        return { f, cells: inside.length ? inside : cellsInside(f, labelPoint(f)), lowRes: inside.length === 0 };
      }),
    [features, bySeries],
  );

  const mapRows: RankRow[] = useMemo(() => {
    if (!scope || !trendMap) return [];
    if (scope.kind === "countries") {
      if (!countryGrid) return [];
      const all = summarizeByGrid(trendMap, countryGrid, countryRows.length);
      return countryRows.flatMap((c, k) => {
        const s = all[k];
        if (!s || (scope.continent && c.continent !== scope.continent)) return [];
        return [{ id: c.id, country: c.id, kind: "country" as const, name: { en: c.name_en, tr: c.name_tr }, slope: s.meanSlope, level: levelOfArea(s), strongUp: s.strongUp, strongDown: s.strongDown, lowRes: s.cells < 1, source: "map" as const }];
      });
    }
    return provinceCells.flatMap(({ f, cells, lowRes }) => {
      const s = summarizeList(trendMap, cells);
      return s
        ? [{ id: f.properties.id, country: f.properties.country, kind: "province" as const, name: { en: f.properties.name_en, tr: f.properties.name_tr }, slope: s.meanSlope, level: levelOfArea(s), strongUp: s.strongUp, strongDown: s.strongDown, lowRes, source: "map" as const }]
        : [];
    });
  }, [scope, trendMap, countryGrid, countryRows, provinceCells]);

  // series-based provinces (one file per country holds every province)
  const optsKey = JSON.stringify(p.opts);
  const seriesKey = `${countryId}|${variable.id}|${optsKey}`;
  // the card is rebuilt on each selection: rows already computed for this country, variable
  // and period are reused instead of analysing every province again
  const [series, setSeries] = useState<{ key: string; rows: RankRow[] }>(() => {
    const hit = rowCache.get(seriesKey);
    return hit ? { key: seriesKey, rows: hit } : { key: "", rows: [] };
  });
  useEffect(() => {
    if (!bySeries || !countryId || rowCache.has(seriesKey)) return;
    let dead = false;
    const opts = JSON.parse(optsKey) as TrendOptions;
    void Promise.all(
      features.map((f) =>
        getRegionSeries(countryId, f.properties.id, variable.id).then(
          (s): RankRow | null => {
            const r = analyzeTrend(s, opts);
            return r.status === "ok"
              ? ({ id: f.properties.id, country: countryId, kind: "province", name: { en: f.properties.name_en, tr: f.properties.name_tr }, slope: r.slopePerDecade, level: r.level, strongUp: null, strongDown: null, lowRes: !!info?.admin1.find((a) => a.id === f.properties.id)?.low_resolution, source: "series" })
              : null;
          },
          () => null,
        ),
      ),
    ).then((rows) => {
      const ok = rows.filter((r): r is RankRow => !!r);
      rowCache.set(seriesKey, ok);
      if (rowCache.size > 24) rowCache.delete(rowCache.keys().next().value!);
      if (!dead) setSeries({ key: seriesKey, rows: ok });
    });
    return () => {
      dead = true;
    };
  }, [bySeries, countryId, features, variable.id, optsKey, seriesKey, info]);

  if (bySeries) {
    const rows = series.key === seriesKey ? series.rows : rowCache.get(seriesKey);
    return { rows: rows ?? [], source: "series", ready: !!rows };
  }
  return { rows: mapRows, source: "map", ready: !!trendMap };
}
