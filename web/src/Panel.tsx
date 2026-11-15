/**
 * The analysis panel on the right of the globe: where am I → the answer → its shape over
 * time. Places are found with the search bar and the globe, so the panel lists none.
 * Every selection replays a short staggered entrance, so a change of place is felt.
 * The drawer (full chart / explore / sources) slides in from the left only when asked.
 *
 * Two kinds of answers:
 *  - a monthly series (countries, provinces, continents, grid cells): the full
 *    Mann-Kendall + Sen protocol is run here;
 *  - the world and provinces without a series: a summary of the world trend map inside
 *    its borders (continentStats.ts).
 *
 * Written with AI assistance (Claude).
 */
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  analyzeTrend,
  anomalies,
  getContinentSeries,
  getPointSeries,
  getRegionSeries,
  monthLabels,
  type ContinentId,
  type CountryInfo,
  type Series,
  type VariablesFile,
  type VariableInfo,
  type VarId,
  type TrendMap,
} from "./data.ts";
import { Chart, type ChartView } from "./Chart.tsx";
import { cardText, decimalsFor, meaningHead, noTrendText, smartSigned, t, unitLabel, type Lang, type StringKey } from "./i18n.ts";
import { emergence, SEASONS, type Season } from "./trend.ts";

const SEASON_LABEL: Record<Season, StringKey> = {
  all: "seasonAll", winter: "seasonWinter", spring: "seasonSpring", summer: "seasonSummer", autumn: "seasonAutumn",
};
import { CONTINENTS, type Node } from "./geo.ts";
import { NumberTicker } from "./NumberTicker.tsx";
import type { AreaSummary } from "./continentStats.ts";
import { Icon, type IconName } from "./icons.tsx";
import { QUESTIONS, VAR_ICONS, type Question } from "./content.ts";
import { Provenance, References, type ProvinceItem } from "./Evidence.tsx";
import { Spotlight } from "./Spotlight.tsx";
import { ChangeToggle } from "./ChangeToggle.tsx";
import { asView, useChangeView } from "./changeView.ts";
import BlurText from "./reactbits/BlurText.tsx";
import { TextShimmer } from "./amicro/TextShimmer.tsx";
import { YearRange } from "./YearRange.tsx";
import { Fingerprint, FingerprintTable, SimilarPlaces } from "./Fingerprint.tsx";
import { useFingerprint, type PlaceCells } from "./useFingerprint.ts";
import { FlowingMenu, type FlowItem } from "./reactbits/FlowingMenu.tsx";
import "./sidemenu.css";
import { AnimatedTabs } from "./uilab/AnimatedTabs.tsx";
import { monthlyTrends, MONTHS } from "./monthly.ts";
import { changePoint } from "./changepoint.ts";
import { BendNote } from "./Bend.tsx";
import { MonthStrip } from "./MonthStrip.tsx";
import { Report } from "./Report.tsx";
import { RankBadge, RankingPane } from "./Ranking.tsx";
import { RANK_TAB_LABEL, type RankInputs, type RankScope } from "./useRankRows.ts";

/** Summary of the world / a continent / a country / a province, from the per-cell trend map. */
export interface AreaInfo {
  kind: "world" | "continent" | "country" | "province";
  summary: AreaSummary;
  /** province smaller than one grid cell: the summary is the single cell nearest to it */
  nearest?: boolean;
}

export type Target =
  | { type: "region"; country: string; admin1: string | null }
  | { type: "point"; lat: number; lon: number }
  /** contract 1.2: continent series (regions/continents.bin) */
  | { type: "continent"; id: ContinentId }
  | null;

export interface CountryRow {
  id: string;
  name_en: string;
  name_tr: string;
  continent: string;
}

/** A province of the chosen country, with the place of its dot on the globe. */
export interface ProvinceRow extends ProvinceItem {
  lat: number;
  lon: number;
}

export type DrawerTab = "chart" | "explore" | "sources" | "rank";

interface Props {
  lang: Lang;
  /** the side panel can be hidden; the drawer works either way */
  open: boolean;
  onClose: () => void;
  /** analysed period, chosen on the period scale (top left) or in the chart drawer */
  years: [number, number];
  onYears: (y: [number, number]) => void;
  /** 1.4 time travel: while playing, the card and chart cover [from, year] (null = off) */
  anim?: { from: number; year: number; to: number } | null;
  mode: "region" | "point";
  variables: VariablesFile;
  variable: VariableInfo;
  index: CountryInfo[];
  countryRows: CountryRow[];
  provinces: ProvinceRow[];
  continent: string | null;
  countryId: string | null;
  admin1Id: string | null;
  path: Node[];
  onScale: (level: number) => void;
  area: AreaInfo | null;
  target: Target;
  trail: { label: string; go: () => void }[];
  onContinent: (id: string) => void;
  onCountry: (id: string) => void;
  onAdmin1: (country: string, id: string) => void;
  demos: { label: string; go: () => void }[];
  question: Question | null;
  onQuestion: (q: Question | null) => void;
  drawer: DrawerTab | null;
  onDrawer: (t: DrawerTab | null) => void;
  /** climate fingerprint (Fingerprint.tsx) */
  place: PlaceCells | null;
  countryGrid: Uint16Array | null;
  provinceFeatures: ComponentProps<typeof Fingerprint>["provinceFeatures"];
  onVariable: (id: VarId) => void;
  /** rankings (Ranking.tsx): the current variable's world trend map */
  trendMap: TrendMap | null;
}

const DRAWER_TABS: { id: DrawerTab; icon: IconName; key?: "tabChart" | "tabExplore" | "sources"; label?: Record<Lang, string> }[] = [
  { id: "chart", icon: "chart", key: "tabChart" },
  { id: "rank", icon: "flag", label: RANK_TAB_LABEL },
  { id: "explore", icon: "search", key: "tabExplore" },
  { id: "sources", icon: "book", key: "sources" },
];

const EASE = [0.22, 1, 0.36, 1] as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** One card of the column; it rises in as part of the column's staggered entrance. */
function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const rise = reduce
    ? { hidden: { opacity: 1 }, show: { opacity: 1 } }
    : { hidden: { opacity: 0, y: 18, filter: "blur(6px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: EASE } } };
  return (
    <motion.section variants={rise} className="card-slot">
      <Spotlight className={`card ${className}`}>{children}</Spotlight>
    </motion.section>
  );
}

export function Panel(p: Props) {
  const { lang, variable: v, variables } = p;
  const tr = lang === "tr";
  const [series, setSeries] = useState<Series | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ChartView>("anomaly");
  const reduce = useReducedMotion();
  const [season, setSeason] = useState<Season>("all");
  const [printing, setPrinting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // the menu row that is open (its details expand in place)
  const [openRow, setOpenRow] = useState<string | null>(null);
  // phones: the nine trend maps (~15 MB) only load when a row that needs them is opened,
  // and the menu starts closed so every row fits on the bottom sheet
  const [isPhone] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches);
  const { years, onYears: setYears } = p;
  // during time travel the analysed period follows the animation year
  const animYear = p.anim?.year, animStart = p.anim?.from;
  const eff = useMemo<[number, number]>(
    () => (animYear !== undefined && animStart !== undefined ? [animStart, animYear] : years),
    [animYear, animStart, years],
  );

  const targetKey = JSON.stringify(p.target);
  useEffect(() => {
    let dead = false;
    if (!p.target) return; // nothing selected: `shown` below hides any old series
    setError(null);
    setLoading(true);
    const load =
      p.target.type === "region"
        ? getRegionSeries(p.target.country, p.target.admin1, v.id)
        : p.target.type === "continent"
          ? getContinentSeries(p.target.id, v.id)
          : getPointSeries(p.target.lat, p.target.lon, v.id);
    load
      .then((s) => !dead && setSeries(s))
      .catch((e: Error) => {
        if (dead) return;
        setSeries(null);
        setError(p.target?.type === "point" ? t(lang, "ungridded") : e.message);
      })
      .finally(() => !dead && setLoading(false));
    return () => {
      dead = true;
    };
  }, [targetKey, v.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = p.target ? series : null;
  // change of pace (changepoint.ts); skipped while time travel replays the years
  const bendFor = (r: { status: string; annual: { years: number[]; anomalies: number[] } } | null) =>
    !p.anim && r && r.status === "ok" ? changePoint(r.annual.years, r.annual.anomalies) : null;
  const shownError = p.target ? error : null;
  const result = useMemo(
    () =>
      shown
        ? analyzeTrend(shown, { startYear: eff[0], endYear: eff[1], months: SEASONS[season] ? [...SEASONS[season]!] : undefined })
        : null,
    [shown, eff, season],
  );
  // 1.4: when did the evidence appear in the animation's range? (one test per end year, ~46 ms)
  const animFrom = p.anim?.from, animTo = p.anim?.to;
  const emerged = useMemo(
    () =>
      shown && animFrom !== undefined && animTo !== undefined && animTo - animFrom + 1 >= 10
        ? emergence(shown, { months: SEASONS[season] ? [...SEASONS[season]!] : undefined }, animFrom, animTo)
        : null,
    [shown, animFrom, animTo, season],
  );
  // the bootstrap takes ~30 ms: it runs after the card is on screen, when the browser is idle
  const [bendOf, setBendOf] = useState<{ result: typeof result; bend: ReturnType<typeof bendFor> } | null>(null);
  useEffect(() => {
    if (!result || p.anim) return;
    let dead = false;
    const run = () => !dead && setBendOf({ result, bend: bendFor(result) });
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: object) => number }).requestIdleCallback;
    const id = ric ? ric(run, { timeout: 600 }) : window.setTimeout(run, 50);
    return () => {
      dead = true;
      const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      if (ric && cic) cic(id);
      else window.clearTimeout(id);
    };
  }, [result, p.anim]); // eslint-disable-line react-hooks/exhaustive-deps
  const bend = !p.anim && bendOf && bendOf.result === result ? bendOf.bend : null;
  // rankings (Ranking.tsx): same period and season as the card
  const cardOpts = useMemo(
    () => ({ startYear: eff[0], endYear: eff[1], months: SEASONS[season] ? [...SEASONS[season]!] : undefined }),
    [eff, season],
  );
  const rankInputs: RankInputs = { lang, variable: v, opts: cardOpts, fullYears: [variables.test_years.start, variables.test_years.end], trendMap: p.trendMap, countryGrid: p.countryGrid, countryRows: p.countryRows, index: p.index, provinceFeatures: p.provinceFeatures };
  const rankScope: RankScope | null =
    p.mode !== "region" || !p.countryId ? null : p.admin1Id ? { kind: "provinces", country: p.countryId } : { kind: "countries", continent: null };
  const rankBadge = rankScope && (
    <RankBadge scope={rankScope} id={(p.admin1Id ?? p.countryId)!} inputs={rankInputs} onOpen={() => p.onDrawer("rank")} cardFromSeries={!!p.target} />
  );
  const ok = result?.status === "ok";
  const unit = unitLabel(v.unit, lang);
  const per = `${unit} / ${t(lang, "decade")}`;
  // the big number: change per decade (the trend) or the total over the period (changeView.ts)
  const [changeView] = useChangeView();
  const fullYears: [number, number] = [variables.test_years.start, variables.test_years.end];
  // the world trend map is for the whole period: total = mean slope × decades
  const areaTotal = p.area ? asView(p.area.summary.meanSlope, "total", fullYears) : 0;
  const changeToggle = <ChangeToggle lang={lang} />;
  const place = shown?.label[lang] ?? "";
  const country = p.index.find((c) => c.id === p.countryId);
  const province = p.provinces.find((a) => a.id === p.admin1Id) ?? null;
  const countryName = country?.name[lang] ?? p.countryRows.find((c) => c.id === p.countryId)?.[`name_${lang}`] ?? "";
  const areaName = !p.area
    ? ""
    : p.area.kind === "world"
      ? t(lang, "world")
      : p.area.kind === "continent"
        ? (CONTINENTS.find((c) => c.id === p.continent)?.[lang] ?? "")
        : p.area.kind === "province"
          ? `${province?.name[lang] ?? ""}${countryName ? `, ${countryName}` : ""}`
          : countryName;

  const verdict = ((): { cls: string; meaning?: string | null; body: string } | null => {
    if (!result) return null;
    if (result.status === "too_short") return { cls: "none", body: t(lang, p.anim ? "animWait" : "tooShort") };
    if (result.status === "insufficient_data") {
      // land-only variables have no values at all over atolls, sea cells and land ice
      const empty = v.land_only && shown && !Array.from(shown.values).some(Number.isFinite);
      return { cls: "none", body: t(lang, empty ? "landOnlyEmpty" : "insufficient") };
    }
    if (result.status === "constant") return { cls: "none", body: t(lang, "constant") };
    // no clear change: no direction and no number (a non-significant slope is noise)
    if (result.level === "none") return { cls: "none", body: noTrendText(lang, { start: result.startYear, end: result.endYear }) };
    const dir = result.slopePerDecade >= 0 ? "up" : "down";
    return {
      cls: result.level,
      meaning: meaningHead(lang, v.id, dir),
      body: cardText(lang, {
        varId: v.id,
        dir,
        level: result.level,
        place,
        variable: v.name[lang],
        unit,
        slope: result.slopePerDecade,
        ci: result.ci95,
        p: result.pValue,
        total: result.totalChange,
        startYear: result.startYear,
        endYear: result.endYear,
        decimals: v.decimals,
      }),
    };
  })();

  const downloadCsv = () => {
    if (!shown) return;
    const labels = monthLabels(shown);
    const anom = anomalies(shown);
    const rows = labels.map((m, k) => `${m},${Number.isFinite(shown.values[k]) ? shown.values[k] : ""},${Number.isFinite(anom[k]) ? anom[k].toFixed(4) : ""}`);
    const csv = `# ${shown.label.en} · ${v.name.en} (${v.unit}) · ${variables.dataset}\nmonth,value,anomaly_vs_1991_2020\n${rows.join("\n")}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `aeolus_${(shown.label.en || "place").replace(/[^\w]+/g, "-")}_${v.id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const hasAnswer = !!(shown && result && !shownError && verdict);
  const fullTitle = hasAnswer ? place : p.area ? areaName : p.mode === "point" ? t(lang, "modePoint") : t(lang, "world");
  // "Diyarbakır, Türkiye" → "Diyarbakır" when the trail above already says Türkiye
  const title = p.trail.length > 1 ? fullTitle.split(",")[0].trim() : fullTitle;

  // one entrance per selection: place, variable, and whether the answer is a series or a summary
  const sceneKey = `${p.mode}|${targetKey}|${p.area?.kind ?? ""}|${p.continent ?? ""}|${p.countryId ?? ""}|${p.admin1Id ?? ""}|${v.id}|${hasAnswer}`;
  const scene = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.07, delayChildren: reduce ? 0 : 0.04 } } };

  // ── PDF report (Report.tsx) ────────────────────────────────────────────────
  const fingerprintEl = p.place ? (
    <Fingerprint
      lang={lang}
      variables={variables.variables}
      current={v.id}
      target={p.target}
      opts={{ startYear: eff[0], endYear: eff[1], months: SEASONS[season] ? [...SEASONS[season]!] : undefined }}
      fullYears={[variables.test_years.start, variables.test_years.end]}
      place={p.place}
      countryGrid={p.countryGrid}
      countries={p.countryRows}
      countryId={p.countryId}
      provinceFeatures={p.provinceFeatures}
      onVariable={p.onVariable}
      onCountry={p.onCountry}
      onAdmin1={p.onAdmin1}
    />
  ) : null;
  const areaFinding =
    p.area && !hasAnswer
      ? tr
        ? `${areaName}: dünya trend haritasında sınırlar içindeki alan ortalaması 10 yılda ${smartSigned(p.area.summary.meanSlope, v.decimals + 1).replace(".", ",")} ${unit}.`
        : `${areaName}: the world trend map's area mean inside the borders is ${smartSigned(p.area.summary.meanSlope, v.decimals + 1)} ${unit} per decade.`
      : "";
  const report = printing ? (
    <Report
      lang={lang}
      variables={variables}
      variable={v}
      title={title}
      trail={p.trail.map((x) => x.label)}
      periodLabel={`${eff[0]}–${eff[1]} · ${t(lang, SEASON_LABEL[season])}`}
      finding={hasAnswer ? verdict!.body : areaFinding}
      result={hasAnswer && ok ? result : null}
      area={hasAnswer ? null : (p.area?.summary ?? null)}
      bend={bend}
      extras={
        <>
          {bend && <BendNote bend={bend} lang={lang} unit={unit} decimals={v.decimals} />}
          {rankBadge}
          {fingerprintEl}
          {hasAnswer && ok && <MonthStrip series={shown!} startYear={eff[0]} endYear={eff[1]} lang={lang} unit={unit} decimals={v.decimals} />}
        </>
      }
      onDone={() => setPrinting(false)}
    />
  ) : null;

  // ── the answer ─────────────────────────────────────────────────────────────
  const answer = hasAnswer ? (
    <div className={`verdict ${verdict!.cls}`}>
      {ok && (
        <div className="meter" role="img" aria-label={`${t(lang, "evidence")}: ${t(lang, result!.level)}`}>
          {(["none", "possible", "strong"] as const).map((lv) => (
            <span key={lv} className={`meter-step ${lv} ${result!.level === lv ? "on" : ""}`}>
              {t(lang, lv)}
            </span>
          ))}
        </div>
      )}
      {ok && verdict!.meaning && <p className="meaning">{verdict!.meaning}</p>}
      {ok && result!.level !== "none" && (
        <div className="headline">
          {changeView === "total" ? (
            <NumberTicker className="big" value={result!.totalChange} decimals={decimalsFor(result!.totalChange, v.decimals)} signed comma={tr} />
          ) : (
            <NumberTicker className="big" value={result!.slopePerDecade} decimals={decimalsFor(result!.slopePerDecade, v.decimals + 1)} signed comma={tr} />
          )}
          <span className="unit">{changeView === "total" ? `${unit} · ${result!.startYear}–${result!.endYear}` : per}</span>
          {changeToggle}
        </div>
      )}
      <p className="card-text">{verdict!.body}</p>
      {bend && <BendNote bend={bend} lang={lang} unit={unit} decimals={v.decimals} />}
      {result!.cappedReason === "badge_disagree" && (
        <p className="warn">
          <b>{t(lang, "cappedTitle")}</b> {t(lang, "cappedBadge")}
        </p>
      )}
      {/* contract 1.1: experimental variables never reach "strong"; say why */}
      {(result!.cappedReason === "experimental" || v.experimental) && v.caveat && (
        <p className="warn">
          {result!.capped && result!.cappedReason !== "badge_disagree" && <b>{t(lang, "cappedTitle")}</b>} {v.caveat[lang]}
        </p>
      )}
      {/* other known limits (precipitation, aerosol, mountain snow): a quiet note */}
      {!v.experimental && result!.cappedReason !== "experimental" && v.caveat && <p className="note">{v.caveat[lang]}</p>}
      {ok && province?.lowRes && <p className="warn">{t(lang, "lowResNote")}</p>}
      {emerged && (
        <p className="emerged">
          {emerged.possible === null && emerged.strong === null ? (
            t(lang, "emergedNever")
          ) : (
            <>
              {emerged.possible !== null && (
                <span className={animYear !== undefined && animYear >= emerged.possible ? "on" : ""}>
                  {t(lang, "emergedPossible")} <b>{emerged.possible}</b> {t(lang, "emergedSuffix")}
                </span>
              )}
              {emerged.strong !== null && (
                <span className={`strong ${animYear !== undefined && animYear >= emerged.strong ? "on" : ""}`}>
                  {t(lang, "emergedStrong")} <b>{emerged.strong}</b> {t(lang, "emergedSuffix")}
                </span>
              )}
            </>
          )}
        </p>
      )}
    </div>
  ) : p.area ? (
    <div className={`verdict area ${p.area.summary.meanSlope >= 0 ? "rising" : "falling"}`}>
      <p className="label">
        {t(lang, p.area.kind === "world" ? "meanTrendAll" : "meanTrend")}
      </p>
      <div className="headline">
        {changeView === "total" ? (
          <NumberTicker className="big" value={areaTotal} decimals={decimalsFor(areaTotal, v.decimals)} signed comma={tr} />
        ) : (
          <NumberTicker className="big" value={p.area.summary.meanSlope} decimals={decimalsFor(p.area.summary.meanSlope, v.decimals + 1)} signed comma={tr} />
        )}
        <span className="unit">{changeView === "total" ? `${unit} · ${variables.test_years.start}–${variables.test_years.end}` : per}</span>
        {changeToggle}
      </div>
      <ShareBar s={p.area.summary} lang={lang} />
      <p className="card-text">
        {p.area.kind === "province"
          ? p.area.nearest
            ? tr
              ? "Bölge bir hücreden küçük; sayı en yakın hücrenin trendi."
              : "Smaller than one grid cell; the number is the nearest cell's trend."
            : t(lang, "countryNoteNoSeries")
          : t(lang, p.area.kind === "country" ? (country ? "countryNoteSeries" : "countryNoteNoSeries") : p.area.kind === "world" ? "worldNote" : "continentNote")}
      </p>
      {(years[0] !== variables.test_years.start || years[1] !== variables.test_years.end) && (
        <p className="fine">
          {tr
            ? `Bu özet ${variables.test_years.start}–${variables.test_years.end} için; seçilen dönem haritada gösteriliyor.`
            : `This summary is for ${variables.test_years.start}–${variables.test_years.end}; the chosen period is shown on the map.`}
        </p>
      )}
    </div>
  ) : (
    <Card className="verdict idle">
      {shownError ? (
        <p className="alert">{shownError}</p>
      ) : loading ? (
        <TextShimmer>{tr ? "Aylık seri yükleniyor…" : "Loading the monthly series…"}</TextShimmer>
      ) : (
        <>
          <p className="card-text">{p.mode === "point" ? (tr ? "Globda bir kareye tıkla: o ızgara hücresinin 1980'den bugüne serisi burada hesaplanır." : "Click a square on the globe: that grid cell's series since 1980 is analysed here.") : t(lang, "pickPrompt")}</p>
          <Demos demos={p.demos} />
        </>
      )}
    </Card>
  );

  // ── side menu (React Bits FlowingMenu): one row per topic, the answer on the right; ──
  // ── a row opens its details in the drawer on the left                                ──
  const wantsMaps = !isPhone || openRow === "fingerprint" || openRow === "similar";
  const fp = useFingerprint(
    { lang, variables: variables.variables, target: p.target, opts: cardOpts, place: p.place, countryGrid: p.countryGrid, countries: p.countryRows, countryId: p.countryId, provinceFeatures: p.provinceFeatures },
    !!p.place && wantsMaps,
  );
  const months = useMemo(
    () => (hasAnswer && ok && !p.anim && shown ? monthlyTrends(shown, { startYear: eff[0], endYear: eff[1] }) : null),
    [hasAnswer, ok, p.anim, shown, eff],
  );
  const fmtS = (x: number, d: number) => (tr ? smartSigned(x, d).replace(".", ",") : smartSigned(x, d));

  const trendTitle = tr ? `${v.name[lang]} trendi` : `${v.name[lang]} trend`;
  const menuItems: FlowItem[] = [];
  if (hasAnswer || p.area) {
    const slope = hasAnswer ? (ok ? result!.slopePerDecade : NaN) : p.area!.summary.meanSlope;
    const level = hasAnswer ? (ok ? result!.level : "none") : "possible";
    const dir = !Number.isFinite(slope) || level === "none" ? "flat" : slope > 0 ? "up" : "down";
    const word = hasAnswer
      ? verdict!.meaning ?? (level === "none" ? (tr ? "Belirgin değişim yok" : "No clear change") : t(lang, level))
      : t(lang, p.area!.kind === "world" ? "meanTrendAll" : "meanTrend");
    const showNum = Number.isFinite(slope) && (level !== "none" || !hasAnswer);
    menuItems.push({
      id: "trend",
      icon: VAR_ICONS[v.id],
      title: trendTitle,
      // closed: only the number (per decade or total, as the card's toggle says); open: the card
      // below shows the word, the number and the toggle, so the row keeps only its title
      feature:
        openRow === "trend" ? undefined : showNum ? (
          (() => {
            const total = changeView === "total";
            const value = total ? (hasAnswer ? result!.totalChange : areaTotal) : slope;
            const span = hasAnswer ? `${result!.startYear}–${result!.endYear}` : `${variables.test_years.start}–${variables.test_years.end}`;
            return (
              <span className="feat">
                <span className={`feat-num ${dir}`}>
                  <NumberTicker className="big" value={value} decimals={decimalsFor(value, total ? v.decimals : v.decimals + 1)} signed comma={tr} />
                  <small>
                    {total ? `${unit} · ${span}` : per}
                    {season !== "all" && <span className="feat-season"> · {t(lang, SEASON_LABEL[season])}</span>}
                  </small>
                </span>
              </span>
            );
          })()
        ) : (
          <span className="feat">
            <span className={`feat-word ${dir}`}>{word}</span>
          </span>
        ),
      content: answer,
      onClick: () => setOpenRow(openRow === "trend" ? null : "trend"),
    });
  }
  const menuView = view === "seasons" ? "anomaly" : view;
  // the chart: its own row, fourth (after the fingerprint and similar places)
  const graphItem: FlowItem | null =
    hasAnswer && ok
      ? {
          id: "graph",
          icon: "chart",
          title: tr ? "Grafik" : "Chart",
          sub: tr ? `Yıllık fark ve eğilim, ${eff[0]}–${eff[1]}` : `Yearly difference and trend, ${eff[0]}–${eff[1]}`,
          content: (
            <>
              <AnimatedTabs size="sm" tabs={(["anomaly", "raw"] as const).map((k) => ({ id: k, label: t(lang, k) }))} value={menuView} onChange={setView} />
              <Chart series={shown!} result={result!} view={menuView} unit={unit} decimals={v.decimals} startYear={eff[0]} endYear={eff[1]} lang={lang} bendYear={bend?.year} />
              <button className="link-btn" onClick={() => p.onDrawer("chart")}>
                <Icon name="expand" size={14} /> {tr ? "Dönem ve mevsim ayarlarıyla aç" : "Open with period and season controls"}
              </button>
            </>
          ),
          onClick: () => setOpenRow(openRow === "graph" ? null : "graph"),
        }
      : null;
  if (!p.place && graphItem) menuItems.push(graphItem);
  if (p.place) {
    const tested = fp.rows.filter((r) => r.slope !== null);
    const clear = tested.filter((r) => r.level === "strong").length;
    menuItems.push({
      id: "fingerprint",
      icon: "grid",
      title: tr ? "İklim parmak izi" : "Climate fingerprint",
      sub: fp.ready && fp.insights[0] ? fp.insights[0].text[lang] : tr ? "9 değişken bir arada" : "All 9 variables together",
      value: fp.ready ? (
        <>
          <b>
            {clear}/{tested.length}
          </b>
          <small>{tr ? "net değişen" : "clearly changing"}</small>
        </>
      ) : (
        <>
          <b>—</b>
          <small>{tr ? "aç ve hesapla" : "open to compute"}</small>
        </>
      ),
      content: <FingerprintTable data={fp} lang={lang} variables={variables.variables} current={v.id} onVariable={p.onVariable} years={eff} fullYears={fullYears} />,
      onClick: () => setOpenRow(openRow === "fingerprint" ? null : "fingerprint"),
    });
    const top = fp.similar.near[0] ?? fp.similar.world[0];
    menuItems.push({
      id: "similar",
      icon: "globe",
      title: tr ? "Benzer yerler" : "Similar places",
      sub: top ? (
        <>
          {tr ? "En yakın: " : "Closest: "}
          <b>{top.name[lang]}</b>
        </>
      ) : fp.ready ? (
        tr ? "Yeterince benzeyen yer yok" : "No close match"
      ) : tr ? (
        "Aynı şekilde değişen yerler"
      ) : (
        "Places changing the same way"
      ),
      value: top ? (
        <>
          <b>%{Math.min(99, Math.round(top.score * 100))}</b>
          <small>{tr ? "benzerlik" : "alike"}</small>
        </>
      ) : undefined,
      content: <SimilarPlaces data={fp} lang={lang} onCountry={p.onCountry} onAdmin1={p.onAdmin1} />,
      onClick: () => setOpenRow(openRow === "similar" ? null : "similar"),
    });
    if (graphItem) menuItems.push(graphItem);
  }
  if (months) {
    const fastest = months
      .filter((m) => Number.isFinite(m.slope) && (m.level === "strong" || m.level === "possible"))
      .sort((a, b) => Math.abs(b.slope) - Math.abs(a.slope))[0];
    menuItems.push({
      id: "months",
      icon: "clock",
      title: tr ? "Aylara göre" : "By month",
      sub: fastest ? (tr ? "En hızlı değişen ay" : "The fastest-changing month") : tr ? "Hiçbir ayda net değişim yok" : "No month changes clearly",
      value: fastest ? (
        <>
          <b className={fastest.slope >= 0 ? "up" : "down"}>{MONTHS[lang][fastest.month - 1]}</b>
          <small>
            {fmtS(fastest.slope, v.decimals + 1)} {unit}
          </small>
        </>
      ) : (
        <>
          <b>—</b>
          <small>{tr ? "12 test" : "12 tests"}</small>
        </>
      ),
      content: (
        <>
          <h3 className="fm-sec">{t(lang, "seasons")}</h3>
          <Chart series={shown!} result={result!} view="seasons" unit={unit} decimals={v.decimals} startYear={eff[0]} endYear={eff[1]} lang={lang} />
          <h3 className="fm-sec">{tr ? "Her ayın kendi eğilimi" : "Each month's own trend"}</h3>
          <MonthStrip series={shown!} startYear={eff[0]} endYear={eff[1]} lang={lang} unit={unit} decimals={v.decimals} />
        </>
      ),
      onClick: () => setOpenRow(openRow === "months" ? null : "months"),
    });
  }
  // ── drawer contents ───────────────────────────────────────────────────────
  const chartPane = hasAnswer ? (
    <>
      <h2>{place}</h2>
      <AnimatedTabs tabs={(["anomaly", "raw", "seasons"] as const).map((k) => ({ id: k, label: t(lang, k) }))} value={view} onChange={setView} />
      <Chart series={shown!} result={result!} view={view} unit={unit} decimals={v.decimals} startYear={eff[0]} endYear={eff[1]} lang={lang} bendYear={bend?.year} />
      <div className="controls">
        <YearRange min={variables.test_years.start} max={variables.test_years.end} value={years} onChange={setYears} lang={lang} />
      </div>
      <button className="link-btn" onClick={downloadCsv}>
        <Icon name="download" size={15} /> {t(lang, "downloadCsv")}
      </button>
      <section className="source">
        <h3>{t(lang, "aboutData")}</h3>
        <Provenance variables={variables} lang={lang} />
      </section>
    </>
  ) : (
    <div className="empty">
      <Icon name="chart" size={26} />
      <p>{t(lang, "chartEmpty")}</p>
      <Demos demos={p.demos} />
    </div>
  );

  const explorePane = (
    <>
      <section className="varinfo">
        <span className="varinfo-icon">
          <Icon name={VAR_ICONS[v.id]} size={18} />
        </span>
        <div>
          <strong>{v.name[lang]}</strong> <span className="unit">{unit}</span>
          {v.land_only && <span className="tag">{t(lang, "landOnly")}</span>}
          {v.experimental && <span className="tag exp">{t(lang, "experimentalTag")}</span>}
          <p>{v.description[lang]}</p>
        </div>
      </section>
      <section>
        <h3>{t(lang, "curious")}</h3>
        <div className="questions">
          {QUESTIONS.map((q) => (
            <button key={q.id} className={`qchip ${p.question?.id === q.id ? "on" : ""}`} onClick={() => p.onQuestion(p.question?.id === q.id ? null : q)}>
              <Icon name={q.icon} size={14} /> {q.q[lang]}
            </button>
          ))}
        </div>
        {p.question && <p className="qtip">{p.question.tip[lang]}</p>}
      </section>
      {p.mode === "region" && (
        <section>
          <h3>{t(lang, "continents")}</h3>
          <div className="chips">
            {CONTINENTS.map((c) => (
              <button key={c.id} className={`chip ${c.id === p.continent ? "on" : ""}`} onClick={() => p.onContinent(c.id)}>
                {c[lang]}
              </button>
            ))}
          </div>
        </section>
      )}
      <section>
        <h3>{t(lang, "demos")}</h3>
        <Demos demos={p.demos} />
      </section>
    </>
  );

  const rankPane = (
    <RankingPane {...rankInputs} countryId={p.countryId} continent={p.continent} selected={p.admin1Id ?? p.countryId} onCountry={p.onCountry} onAdmin1={p.onAdmin1} />
  );

  const sourcesPane = (
    <>
      <section>
        <h3>{t(lang, "aboutData")}</h3>
        <Provenance variables={variables} lang={lang} />
      </section>
      <section>
        <h3>{t(lang, "sources")}</h3>
        <References lang={lang} />
      </section>
    </>
  );

  return (
    <>
      {report}
      <AnimatePresence initial={false}>
      {p.open && (
      <motion.aside
        className={`side ${sheetOpen ? "sheet-open" : ""}`}
        aria-live="polite"
        initial={reduce ? false : { x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={reduce ? undefined : { x: 40, opacity: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
      >
        {/* phones and tablets: the column is a bottom sheet; this handle makes it taller or shorter */}
        <button className="sheet-grab" onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen} aria-label={tr ? (sheetOpen ? "Paneli küçült" : "Paneli büyüt") : sheetOpen ? "Shrink the panel" : "Expand the panel"} />
        <header className="side-head">
          <div className="head-actions">
            {(hasAnswer || p.area) && (
              <button className="icon-btn" onClick={() => setPrinting(true)} aria-label={tr ? "Rapor (PDF)" : "Report (PDF)"} data-tip={tr ? "Rapor (PDF)" : "Report (PDF)"}>
                <Icon name="download" size={16} />
              </button>
            )}
            <button className="icon-btn" onClick={p.onClose} aria-label={t(lang, "closePanel")}>
              <Icon name="close" size={16} />
            </button>
          </div>
          <nav className="trail" aria-label="breadcrumb">
            {p.trail.slice(0, -1).map((s, i) => (
              <button key={i} className="crumb" onClick={s.go}>
                {s.label}
              </button>
            ))}
          </nav>
          {/* React Bits BlurText (subtle): the place name settles in on every selection */}
          <h1 key={title}>
            <BlurText text={title} animateBy="words" trigger="load" direction="bottom" delay={50} blur={6} distance={6} stepDuration={0.22} />
          </h1>
          {v.experimental && (
            <p className="eyebrow">
              <span className="tag exp">{t(lang, "experimentalTag")}</span>
            </p>
          )}
          {hasAnswer && (
            <div className="side-season" title={t(lang, "seasonHint")}>
              <AnimatedTabs
                size="sm"
                label={t(lang, "season")}
                tabs={(["all", "winter", "spring", "summer", "autumn"] as const).map((x) => ({ id: x, label: t(lang, SEASON_LABEL[x]) }))}
                value={season}
                onChange={setSeason}
              />
            </div>
          )}
        </header>
        {menuItems.length ? (
          <FlowingMenu items={menuItems} active={openRow} label={tr ? "Analiz" : "Analysis"} />
        ) : (
          <motion.div key={sceneKey} className="side-body" variants={scene} initial="hidden" animate="show">
            {answer}
          </motion.div>
        )}
      </motion.aside>
      )}
      </AnimatePresence>

      <AnimatePresence>
        {p.drawer && (
          <motion.aside
            className="drawer"
            initial={reduce ? false : { x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? undefined : { x: -40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
          >
            <div className="drawer-head">
              <AnimatedTabs
                tabs={DRAWER_TABS.map((x) => ({ id: x.id, label: <><Icon name={x.icon} size={14} /> {x.label ? x.label[lang] : t(lang, x.key!)}</> }))}
                value={p.drawer}
                onChange={p.onDrawer}
              />
              <button className="icon-btn" onClick={() => p.onDrawer(null)} aria-label={t(lang, "close")}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="drawer-body">{{ chart: chartPane, explore: explorePane, sources: sourcesPane, rank: rankPane }[p.drawer]}</div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

function ShareBar({ s, lang }: { s: AreaSummary; lang: Lang }) {
  const parts = [
    { key: "strongUp", share: s.strongUp, cls: "share-up" },
    { key: "possibleShare", share: s.possible, cls: "share-maybe" },
    { key: "noneShare", share: s.none, cls: "share-flat" },
    { key: "strongDown", share: s.strongDown, cls: "share-down" },
  ] as const;
  return (
    <>
      <div className="sharebar" role="img" aria-label={parts.map((x) => `${t(lang, x.key)} ${pct(x.share)}`).join(", ")}>
        {parts.map((x) => (
          <motion.span key={x.key} className={x.cls} initial={{ flexGrow: 0 }} animate={{ flexGrow: x.share }} transition={{ duration: 0.7, ease: EASE }} />
        ))}
      </div>
      <ul className="sharelegend">
        {parts.map((x) => (
          <li key={x.key}>
            <i className={x.cls} /> {t(lang, x.key)} <b>{pct(x.share)}</b>
          </li>
        ))}
      </ul>
    </>
  );
}

function Demos({ demos }: { demos: { label: string; go: () => void }[] }) {
  return (
    <div className="chips">
      {demos.map((d) => (
        <button key={d.label} className="chip demo" onClick={d.go}>
          {d.label}
        </button>
      ))}
    </div>
  );
}
