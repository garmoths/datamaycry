/**
 * The analysis column on the right of the globe, read top to bottom:
 *   where am I → the answer → the calculation behind it → its shape over time →
 *   the provinces of this country → how it was checked.
 * Every selection replays a short staggered entrance, so a change of place is felt.
 * The drawer (full chart / explore / sources) slides in from the left only when asked.
 *
 * Two kinds of answers:
 *  - a monthly series (the places in regions/index.json, continents, grid cells): the full
 *    Mann-Kendall + Sen calculation is run here and shown step by step (diagnostics.ts);
 *  - every other place (world, any country, any province): a summary of the world trend
 *    map inside its borders, with the spread of the cell slopes (continentStats.ts).
 *
 * Written with AI assistance (Claude).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
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
} from "./data.ts";
import { Chart, type ChartView } from "./Chart.tsx";
import { cardText, decimalsFor, meaningHead, noTrendText, robustText, smartFixed, smartSigned, t, unitLabel, type Lang, type StringKey } from "./i18n.ts";
import { emergence, robustness, SEASONS, type Season } from "./trend.ts";

const SEASON_LABEL: Record<Season, StringKey> = {
  all: "seasonAll", winter: "seasonWinter", spring: "seasonSpring", summer: "seasonSummer", autumn: "seasonAutumn",
};
import { CONTINENTS, type Node } from "./geo.ts";
import { ScaleLadder } from "./ScaleLadder.tsx";
import { NumberTicker } from "./NumberTicker.tsx";
import type { AreaSummary } from "./continentStats.ts";
import { diagnose } from "./diagnostics.ts";
import { Icon, type IconName } from "./icons.tsx";
import { QUESTIONS, VAR_ICONS, monthLabel, type Question } from "./content.ts";
import { BadgeList, Provenance, ProvinceSelect, References, Sparkline, type ProvinceItem } from "./Evidence.tsx";
import { CiBar, Gates, Histogram, StatGrid, ZCurve } from "./MathViz.tsx";
import { Spotlight } from "./Spotlight.tsx";
import { Disclosure } from "./Disclosure.tsx";
import BlurText from "./reactbits/BlurText.tsx";
import { TextShimmer } from "./amicro/TextShimmer.tsx";

/** Signed number with the variable's decimals; Turkish uses a decimal comma. */
const fmtSignedIn = (lang: Lang) => (x: number, d: number) => {
  const s = smartSigned(x, d);
  return lang === "tr" ? s.replace(".", ",") : s;
};

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

export type DrawerTab = "chart" | "explore" | "sources";

interface Props {
  lang: Lang;
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
}

const DRAWER_TABS: { id: DrawerTab; icon: IconName; key: "tabChart" | "tabExplore" | "sources" }[] = [
  { id: "chart", icon: "chart", key: "tabChart" },
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
  const fmtSigned = fmtSignedIn(lang);
  const [series, setSeries] = useState<Series | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ChartView>("anomaly");
  const reduce = useReducedMotion();
  const [season, setSeason] = useState<Season>("all");
  const [years, setYears] = useState<[number, number]>([variables.test_years.start, variables.test_years.end]);
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
  // Start/end-year sensitivity (display only): same test with the period moved by 5 years
  const robust = useMemo(
    () =>
      shown && result && result.status === "ok"
        ? robustness(shown, { months: SEASONS[season] ? [...SEASONS[season]!] : undefined }, result, variables.test_years)
        : null,
    [shown, result, season, variables.test_years],
  );
  const diag = useMemo(() => (result ? diagnose(result) : null), [result]);
  const ok = result?.status === "ok";
  const unit = unitLabel(v.unit, lang);
  const per = `${unit} / ${t(lang, "decade")}`;
  const place = shown?.label[lang] ?? "";
  const country = p.index.find((c) => c.id === p.countryId);
  const province = p.provinces.find((a) => a.id === p.admin1Id) ?? null;
  const countryName = country?.name[lang] ?? p.countryRows.find((c) => c.id === p.countryId)?.[`name_${lang}`] ?? "";
  const countriesHere = p.countryRows
    .filter((c) => c.continent === p.continent)
    .sort((a, b) => a[`name_${lang}`].localeCompare(b[`name_${lang}`], lang));
  const dataIds = new Set(p.index.map((c) => c.id));
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
    if (result.status === "insufficient_data") return { cls: "none", body: t(lang, "insufficient") };
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
    a.download = `data-may-cry_${(shown.label.en || "place").replace(/[^\w]+/g, "-")}_${v.id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const period = `${monthLabel(variables.period.start, lang)} – ${monthLabel(variables.period.end, lang)}`;
  const hasAnswer = !!(shown && result && !shownError && verdict);
  const title = hasAnswer ? place : p.area ? areaName : p.mode === "point" ? t(lang, "modePoint") : t(lang, "world");
  const f1 = (x: number) => fmtSigned(x, v.decimals + 1);

  // one entrance per selection: place, variable, and whether the answer is a series or a summary
  const sceneKey = `${p.mode}|${targetKey}|${p.area?.kind ?? ""}|${p.continent ?? ""}|${p.countryId ?? ""}|${p.admin1Id ?? ""}|${v.id}|${hasAnswer}`;
  const scene = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.07, delayChildren: reduce ? 0 : 0.04 } } };

  // ── the answer ─────────────────────────────────────────────────────────────
  const answer = hasAnswer ? (
    <Card className={`verdict ${verdict!.cls}`}>
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
        <>
          <p className="label">{t(lang, "slopeLabel")}</p>
          <div className="headline">
            <NumberTicker className="big" value={result!.slopePerDecade} decimals={decimalsFor(result!.slopePerDecade, v.decimals + 1)} signed comma={tr} />
            <span className="unit">{per}</span>
          </div>
        </>
      )}
      <p className="card-text">{verdict!.body}</p>
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
      {province?.lowRes && <p className="warn">{t(lang, "lowResNote")}</p>}
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
      {ok && !p.anim && robust && robust.windows.length > 0 && (
        <p className={robust.same === robust.windows.length ? "note" : "warn"} title={t(lang, "robustTitle")}>
          {robustText(lang, robust.same, robust.windows.length)}
        </p>
      )}
    </Card>
  ) : p.area ? (
    <Card className={`verdict area ${p.area.summary.meanSlope >= 0 ? "rising" : "falling"}`}>
      <p className="label">
        {t(lang, p.area.kind === "world" ? "meanTrendAll" : "meanTrend")} · {t(lang, "slopeLabel").toLowerCase()}
      </p>
      <div className="headline">
        <NumberTicker className="big" value={p.area.summary.meanSlope} decimals={decimalsFor(p.area.summary.meanSlope, v.decimals + 1)} signed comma={tr} />
        <span className="unit">{per}</span>
      </div>
      <ShareBar s={p.area.summary} lang={lang} />
      <p className="card-text">
        {p.area.kind === "province"
          ? p.area.nearest
            ? tr
              ? "Bu bölge bir ızgara hücresinden küçük; sayı, merkezine en yakın tek hücrenin trendi."
              : "This region is smaller than one grid cell; the number is the trend of the single cell nearest its centre."
            : tr
              ? `Sınırları içindeki ${p.area.summary.cells} ızgara hücresinin dünya trend haritasındaki değerlerinden. Bu bölgenin aylık serisi henüz veride yok.`
              : `From the world trend map values of the ${p.area.summary.cells} grid cells inside its borders. A monthly series for this region is not in the data yet.`
          : t(lang, p.area.kind === "country" ? (country ? "countryNoteSeries" : "countryNoteNoSeries") : p.area.kind === "world" ? "worldNote" : "continentNote")}
      </p>
    </Card>
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

  // ── the calculation ────────────────────────────────────────────────────────
  const math =
    hasAnswer && ok && diag ? (
      <Card className="math disclosure">
        <Disclosure title={tr ? "Nasıl hesaplandı?" : "How was this calculated?"} hint="Mann-Kendall · Sen">
        <ZCurve z={diag.z} p={diag.p} lang={lang} />
        <StatGrid
          items={[
            { label: tr ? "Yıl (n)" : "Years (n)", value: diag.n, hint: tr ? "Teste giren tam yıl sayısı" : "Complete years in the test" },
            { label: tr ? "Yıl çifti" : "Year pairs", value: diag.pairs.toLocaleString(lang), hint: "n·(n−1)/2" },
            { label: "S", value: `${diag.s > 0 ? "+" : ""}${diag.s}`, hint: tr ? "Artan çift − azalan çift" : "Rising pairs − falling pairs" },
            { label: "Kendall τ", value: smartSigned(diag.tau, 2), hint: tr ? "S ÷ çift sayısı: −1 hep azalış, +1 hep artış" : "S ÷ pairs: −1 always falling, +1 always rising" },
            { label: "Z", value: smartSigned(diag.z, 2), hint: "(S ∓ 1) / √Var(S)" },
            { label: "p", value: diag.p < 0.001 ? "< 0.001" : diag.p.toFixed(3), hint: t(lang, "statNote") },
          ]}
        />
        <h4>{tr ? "Sen eğimi ve %95 aralığı" : "Sen's slope and its 95 % range"}</h4>
        <CiBar slope={diag.slopePerDecade} ci={diag.ci95} unit={per} decimals={v.decimals} lang={lang} />
        <StatGrid
          items={[
            { label: tr ? "Eğim / 10 yıl" : "Slope / decade", value: f1(diag.slopePerDecade), hint: tr ? "Tüm yıl çiftlerinin eğimlerinin ortancası" : "Median of the slopes of all year pairs" },
            { label: tr ? "Toplam değişim" : "Total change", value: result!.level === "none" ? t(lang, "unclear") : `${fmtSigned(result!.totalChange, v.decimals)} ${unit}`, hint: `${result!.startYear}–${result!.endYear}` },
            { label: tr ? "Otokorelasyon r₁" : "Autocorrelation r₁", value: diag.r1.toFixed(2), hint: tr ? "Bir yılın bir sonrakine benzerliği; aralığı genişletir" : "How much one year resembles the next; widens the range" },
            { label: tr ? "Etkili yıl" : "Effective years", value: diag.nEff.toFixed(1), hint: "n·(1−r₁)/(1+r₁)" },
            { label: tr ? "Gürültü (σ)" : "Noise (σ)", value: `${smartFixed(diag.noise, v.decimals + 1)} ${unit}`, hint: tr ? "Yıllık değerlerin trend çizgisi etrafındaki yayılımı" : "Spread of the annual values around the trend line" },
            { label: tr ? "Sinyal / gürültü" : "Signal / noise", value: diag.snr.toFixed(1), hint: tr ? "|Toplam değişim| ÷ gürültü" : "|Total change| ÷ noise" },
          ]}
        />
        <h4>{tr ? "Etikete giden kontroller" : "Checks behind the label"}</h4>
        <Gates d={diag} lang={lang} />
        {result!.capped && <p className="fine">{tr ? "Dört kontrol de geçti, ama etiket bilerek “olası”da tutuldu (yukarıdaki nota bak)." : "All four checks pass, but the label is deliberately kept at “possible” (see the note above)."}</p>}
        </Disclosure>
      </Card>
    ) : p.area ? (
      <Card className="math disclosure">
        <Disclosure
          title={tr ? "Hücre eğimlerinin dağılımı" : "Spread of the cell slopes"}
          hint={`${p.area.summary.cells.toLocaleString(lang)} ${tr ? "hücre" : p.area.summary.cells === 1 ? "cell" : "cells"}`}
        >
        {p.area.summary.cells > 1 && <Histogram s={p.area.summary} unit={per} decimals={v.decimals} lang={lang} />}
        <StatGrid
          items={[
            { label: tr ? "Ortalama" : "Mean", value: f1(p.area.summary.meanSlope), hint: tr ? "Alan ağırlıklı (cos enlem)" : "Area-weighted (cos latitude)" },
            { label: tr ? "Ortanca" : "Median", value: f1(p.area.summary.median) },
            { label: tr ? "Yayılım (σ)" : "Spread (σ)", value: smartFixed(p.area.summary.sd, v.decimals + 1) },
            { label: tr ? "Ortadaki %80" : "Middle 80 %", value: `${f1(p.area.summary.p10)} … ${f1(p.area.summary.p90)}`, wide: true, hint: tr ? "Alanın %10'u bunun altında, %10'u üstünde" : "10 % of the area lies below, 10 % above" },
            { label: tr ? "Artan alan" : "Area rising", value: pct(p.area.summary.upShare), hint: tr ? "Eğimi sıfırın üstünde olan alan" : "Area whose slope is above zero" },
            { label: tr ? "Çoklu test sonrası anlamlı" : "Significant after FDR", value: pct(p.area.summary.fdrShare), wide: true, hint: tr ? "Çoklu test düzeltmesinden (Benjamini-Hochberg) sonra da anlamlı kalan alan" : "Area still significant after the multiple-testing correction (Benjamini-Hochberg)" },
            { label: tr ? "Dönem" : "Period", value: `${variables.test_years.start}–${variables.test_years.end}` },
          ]}
        />
        <p className="fine">
          {tr
            ? `Her hücrede ${variables.test_years.start}–${variables.test_years.end} yıllık anomalilerine Mann-Kendall testi ve Sen eğimi uygulandı; birim ${per}.`
            : `Each cell: Mann-Kendall test and Sen's slope on its ${variables.test_years.start}–${variables.test_years.end} annual anomalies; unit ${per}.`}
        </p>
        </Disclosure>
      </Card>
    ) : null;

  // ── shape over time ────────────────────────────────────────────────────────
  const shape =
    hasAnswer && ok ? (
      <Card className="shape">
        <header className="card-head">
          <h3>
            {result!.startYear}–{result!.endYear}
          </h3>
          <button className="link-btn" onClick={() => p.onDrawer("chart")}>
            <Icon name="expand" size={14} /> {tr ? "Grafiği aç" : "Open chart"}
          </button>
        </header>
        <Sparkline result={result!} unit={unit} lang={lang} />
      </Card>
    ) : null;

  // ── where next ─────────────────────────────────────────────────────────────
  const next =
    p.mode === "point" ? (
      <Card className="ladder-card">
        <header className="card-head">
          <h3>{t(lang, "scales")}</h3>
        </header>
        <ScaleLadder lang={lang} path={p.path} onGo={p.onScale} />
      </Card>
    ) : p.countryId ? (
      <Card className="places">
        <header className="card-head">
          <h3>{t(lang, "provinces")}</h3>
          <span className="pill">{p.provinces.length || "…"}</span>
        </header>
        {p.provinces.length ? (
          <ProvinceSelect lang={lang} countryId={p.countryId} rows={p.provinces} value={p.admin1Id} onCountry={p.onCountry} onAdmin1={p.onAdmin1} />
        ) : (
          <TextShimmer>{tr ? "İller yükleniyor…" : "Loading provinces…"}</TextShimmer>
        )}
      </Card>
    ) : (
      <Card className="places">
        <header className="card-head">
          <h3>{t(lang, p.continent ? "countries" : "continents")}</h3>
          {p.continent && <span className="pill">{countriesHere.length}</span>}
        </header>
        <div className="chips scroll">
          {p.continent
            ? countriesHere.map((c) => (
                <button key={c.id} className="chip" onClick={() => p.onCountry(c.id)}>
                  {c[`name_${lang}`]}
                  {dataIds.has(c.id) && <i className="data-dot" />}
                </button>
              ))
            : CONTINENTS.map((c) => (
                <button key={c.id} className="chip" onClick={() => p.onContinent(c.id)}>
                  {c[lang]}
                </button>
              ))}
        </div>
      </Card>
    );

  // ── how it was checked ─────────────────────────────────────────────────────
  const checks = (
    <Card className="checks">
      {hasAnswer && ok && result!.badges && result!.badges.length > 0 && (
        <div className="checks-fold">
          <Disclosure title={t(lang, "checksTitle")} hint={`${result!.badges.length}`}>
            <BadgeList badges={result!.badges} lang={lang} decimals={v.decimals} />
          </Disclosure>
        </div>
      )}
      <p className="prov-line">
        <Icon name="book" size={14} />
        <span>
          {variables.is_mock ? (tr ? "Demo veri" : "Demo data") : "NASA MERRA-2 v5.12.4"} · {period} · {tr ? "referans" : "baseline"} {variables.baseline_years.start}–{variables.baseline_years.end}
        </span>
      </p>
      <button className="link-btn" onClick={() => p.onDrawer("sources")}>
        {t(lang, "allSources")}
      </button>
    </Card>
  );

  // ── drawer contents ───────────────────────────────────────────────────────
  const chartPane = hasAnswer ? (
    <>
      <p className="eyebrow">{v.name[lang]}</p>
      <h2>{place}</h2>
      <div className="seg" role="group">
        {(["anomaly", "raw", "seasons"] as const).map((k) => (
          <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>
            {t(lang, k)}
          </button>
        ))}
      </div>
      <Chart series={shown!} result={result!} view={view} unit={unit} decimals={v.decimals} startYear={eff[0]} endYear={eff[1]} lang={lang} />
      <div className="controls">
        <label>
          {t(lang, "period")} <b>{years[0]}–{years[1]}</b>
          <div className="range2">
            <input type="range" aria-label="start year" min={variables.test_years.start} max={variables.test_years.end} value={years[0]} onChange={(e) => setYears([Math.min(+e.target.value, years[1]), years[1]])} />
            <input type="range" aria-label="end year" min={variables.test_years.start} max={variables.test_years.end} value={years[1]} onChange={(e) => setYears([years[0], Math.max(+e.target.value, years[0])])} />
          </div>
        </label>
        <div>
          {t(lang, "season")}
          <div className="seg small" role="group">
            {(["all", "winter", "spring", "summer", "autumn"] as const).map((s) => (
              <button key={s} className={season === s ? "on" : ""} onClick={() => setSeason(s)}>
                {t(lang, SEASON_LABEL[s])}
              </button>
            ))}
          </div>
          <p className="fine">{t(lang, "seasonHint")}</p>
        </div>
      </div>
      {v.caveat && <p className="note">{v.caveat[lang]}</p>}
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
      <motion.aside className="side" aria-live="polite" initial={reduce ? false : { x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.7, ease: EASE, delay: 0.25 }}>
        <header className="side-head">
          <nav className="trail" aria-label="breadcrumb">
            {p.trail.map((s, i) => (
              <button key={i} className="crumb" onClick={s.go} disabled={i === p.trail.length - 1}>
                {s.label}
              </button>
            ))}
          </nav>
          {/* React Bits BlurText (subtle): the place name settles in on every selection */}
          <h1 key={title}>
            <BlurText text={title} animateBy="words" trigger="load" direction="bottom" delay={50} blur={6} distance={6} stepDuration={0.22} />
          </h1>
          <p className="eyebrow">
            <Icon name={VAR_ICONS[v.id]} size={14} /> {v.name[lang]}
            <span className="unit">{unit}</span>
            {v.experimental && <span className="tag exp">{t(lang, "experimentalTag")}</span>}
            {hasAnswer && province && <span className="tag">{tr ? "aylık seri" : "monthly series"}</span>}
            {!hasAnswer && p.area && <span className="tag">{tr ? "trend haritası" : "trend map"}</span>}
          </p>
        </header>
        <motion.div key={sceneKey} className="side-body" variants={scene} initial="hidden" animate="show">
          {answer}
          {shape}
          {math}
        </motion.div>
        {/* not re-keyed: the province filter and its scroll position survive a selection */}
        <motion.div className="side-body" variants={scene} initial="hidden" animate="show">
          {next}
          {checks}
        </motion.div>
      </motion.aside>

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
              <div className="seg" role="tablist">
                {DRAWER_TABS.map((x) => (
                  <button key={x.id} role="tab" aria-selected={p.drawer === x.id} className={p.drawer === x.id ? "on" : ""} onClick={() => p.onDrawer(x.id)}>
                    <Icon name={x.icon} size={14} /> {t(lang, x.key)}
                  </button>
                ))}
              </div>
              <button className="icon-btn" onClick={() => p.onDrawer(null)} aria-label={t(lang, "close")}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="drawer-body">{{ chart: chartPane, explore: explorePane, sources: sourcesPane }[p.drawer]}</div>
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
