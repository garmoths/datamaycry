/** Right-hand panel: place lists, chart controls, result card. Written with AI assistance (Claude). */
import { useEffect, useMemo, useState } from "react";
import {
  analyzeTrend,
  getPointSeries,
  getRegionSeries,
  type CountryInfo,
  type Series,
  type VariablesFile,
  type VariableInfo,
} from "./data.ts";
import { Chart } from "./Chart.tsx";
import { cardText, decimalsFor, noTrendText, smartSigned, t, unitLabel, type Lang } from "./i18n.ts";
import { CONTINENTS, type Node } from "./geo.ts";
import { ScaleLadder } from "./ScaleLadder.tsx";
import { NumberTicker } from "./NumberTicker.tsx";
import type { AreaSummary } from "./continentStats.ts";
import { motion, useReducedMotion } from "motion/react";
import { PlaceSearch } from "./PlaceSearch.tsx";
import { Icon } from "./icons.tsx";
import { QUESTIONS, VAR_ICONS, type Question } from "./content.ts";

const fmtSigned = smartSigned;

/** Summary of the world / a continent / a country, from the per-cell trend map. */
export interface AreaInfo {
  kind: "world" | "continent" | "country";
  summary: AreaSummary;
}

function AreaCard({ lang, area, v, name, hasSeries }: { lang: Lang; area: AreaInfo; v: VariableInfo; name: string; hasSeries: boolean }) {
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
  return (
    <section className="result">
      <h3>{t(lang, title)}</h3>
      <h2>
        {name} · {v.name[lang]}
      </h2>
      <div className="card">
        <p className="fine">{t(lang, area.kind === "world" ? "meanTrendAll" : "meanTrend")}</p>
        <p className="nums">
          <NumberTicker className="big" value={s.meanSlope} decimals={decimalsFor(s.meanSlope, v.decimals + 1)} signed />{" "}
          <span className="unit">{unitLabel(v.unit, lang)} / {t(lang, "decade")}</span>
        </p>
        <div className="sharebar" role="img" aria-label={parts.map((p) => `${t(lang, p.key)} ${pct(p.share)}`).join(", ")}>
          {parts.map((p) => (
            <span key={p.key} className={p.cls} style={{ flexGrow: p.share }} />
          ))}
        </div>
        <ul className="sharelegend">
          {parts.map((p) => (
            <li key={p.key}>
              <i className={p.cls} /> {t(lang, p.key)} <b>{pct(p.share)}</b>
            </li>
          ))}
        </ul>
        <p className="fine">{t(lang, note)}</p>
      </div>
    </section>
  );
}

export type Target =
  | { type: "region"; country: string; admin1: string | null }
  | { type: "point"; lat: number; lon: number }
  | null;

export interface CountryRow {
  id: string;
  name_en: string;
  name_tr: string;
  continent: string;
}

interface Props {
  lang: Lang;
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
}

export function Panel(p: Props) {
  const { lang, variable: v, variables } = p;
  const [series, setSeries] = useState<Series | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"raw" | "anomaly">("anomaly");
  const reduce = useReducedMotion();
  const [season, setSeason] = useState<"all" | "summer">("all");
  const [years, setYears] = useState<[number, number]>([variables.test_years.start, variables.test_years.end]);

  const targetKey = JSON.stringify(p.target);
  useEffect(() => {
    let dead = false;
    if (!p.target) return; // nothing selected: `shown` below hides any old series
    setError(null);
    setLoading(true);
    const load =
      p.target.type === "region"
        ? getRegionSeries(p.target.country, p.target.admin1, v.id)
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
        ? analyzeTrend(shown, {
            startYear: years[0],
            endYear: years[1],
            months: season === "summer" ? [6, 7, 8] : undefined,
          })
        : null,
    [shown, years, season],
  );

  const place = shown?.label[lang] ?? "";
  const countriesHere = p.countryRows
    .filter((c) => c.continent === p.continent)
    .sort((a, b) => a[`name_${lang}`].localeCompare(b[`name_${lang}`], lang));
  const dataIds = new Set(p.index.map((c) => c.id));
  const country = p.index.find((c) => c.id === p.countryId);

  const card = (() => {
    if (!result) return null;
    if (result.status === "too_short") return { cls: "none", head: null, body: t(lang, "tooShort") };
    if (result.status === "insufficient_data") return { cls: "none", head: null, body: t(lang, "insufficient") };
    if (result.status === "constant") return { cls: "none", head: null, body: t(lang, "constant") };
    if (result.level === "none") {
      return { cls: "none", head: t(lang, "none"), body: noTrendText(lang, result.slopePerDecade, unitLabel(v.unit, lang), v.decimals) };
    }
    return {
      cls: result.level,
      head: t(lang, result.level),
      body: cardText(lang, {
        dir: result.slopePerDecade >= 0 ? "up" : "down",
        level: result.level,
        place,
        variable: v.name[lang],
        unit: unitLabel(v.unit, lang),
        slope: result.slopePerDecade,
        ci: result.ci95,
        p: result.pValue,
        total: result.totalChange,
        startYear: result.startYear,
        decimals: v.decimals,
      }),
    };
  })();

  return (
    <aside className="panel" aria-live="polite">
      <nav className="trail" aria-label="breadcrumb">
        {p.trail.map((s, i) => (
          <button key={i} className="crumb" onClick={s.go} disabled={i === p.trail.length - 1}>
            {s.label}
          </button>
        ))}
      </nav>

      <PlaceSearch lang={lang} countryRows={p.countryRows} index={p.index} onCountry={p.onCountry} onAdmin1={p.onAdmin1} />

      {/* the variable chosen in the dock, explained, + "What are you curious about?" */}
      <section className="varinfo">
        <div className="varinfo-head">
          <span className="varinfo-icon">
            <Icon name={VAR_ICONS[v.id]} size={20} />
          </span>
          <div>
            <strong>{v.name[lang]}</strong> <span className="unit">{unitLabel(v.unit, lang)}</span>
            {v.land_only && <span className="tag">{t(lang, "landOnly")}</span>}
            <p>{v.description[lang]}</p>
          </div>
        </div>
        <details className="curious" open={!p.target}>
          <summary>{t(lang, "curious")}</summary>
          <div className="questions">
            {QUESTIONS.map((q) => (
              <button key={q.id} className={`qchip ${p.question?.id === q.id ? "on" : ""}`} onClick={() => p.onQuestion(p.question?.id === q.id ? null : q)}>
                <Icon name={q.icon} size={15} /> {q.q[lang]}
              </button>
            ))}
          </div>
          {p.question && <p className="qtip">{p.question.tip[lang]}</p>}
        </details>
      </section>

      {/* world → continent → country: always something to read, even without a series */}
      {p.area && (
        <AreaCard
          lang={lang}
          area={p.area}
          v={v}
          hasSeries={!!country}
          name={
            p.area.kind === "world"
              ? t(lang, "world")
              : p.area.kind === "continent"
                ? (CONTINENTS.find((c) => c.id === p.continent)?.[lang] ?? "")
                : (country?.name[lang] ?? p.countryRows.find((c) => c.id === p.countryId)?.[`name_${lang}`] ?? "")
          }
        />
      )}

      {/* ── pickers ── */}
      {p.mode === "region" && !p.continent && (
        <section>
          <h3>{t(lang, "continents")}</h3>
          <p className="hint">{t(lang, "pickPrompt")}</p>
          <div className="chips">
            {CONTINENTS.map((c) => (
              <button key={c.id} className="chip" onClick={() => p.onContinent(c.id)}>
                {c[lang]}
              </button>
            ))}
          </div>
        </section>
      )}

      {p.mode === "region" && p.continent && !p.countryId && (
        <section>
          <h3>{t(lang, "countries")}</h3>
          <div className="chips scroll">
            {countriesHere.map((c) => (
              <button key={c.id} className={`chip ${dataIds.has(c.id) ? "has" : "dim"}`} onClick={() => p.onCountry(c.id)} title={dataIds.has(c.id) ? "" : t(lang, "noData")}>
                {c[`name_${lang}`]}
                {dataIds.has(c.id) && " ●"}
              </button>
            ))}
          </div>
        </section>
      )}

      {p.mode === "region" && p.countryId && (
        <section>
          {country ? (
            <>
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
            </>
          ) : null /* the summary card above explains there is no series yet */}
        </section>
      )}

      {p.mode === "point" && (
        <section>
          <h3>{t(lang, "scales")}</h3>
          <ScaleLadder lang={lang} path={p.path} onGo={p.onScale} />
        </section>
      )}

      {/* ── result ── */}
      {loading && p.target && <p className="hint">{t(lang, "loading")}</p>}
      {shownError && (
        <p className="alert" role="alert">
          {t(lang, "error")}: {shownError}
        </p>
      )}

      {shown && result && !shownError && (
        <motion.section
          className="result"
          key={`${targetKey}:${v.id}`}
          initial={reduce ? false : { opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        >
          <h2>
            {place} · {v.name[lang]}
          </h2>

          {/* the answer first, then the evidence (chart + controls) */}
          {card && (
            <div className={`card ${card.cls} ${card.cls === "strong" ? "beam" : ""}`}>
              {result.status === "ok" && (
                <div className="meter" role="img" aria-label={`${t(lang, "evidence")}: ${card.head ?? ""}`}>
                  {(["none", "possible", "strong"] as const).map((lv) => (
                    <span key={lv} className={`meter-step ${lv} ${result.level === lv ? "on" : ""}`}>
                      {t(lang, lv)}
                    </span>
                  ))}
                </div>
              )}
              <p className="card-text">{card.body}</p>
              {result.status === "ok" && (
                <dl className="stats">
                  <div className="stat wide">
                    <dt>{t(lang, "slopeLabel")}</dt>
                    <dd>
                      <NumberTicker className="big" value={result.slopePerDecade} decimals={decimalsFor(result.slopePerDecade, v.decimals + 1)} signed /> <small>{unitLabel(v.unit, lang)} / {t(lang, "decade")}</small>
                    </dd>
                  </div>
                  <div className="stat">
                    <dt>{t(lang, "ciLabel")}</dt>
                    <dd>
                      {fmtSigned(result.ci95[0], v.decimals + 1)} … {fmtSigned(result.ci95[1], v.decimals + 1)}
                    </dd>
                  </div>
                  <div className="stat" title={t(lang, "statNote")}>
                    <dt>{t(lang, "pLabel")}</dt>
                    <dd>{result.pValue < 0.001 ? "p < 0.001" : `p = ${result.pValue.toFixed(3)}`}</dd>
                  </div>
                  <div className="stat">
                    <dt>{t(lang, "totalLabel")}</dt>
                    <dd>
                      {fmtSigned(result.totalChange, v.decimals)} <small>{unitLabel(v.unit, lang)}</small>
                    </dd>
                  </div>
                  <div className="stat">
                    <dt>{t(lang, "yearsLabel")}</dt>
                    <dd>
                      {result.nYears} <small>({result.startYear}–{result.endYear})</small>
                    </dd>
                  </div>
                </dl>
              )}
              <p className="fine">{t(lang, "statNote")}</p>
            </div>
          )}

          <div className="seg" role="group">
            {(["anomaly", "raw"] as const).map((k) => (
              <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>
                {t(lang, k)}
              </button>
            ))}
          </div>

          <Chart series={shown} result={result} view={view} unit={unitLabel(v.unit, lang)} decimals={v.decimals} startYear={years[0]} endYear={years[1]} />

          <div className="controls">
            <label>
              {t(lang, "period")}: <b>{years[0]}–{years[1]}</b>
              <div className="range2">
                <input type="range" aria-label="start year" min={variables.test_years.start} max={variables.test_years.end} value={years[0]} onChange={(e) => setYears([Math.min(+e.target.value, years[1]), years[1]])} />
                <input type="range" aria-label="end year" min={variables.test_years.start} max={variables.test_years.end} value={years[1]} onChange={(e) => setYears([years[0], Math.max(+e.target.value, years[0])])} />
              </div>
            </label>
            <div>
              {t(lang, "season")}
              <div className="seg small" role="group">
                {(["all", "summer"] as const).map((s) => (
                  <button key={s} className={season === s ? "on" : ""} onClick={() => setSeason(s)}>
                    {t(lang, s === "all" ? "seasonAll" : "seasonSummer")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {v.caveat && <p className="fine">⚠️ {v.caveat[lang]}</p>}
          <p className="fine">
            {t(lang, "source")} · {variables.dataset}
            {/* the mock file's dataset string already says it is mock */}
            {!variables.is_mock && ` · ${variables.processed_at.slice(0, 10)}`}
          </p>
        </motion.section>
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
    </aside>
  );
}
