/**
 * Right-hand inspector: one card with three tabs — Summary · Chart · Explore.
 * The tab bar is a port of Pin UI "LiquidTabs" (ui-lab: src/components/pinui/LiquidTabs.tsx):
 * the card body and the active tab are drawn as two shapes merged by an SVG goo filter, so
 * the active tab reads as a folder tab that flows along the bar when you switch.
 * Written with AI assistance (Claude).
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  analyzeTrend,
  getPointSeries,
  getRegionSeries,
  getContinentSeries,
  type ContinentId,
  monthLabels,
  anomalies,
  type CountryInfo,
  type Series,
  type TrendLevel,
  type VariablesFile,
  type VariableInfo,
} from "./data.ts";
import { Chart, type ChartView } from "./Chart.tsx";
import { cardText, chanceText, decimalsFor, meaningHead, noTrendText, robustText, smartSigned, t, unitLabel, type Lang, type StringKey } from "./i18n.ts";
import { emergence, robustness, SEASONS, type Season } from "./trend.ts";

const SEASON_LABEL: Record<Season, StringKey> = {
  all: "seasonAll", winter: "seasonWinter", spring: "seasonSpring", summer: "seasonSummer", autumn: "seasonAutumn",
};
import { CONTINENTS, type Node } from "./geo.ts";
import { ScaleLadder } from "./ScaleLadder.tsx";
import { NumberTicker } from "./NumberTicker.tsx";
import type { AreaSummary } from "./continentStats.ts";
import { PlaceSearch } from "./PlaceSearch.tsx";
import { Icon, type IconName } from "./icons.tsx";
import { QUESTIONS, VAR_ICONS, type Question } from "./content.ts";

/** Signed number with the variable's decimals; Turkish uses a decimal comma. */
const fmtSignedIn = (lang: Lang) => (x: number, d: number) => {
  const s = smartSigned(x, d);
  return lang === "tr" ? s.replace(".", ",") : s;
};

/** Summary of the world / a continent / a country, from the per-cell trend map. */
export interface AreaInfo {
  kind: "world" | "continent" | "country";
  summary: AreaSummary;
}

/** What the status island at the top shows. */
export interface Status {
  place: string;
  value: string | null;
  level: TrendLevel | null;
  loading: boolean;
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

export type PanelTab = "summary" | "chart" | "explore";

interface Props {
  lang: Lang;
  /** 1.4 time travel: while playing, the card and chart cover [from, year] (null = off) */
  anim?: { from: number; year: number; to: number } | null;
  mode: "region" | "point";
  variables: VariablesFile;
  variable: VariableInfo;
  index: CountryInfo[];
  countryRows: CountryRow[];
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
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onStatus: (s: Status) => void;
}

const TABS: { id: PanelTab; icon: IconName; key: "tabSummary" | "tabChart" | "tabExplore" }[] = [
  { id: "summary", icon: "info", key: "tabSummary" },
  { id: "chart", icon: "chart", key: "tabChart" },
  { id: "explore", icon: "search", key: "tabExplore" },
];
const TAB_H = 40;

export function Panel(p: Props) {
  const { lang, variable: v, variables } = p;
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
  // an error belongs to the selection that caused it; going back to the world clears it
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

  const place = shown?.label[lang] ?? "";
  const country = p.index.find((c) => c.id === p.countryId);
  const lowRes = !!country?.admin1.find((a) => a.id === p.admin1Id)?.low_resolution;
  const countriesHere = p.countryRows
    .filter((c) => c.continent === p.continent)
    .sort((a, b) => a[`name_${lang}`].localeCompare(b[`name_${lang}`], lang));
  const dataIds = new Set(p.index.map((c) => c.id));
  const unit = unitLabel(v.unit, lang);
  const areaName = !p.area
    ? ""
    : p.area.kind === "world"
      ? t(lang, "world")
      : p.area.kind === "continent"
        ? (CONTINENTS.find((c) => c.id === p.continent)?.[lang] ?? "")
        : (country?.name[lang] ?? p.countryRows.find((c) => c.id === p.countryId)?.[`name_${lang}`] ?? "");

  // ── tell the status island what we show ──
  const ok = result?.status === "ok";
  const statusPlace = shown && result ? place : areaName || p.trail[p.trail.length - 1]?.label || "";
  const statusValue =
    shown && result && ok && result.level === "none"
      ? t(lang, "none")
      : shown && result && ok
      ? `${fmtSigned(result.slopePerDecade, decimalsFor(result.slopePerDecade, v.decimals + 1))} ${unit}/${t(lang, "decade")}`
      : p.area && !shown
        ? `${fmtSigned(p.area.summary.meanSlope, decimalsFor(p.area.summary.meanSlope, v.decimals + 1))} ${unit}/${t(lang, "decade")}`
        : null;
  const statusLevel = shown && result && ok ? result.level : null;
  const { onStatus } = p;
  useEffect(() => {
    onStatus({ place: statusPlace, value: statusValue, level: statusLevel, loading: loading && !!p.target });
  }, [onStatus, statusPlace, statusValue, statusLevel, loading, p.target]);

  const card = (() => {
    if (!result) return null;
    if (result.status === "too_short") return { cls: "none", head: null, body: t(lang, p.anim ? "animWait" : "tooShort") };
    if (result.status === "insufficient_data") return { cls: "none", head: null, body: t(lang, "insufficient") };
    if (result.status === "constant") return { cls: "none", head: null, body: t(lang, "constant") };
    if (result.level === "none")
      return {
        cls: "none",
        head: t(lang, "none"),
        body: noTrendText(lang, { start: result.startYear, end: result.endYear }),
      };
    const dir = result.slopePerDecade >= 0 ? "up" : "down";
    return {
      cls: result.level,
      head: t(lang, result.level),
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

  // ── LiquidTabs: measure the active tab so the liquid blob slides under it ──
  const gooId = `goo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const barRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<PanelTab, HTMLButtonElement | null>>>({});
  const [blob, setBlob] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const bar = barRef.current?.getBoundingClientRect();
      const el = tabRefs.current[p.tab]?.getBoundingClientRect();
      if (bar && el) setBlob({ x: el.left - bar.left, w: el.width });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (barRef.current) ro.observe(barRef.current);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [p.tab, lang]);
  // slide direction of the tab content: remember the previous tab in state (React's
  // "adjust state while rendering" pattern) instead of reading a ref during render
  const order = TABS.map((x) => x.id);
  const [prevTab, setPrevTab] = useState(p.tab);
  const [dir, setDir] = useState(1);
  if (prevTab !== p.tab) {
    setDir(order.indexOf(p.tab) >= order.indexOf(prevTab) ? 1 : -1);
    setPrevTab(p.tab);
  }

  const summary = (
    <>
      <nav className="trail" aria-label="breadcrumb">
        {p.trail.map((s, i) => (
          <button key={i} className="crumb" onClick={s.go} disabled={i === p.trail.length - 1}>
            {s.label}
          </button>
        ))}
      </nav>

      {p.mode === "point" && (
        <section>
          <h3>{t(lang, "scales")}</h3>
          <ScaleLadder lang={lang} path={p.path} onGo={p.onScale} />
        </section>
      )}

      {loading && p.target && <div className="skeleton" aria-label={t(lang, "loading")} />}
      {shownError && (
        <p className="alert" role="alert">
          {shownError}
        </p>
      )}

      {shown && result && !shownError && card && (
        <motion.section
          className="answer"
          key={`${targetKey}:${v.id}`}
          initial={reduce ? false : { opacity: 0, y: 8, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <p className="eyebrow">{v.name[lang]}</p>
          <h2>{place}</h2>
          <div className={`verdict ${card.cls} ${card.cls === "strong" ? "beam" : ""}`}>
            {ok && (
              <div className="meter" role="img" aria-label={`${t(lang, "evidence")}: ${card.head ?? ""}`}>
                {(["none", "possible", "strong"] as const).map((lv) => (
                  <span key={lv} className={`meter-step ${lv} ${result.level === lv ? "on" : ""}`}>
                    {t(lang, lv)}
                  </span>
                ))}
              </div>
            )}
            {ok && "meaning" in card && card.meaning && <p className="meaning">{card.meaning}</p>}
            {ok && result.level !== "none" && (
              <p className="headline">
                <NumberTicker className="big" value={result.slopePerDecade} decimals={decimalsFor(result.slopePerDecade, v.decimals + 1)} signed comma={lang === "tr"} />
                <span className="unit">
                  {unit} {t(lang, "perDecade")}
                </span>
              </p>
            )}
            <p className="card-text">{card.body}</p>
            {/* contract 1.1: experimental variables never reach "strong"; say why */}
            {(result.capped || v.experimental) && v.caveat && (
              <p className="warn">
                {/* the caveat already starts with "Experimental:"; only add why the level dropped */}
                {result.capped && <b>{t(lang, "cappedTitle")}</b>} {v.caveat[lang]}
              </p>
            )}
            {/* other known limits of a variable (precipitation, aerosol, mountain snow): a quiet note */}
            {!result.capped && !v.experimental && v.caveat && <p className="note">{v.caveat[lang]}</p>}
            {/* contract 1.2: provinces smaller than one grid cell */}
            {lowRes && <p className="warn">{t(lang, "lowResNote")}</p>}
          </div>
          {ok && (
            <dl className="stats">
              <div className="stat">
                <dt>{t(lang, "ciLabel")}</dt>
                <dd>
                  {fmtSigned(result.ci95[0], v.decimals + 1)} … {fmtSigned(result.ci95[1], v.decimals + 1)}
                </dd>
              </div>
              <div className="stat" title={t(lang, "statNote")}>
                <dt>{t(lang, "pLabel")}</dt>
                <dd>
                  {chanceText(lang, result.pValue)} <small>(p {result.pValue < 0.001 ? "< 0.001" : `= ${result.pValue.toFixed(3)}`})</small>
                </dd>
              </div>
              <div className="stat">
                <dt>{t(lang, "totalLabel")}</dt>
                <dd>
                  {result.level === "none" ? t(lang, "unclear") : <>{fmtSigned(result.totalChange, v.decimals)} <small>{unit}</small></>}
                </dd>
              </div>
              <div className="stat">
                <dt>{t(lang, "yearsLabel")}</dt>
                <dd>
                  {result.nYears} <small>{result.startYear}–{result.endYear}</small>
                </dd>
              </div>
            </dl>
          )}
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
          <button className="link-btn" onClick={() => p.onTab("chart")}>
            <Icon name="chart" size={16} /> {t(lang, "seeChart")}
          </button>
        </motion.section>
      )}

      {p.area && (!shown || p.area.kind === "continent") && (
        <AreaCard lang={lang} area={p.area} v={v} name={areaName} hasSeries={!!country} compact={!!shown} />
      )}

      {p.mode === "region" && p.countryId && country && (
        <section>
          <h3>{t(lang, "provinces")}</h3>
          <div className="chips">
            <button className={`chip ${p.admin1Id === null ? "on" : ""}`} onClick={() => p.onCountry(country.id)}>
              {country.name[lang]}
            </button>
            {country.admin1.map((a) => (
              <button key={a.id} className={`chip ${p.admin1Id === a.id ? "on" : ""}`} onClick={() => p.onAdmin1(country.id, a.id)}>
                {a.name[lang]}
              </button>
            ))}
          </div>
        </section>
      )}
      <p className="fine source">
        {t(lang, "source")} · {variables.dataset}
        {!variables.is_mock && ` · ${variables.processed_at.slice(0, 10)}`}
      </p>
    </>
  );

  const chart = shown && result && !shownError ? (
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
      <Chart series={shown} result={result} view={view} unit={unit} decimals={v.decimals} startYear={eff[0]} endYear={eff[1]} lang={lang} />
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
        <Icon name="download" size={16} /> {t(lang, "downloadCsv")}
      </button>
    </>
  ) : (
    <div className="empty">
      <Icon name="chart" size={28} />
      <p>{t(lang, p.target ? "loading" : "chartEmpty")}</p>
      <div className="chips">
        {p.demos.map((d) => (
          <button key={d.label} className="chip demo" onClick={d.go}>
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );

  const explore = (
    <>
      <PlaceSearch lang={lang} countryRows={p.countryRows} index={p.index} onCountry={p.onCountry} onAdmin1={p.onAdmin1} />

      <section className="varinfo">
        <div className="varinfo-head">
          <span className="varinfo-icon">
            <Icon name={VAR_ICONS[v.id]} size={20} />
          </span>
          <div>
            <strong>{v.name[lang]}</strong> <span className="unit">{unit}</span>
            {v.land_only && <span className="tag">{t(lang, "landOnly")}</span>}
            {v.experimental && <span className="tag exp">{t(lang, "experimentalTag")}</span>}
            <p>{v.description[lang]}</p>
          </div>
        </div>
      </section>

      <section>
        <h3>{t(lang, "curious")}</h3>
        <div className="questions">
          {QUESTIONS.map((q) => (
            <button key={q.id} className={`qchip ${p.question?.id === q.id ? "on" : ""}`} onClick={() => p.onQuestion(p.question?.id === q.id ? null : q)}>
              <Icon name={q.icon} size={15} /> {q.q[lang]}
            </button>
          ))}
        </div>
        {p.question && <p className="qtip">{p.question.tip[lang]}</p>}
      </section>

      {p.mode === "region" && (
        <section>
          <h3>{t(lang, p.continent ? "countries" : "continents")}</h3>
          <div className="chips scroll">
            {p.continent
              ? countriesHere.map((c) => (
                  <button key={c.id} className={`chip ${dataIds.has(c.id) ? "has" : ""} ${c.id === p.countryId ? "on" : ""}`} onClick={() => p.onCountry(c.id)}>
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
        </section>
      )}

      <section>
        <h3>{t(lang, "demos")}</h3>
        <div className="chips">
          {p.demos.map((d) => (
            <button key={d.label} className="chip demo" onClick={d.go}>
              {d.label}
            </button>
          ))}
        </div>
      </section>
    </>
  );

  const content = { summary, chart, explore }[p.tab];

  return (
    <aside className="inspector" aria-live="polite">
      {/* the goo: blur, then pull the alpha back to a hard edge (LiquidTabs) */}
      <svg aria-hidden className="goo-defs">
        <defs>
          <filter id={gooId} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" />
          </filter>
        </defs>
      </svg>
      <div aria-hidden className="insp-strip" style={{ height: TAB_H + 18 }} />
      <div aria-hidden className="insp-surface">
        <div className="insp-goo" style={{ filter: `url(#${gooId})` }}>
          <div className="insp-body" style={{ top: TAB_H }} />
          {blob && (
            <motion.div
              className="insp-blob"
              style={{ height: TAB_H + 18 }}
              initial={false}
              animate={{ x: blob.x, width: blob.w }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32 }}
            />
          )}
        </div>
      </div>

      <div ref={barRef} className="insp-bar" role="tablist" aria-label={t(lang, "panelTabs")} style={{ height: TAB_H }}>
        {TABS.map((x, i) => (
          <button
            key={x.id}
            ref={(el) => {
              tabRefs.current[x.id] = el;
            }}
            role="tab"
            aria-selected={p.tab === x.id}
            className={`insp-tab ${p.tab === x.id ? "on" : ""}`}
            onClick={() => p.onTab(x.id)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const next = TABS[(i + (e.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length].id;
              p.onTab(next);
              tabRefs.current[next]?.focus();
            }}
          >
            <Icon name={x.icon} size={14} />
            {t(lang, x.key)}
            {x.id === "chart" && shown && result && <i className="tab-dot" />}
          </button>
        ))}
      </div>

      <div className="insp-scroll">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={p.tab}
            className="insp-content"
            custom={dir}
            initial={reduce ? false : { opacity: 0, x: 14 * dir, filter: "blur(4px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={reduce ? undefined : { opacity: 0, x: -14 * dir, filter: "blur(4px)" }}
            transition={{ duration: 0.18 }}
          >
            {content}
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  );
}

/** `compact`: shown under the place's own series (continents) — no second title. */
function AreaCard({ lang, area, v, name, hasSeries, compact = false }: { lang: Lang; area: AreaInfo; v: VariableInfo; name: string; hasSeries: boolean; compact?: boolean }) {
  const s = area.summary;
  const parts = [
    { key: "strongUp", share: s.strongUp, cls: "share-up" },
    { key: "possibleShare", share: s.possible, cls: "share-maybe" },
    { key: "noneShare", share: s.none, cls: "share-flat" },
    { key: "strongDown", share: s.strongDown, cls: "share-down" },
  ] as const;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const title = area.kind === "world" ? "worldSummary" : area.kind === "continent" ? "continentSummary" : "countrySummary";
  const note = area.kind === "country" ? (hasSeries ? "countryNoteSeries" : "countryNoteNoSeries") : area.kind === "world" ? "worldNote" : "continentNote";
  const unit = unitLabel(v.unit, lang);
  return (
    <section className="answer">
      {compact ? (
        <h3>{t(lang, "areaShares")}</h3>
      ) : (
        <>
          <p className="eyebrow">
            {t(lang, title)} · {v.name[lang]}
          </p>
          <h2>{name}</h2>
        </>
      )}
      <div className="verdict">
        <p className="fine">{t(lang, area.kind === "world" ? "meanTrendAll" : "meanTrend")}</p>
        <p className="headline">
          <NumberTicker className="big" value={s.meanSlope} decimals={decimalsFor(s.meanSlope, v.decimals + 1)} signed comma={lang === "tr"} />
          <span className="unit">
            {unit} {t(lang, "perDecade")}
          </span>
        </p>
        <div className="sharebar" role="img" aria-label={parts.map((x) => `${t(lang, x.key)} ${pct(x.share)}`).join(", ")}>
          {parts.map((x) => (
            <span key={x.key} className={x.cls} style={{ flexGrow: x.share }} />
          ))}
        </div>
        <ul className="sharelegend">
          {parts.map((x) => (
            <li key={x.key}>
              <i className={x.cls} /> {t(lang, x.key)} <b>{pct(x.share)}</b>
            </li>
          ))}
        </ul>
      </div>
      <p className="note">{t(lang, note)}</p>
    </section>
  );
}
