/**
 * The chart in the drawer: TrendPlot.tsx (SVG, no chart library) with its legend.
 * Click a legend chip to hide or show a series; the monthly differences start hidden
 * (several times larger, they would flatten the yearly picture).
 * Written with AI assistance (Claude).
 */
import { useDeferredValue, useState, type CSSProperties } from "react";
import type { Series, TrendResult } from "./data.ts";
import type { Lang } from "./i18n.ts";
import { TrendPlot } from "./TrendPlot.tsx";
import "./chart.css";

export type ChartView = "anomaly" | "raw" | "seasons";

interface Props {
  series: Series;
  result: TrendResult | null;
  view: ChartView;
  unit: string;
  decimals: number;
  startYear: number;
  endYear: number;
  lang: Lang;
  /** first year of a new pace (changepoint.ts): dashed vertical line on the anomaly view */
  bendYear?: number | null;
}

const L = {
  yearly: { en: "Yearly difference", tr: "Yıllık fark" },
  monthly: { en: "Monthly difference", tr: "Aylık fark" },
  trend: { en: "Trend (Sen)", tr: "Eğilim (Sen)" },
  band: { en: "95 % range", tr: "%95 aralığı" },
  smooth: { en: "Smoothed (LOESS)", tr: "Yumuşatılmış (LOESS)" },
  values: { en: "Monthly values and each year's range", tr: "Aylık değerler ve yıl aralığı" },
  run: { en: "12-month mean", tr: "12 aylık ortalama" },
  mean: { en: "1991–2020 mean", tr: "1991–2020 ortalaması" },
  needYears: { en: "Pick at least 20 years to compare the start and the end.", tr: "Başı ve sonu karşılaştırmak için en az 20 yıl seç." },
} satisfies Record<string, Record<string, string>>;

interface Key {
  id: string;
  name: string;
  kind: "split" | "line" | "dot" | "band";
  color: string;
}

export function Chart(props: Props) {
  // Dragging the period slider re-runs the test instantly; the chart catches up a frame later.
  const { series, result, view, unit, decimals, startYear, endYear, lang, bendYear } = useDeferredValue(props);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(["monthly"]));
  const tooShort = view === "seasons" && endYear - startYear + 1 < 20;
  const ok = !!result && result.status === "ok";
  const strong = ok && result!.level !== "none";
  const col = ok && result!.slopePerDecade >= 0 ? "var(--up)" : "var(--down)";

  const keys: Key[] =
    view === "anomaly"
      ? [
          { id: "yearly", name: L.yearly[lang], kind: "split", color: "" },
          ...(strong ? [{ id: "trend", name: L.trend[lang], kind: "line" as const, color: col }] : []),
          ...(ok ? [{ id: "band", name: L.band[lang], kind: "band" as const, color: strong ? col : "#c8cedc" }] : []),
          ...(ok ? [{ id: "smooth", name: L.smooth[lang], kind: "dot" as const, color: "rgba(255,255,255,0.8)" }] : []),
          { id: "monthly", name: L.monthly[lang], kind: "line", color: "rgba(196,206,227,0.5)" },
        ]
      : view === "raw"
        ? [
            { id: "values", name: L.values[lang], kind: "band", color: "linear-gradient(180deg, var(--up), rgba(201,210,222,0.4), var(--down))" },
            { id: "run", name: L.run[lang], kind: "line", color: "#f4f6f9" },
            { id: "mean", name: L.mean[lang], kind: "dot", color: "rgba(255,255,255,0.55)" },
          ]
        : [];
  // seasons: which line is which decade (not switchable)
  const span = Math.min(10, Math.floor((endYear - startYear + 1) / 2));
  const seasonKeys: Key[] =
    view === "seasons" && !tooShort
      ? [
          { id: "first", name: `${startYear}–${startYear + span - 1}`, kind: "dot", color: "rgba(255,255,255,0.8)" },
          { id: "last", name: `${endYear - span + 1}–${endYear}`, kind: "line", color: col },
        ]
      : [];

  const toggle = (id: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="chart-wrap ready">
      {tooShort ? (
        <p className="note">{L.needYears[lang]}</p>
      ) : (
        <TrendPlot
          key={view}
          series={series}
          result={result}
          view={view}
          unit={unit}
          decimals={decimals}
          startYear={startYear}
          endYear={endYear}
          lang={lang}
          bendYear={bendYear}
          hidden={hidden}
        />
      )}
      {seasonKeys.length > 0 && (
        <ul className="chart-keys">
          {seasonKeys.map((k) => (
            <li key={k.id}>
              <span>
                <i className={`sw ${k.kind}`} style={{ "--c": k.color } as CSSProperties} />
                {k.name}
              </span>
            </li>
          ))}
        </ul>
      )}
      {keys.length > 0 && (
        <ul className="chart-keys">
          {keys.map((k) => (
            <li key={k.id}>
              <button className={hidden.has(k.id) ? "off" : ""} aria-pressed={!hidden.has(k.id)} onClick={() => toggle(k.id)}>
                <i className={`sw ${k.kind}`} style={{ "--c": k.color } as CSSProperties} />
                {k.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
