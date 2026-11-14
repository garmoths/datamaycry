/**
 * "Climate fingerprint" card (docs/FEATURE_PLAN.md §2): every variable's trend for the
 * selected place in one table, what they show together, and the most alike places.
 *
 * Numbers per row: the place's own monthly series (same period and season as the main
 * card) when it has one, otherwise the world trend map inside its borders. Similar places
 * always compare trend-map means on both sides (like with like).
 *
 * Written with AI assistance (Claude).
 */
import { useEffect, useMemo, useState } from "react";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import {
  analyzeTrend,
  getContinentSeries,
  getPointSeries,
  getRegionSeries,
  type Series,
  type TrendOptions,
  type VarId,
  type VariableInfo,
} from "./data.ts";
import { summarizeByGrid, summarizeList, type GridMean } from "./areaStats.ts";
import { cellsInside } from "./continentStats.ts";
import { interpret, levelOfArea, mostSimilar, relative, vectorOf, type Candidate, type FingerprintRow } from "./fingerprint.ts";
import { loadTrendStack, scaleOf, type TrendStack } from "./trendStack.ts";
import { VAR_GROUPS, VAR_ICONS } from "./content.ts";
import { Icon } from "./icons.tsx";
import { smartSigned, unitLabel, type Lang } from "./i18n.ts";
import { TextShimmer } from "./amicro/TextShimmer.tsx";
import type { Target } from "./Panel.tsx";
import "./fingerprint.css";

const T = {
  title: { tr: "İklim parmak izi", en: "Climate fingerprint" },
  vars: { tr: "değişken", en: "variables" },
  loading: { tr: "Dokuz değişkenin haritası yükleniyor…", en: "Loading all nine variables…" },
  together: { tr: "Birlikte ne gösteriyor", en: "What they show together" },
  noInsight: { tr: "Değişkenler arasında belirgin bir ortak desen yok.", en: "No clear shared pattern between the variables." },
  similar: { tr: "Benzer yerler", en: "Similar places" },
  inCountry: { tr: "Bu ülkede", en: "In this country" },
  inWorld: { tr: "Dünyada", en: "Around the world" },
  similarNote: {
    tr: "1980–2025 trendleri en çok benzeyen yerler. Benzer trend, benzer iklim demek değildir.",
    en: "Places whose 1980–2025 trends look most alike. Similar trends do not mean a similar climate.",
  },
  noSimilar: {
    tr: "Karşılaştırmaya yetecek kadar belirgin bir değişim yok.",
    en: "Not enough clear change here to compare with other places.",
  },
  noData: { tr: "veri yok", en: "no data" },
  rowTip: { tr: "Bu değişkene geç", en: "Switch to this variable" },
  bar: {
    tr: "Çubuk: değişimin, o değişkenin dünyadaki tipik büyük değişimine oranı.",
    en: "Bar: the change relative to a typical large change of that variable worldwide.",
  },
  fromSeries: { tr: "aylık seriden, seçili dönem", en: "from the monthly series, selected period" },
  fromMap: { tr: "trend haritasından, 1980–2025", en: "from the trend map, 1980–2025" },
  level: {
    strong: { tr: "güçlü", en: "strong" },
    possible: { tr: "olası", en: "possible" },
    none: { tr: "yok", en: "none" },
  },
} as const;

/** The selected place on the map: its grid cells (null = whole world) and its id. */
export interface PlaceCells {
  id: string;
  cells: number[] | null;
}

interface Props {
  lang: Lang;
  variables: VariableInfo[];
  current: VarId;
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
  onVariable: (id: VarId) => void;
  onCountry: (id: string) => void;
  onAdmin1: (country: string, id: string) => void;
}

/** Signed number, Turkish with a decimal comma (same as the main card). */
const signed = (lang: Lang, x: number, d: number) => {
  const s = smartSigned(x, d);
  return lang === "tr" ? s.replace(".", ",") : s;
};

/** Similarity as a percentage; never shows a rounded 100 for a different place. */
const pctOf = (score: number) => (score >= 0.995 ? "99+" : String(Math.round(score * 100)));

function loadSeries(target: NonNullable<Target>, v: VarId): Promise<Series> {
  if (target.type === "region") return getRegionSeries(target.country, target.admin1, v);
  if (target.type === "continent") return getContinentSeries(target.id, v);
  return getPointSeries(target.lat, target.lon, v);
}

export function Fingerprint(p: Props) {
  const { lang } = p;
  const ids = useMemo(() => p.variables.map((v) => v.id), [p.variables]);
  const [stack, setStack] = useState<TrendStack | null>(null);
  useEffect(() => {
    let dead = false;
    void loadTrendStack(ids).then((s) => !dead && setStack(s));
    return () => {
      dead = true;
    };
  }, [ids]);
  const scales = useMemo(() => {
    const out: Partial<Record<VarId, number>> = {};
    if (stack) for (const id of ids) if (stack[id]) out[id] = scaleOf(stack[id]!);
    return out;
  }, [stack, ids]);

  // every variable's monthly series of the place (one file holds them all)
  const targetKey = JSON.stringify(p.target);
  const [series, setSeries] = useState<{ key: string; byVar: Partial<Record<VarId, Series>> }>({ key: "", byVar: {} });
  useEffect(() => {
    if (!p.target) return;
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
  }, [targetKey, ids]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const countryVectors: Candidate[] = useMemo(() => {
    if (!stack || !p.countryGrid) return [];
    const per: Partial<Record<VarId, (GridMean | null)[]>> = {};
    for (const id of ids) if (stack[id]) per[id] = summarizeByGrid(stack[id]!, p.countryGrid, p.countries.length);
    return p.countries.map((c, k) => {
      const means: Partial<Record<VarId, GridMean | null>> = {};
      // tiny countries (< 3 cells) are too noisy to be a match
      for (const id of ids) {
        const m = per[id]?.[k] ?? null;
        means[id] = m && m.cells >= 3 ? m : null;
      }
      return { kind: "country", id: c.id, country: c.id, name: { en: c.name_en, tr: c.name_tr }, vector: vectorOf(means, scales) };
    });
  }, [stack, p.countryGrid, p.countries, ids, scales]);

  const provinceVectors: Candidate[] = useMemo(() => {
    if (!stack) return [];
    return p.provinceFeatures.map((f) => {
      const cells = cellsInside(f);
      const means: Partial<Record<VarId, GridMean | null>> = {};
      for (const id of ids) means[id] = stack[id] && cells.length >= 3 ? summarizeList(stack[id]!, cells) : null;
      return { kind: "province", id: f.properties.id, country: f.properties.country, name: { en: f.properties.name_en, tr: f.properties.name_tr }, vector: vectorOf(means, scales) };
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

  if (!stack) return <TextShimmer>{T.loading[lang]}</TextShimmer>;

  const byId = new Map(p.variables.map((v) => [v.id, v]));
  const anySeries = rows.some((r) => r.source === "series");
  const anyMap = rows.some((r) => r.source === "map" && r.slope !== null);
  return (
    <>
      <header className="card-head">
        <h3>{T.title[lang]}</h3>
        <span className="pill">
          {rows.filter((r) => r.slope !== null).length} {T.vars[lang]}
        </span>
      </header>

      <div className="fp-rows" role="list">
        {VAR_GROUPS.flatMap((g) => g.ids)
          .filter((id) => byId.has(id))
          .map((id) => {
            const v = byId.get(id)!;
            const r = rows.find((x) => x.var === id)!;
            const unit = unitLabel(v.unit, lang);
            const rel = r.relative ?? 0;
            return (
              <button
                key={id}
                role="listitem"
                className={`fp-row lvl-${r.level} ${id === p.current ? "on" : ""} ${r.slope === null ? "empty" : ""}`}
                onClick={() => p.onVariable(id)}
                title={T.rowTip[lang]}
              >
                <Icon name={VAR_ICONS[id]} size={14} />
                <span className="fp-name">
                  {v.name[lang]}
                  {v.experimental && <i className="fp-exp">*</i>}
                </span>
                <span className="fp-bar" aria-hidden>
                  <i className={rel >= 0 ? "pos" : "neg"} style={{ width: `${(Math.abs(rel) / 1.5) * 50}%` }} />
                </span>
                <span className="fp-val">{r.slope === null ? T.noData[lang] : `${signed(lang, r.slope, v.decimals + 1)} ${unit}`}</span>
                <span className="fp-lvl">{r.slope === null ? "" : T.level[r.level][lang]}</span>
              </button>
            );
          })}
      </div>
      <p className="fine">
        {T.bar[lang]} {anySeries && anyMap ? `${T.fromSeries[lang]}; ${T.fromMap[lang]} ` : anySeries ? T.fromSeries[lang] : T.fromMap[lang]}.
      </p>

      <h4>{T.together[lang]}</h4>
      {insights.length ? (
        <ul className="fp-insights">
          {insights.map((x) => (
            <li key={x.id}>{x.text[lang]}</li>
          ))}
        </ul>
      ) : (
        <p className="fine">{T.noInsight[lang]}</p>
      )}

      <h4>{T.similar[lang]}</h4>
      {similar.near.length + similar.world.length ? (
        <div className="fp-similar-groups">
          {[
            { key: "near", title: T.inCountry[lang], list: similar.near },
            { key: "world", title: T.inWorld[lang], list: similar.world },
          ]
            .filter((g) => g.list.length)
            .map((g) => (
              <div key={g.key}>
                <p className="fp-group">{g.title}</p>
                <ol className="fp-similar">
                  {g.list.map((x) => (
                    <li key={`${x.kind}:${x.id}`}>
                      <button onClick={() => (x.kind === "country" ? p.onCountry(x.id) : p.onAdmin1(x.country, x.id))}>
                        <span>{x.name[lang]}</span>
                        <b>%{pctOf(x.score)}</b>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          <p className="fine">{T.similarNote[lang]}</p>
        </div>
      ) : (
        <p className="fine">{T.noSimilar[lang]}</p>
      )}
    </>
  );
}
