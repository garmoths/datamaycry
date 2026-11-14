/**
 * Time-series charts (Plotly.js basic bundle, loaded on demand and prefetched when idle).
 * Everything drawn is computed from the series; nothing is decorative:
 *
 *  "anomaly"  yearly difference from the 1991–2020 normal as bars (red above, blue below),
 *             Sen trend line with its 95 % range as a fan, a LOESS curve that shows bends
 *             a straight line hides, monthly differences faint behind; climate stripes on top
 *  "raw"      monthly values, 12-month running mean, 1991–2020 mean
 *  "seasons"  the average year at the start and at the end of the period, month by month
 *
 * The legend is our own (HTML chips under the plot, click to hide or show a series), so it
 * reads like the rest of the interface; the stripes share the plot area's left and right
 * edges (PLOT_L / PLOT_R). Changes within a view animate; a new view starts clean.
 * Written with AI assistance (Claude).
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { anomalies, monthLabels, type Series, type TrendResult } from "./data.ts";
import { loess, runningMean } from "./stats.ts";
import { COLD, WARM } from "./trendImage.ts";
import { preloadPlotly } from "./plotlyLoader.ts";
import type { Lang } from "./i18n.ts";
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
  normal: { en: "1991–2020 normal", tr: "1991–2020 normali" },
  values: { en: "Monthly values", tr: "Aylık değerler" },
  run: { en: "12-month mean", tr: "12 aylık ortalama" },
  mean: { en: "1991–2020 mean", tr: "1991–2020 ortalaması" },
  bend: { en: "Pace changes", tr: "Hız değişimi" },
  stripes: { en: "Each stripe is one year: red above normal, blue below", tr: "Her şerit bir yıl: kırmızı normalin üstü, mavi altı" },
  needYears: { en: "Pick at least 20 years to compare the start and the end.", tr: "Başı ve sonu karşılaştırmak için en az 20 yıl seç." },
} satisfies Record<string, Record<Lang, string>>;

/** plot area insets (px); the stripes above use the same ones */
const PLOT_L = 46;
const PLOT_R = 12;

const SANS = "Geist, Inter, system-ui, sans-serif";
const MONO = "Geist Mono, ui-monospace, Consolas, monospace";
const GRID = "rgba(255,255,255,0.06)";
const AXIS = "#8b919c";

const rgba = (c: readonly number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const gaps = (a: ArrayLike<number>) => Array.from(a, (v) => (Number.isFinite(v) ? v : null));
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/** Mean of each calendar month over [y0, y1]; NaN if a month never has data. */
function monthlyClimate(series: Series, y0: number, y1: number): number[] {
  const labels = monthLabels(series);
  const sum = new Array(12).fill(0);
  const cnt = new Array(12).fill(0);
  series.values.forEach((v, k) => {
    const y = +labels[k].slice(0, 4);
    const m = +labels[k].slice(5, 7) - 1;
    if (y >= y0 && y <= y1 && Number.isFinite(v)) {
      sum[m] += v;
      cnt[m] += 1;
    }
  });
  return sum.map((s, m) => (cnt[m] ? s / cnt[m] : NaN));
}

/** One chip of our legend; `id` is stable across languages, `kind` draws the swatch. */
interface Key {
  id: string;
  name: string;
  kind: "bar" | "line" | "dash" | "dot" | "band" | "split";
  color: string;
  /** a toggle hides or shows these trace ids */
  toggles: boolean;
}

export function Chart(props: Props) {
  // Dragging the period slider re-runs the test instantly; the chart catches up a frame later.
  const { series, result, view, unit, decimals, startYear, endYear, lang, bendYear } = useDeferredValue(props);
  const el = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const drawn = useRef<ChartView | null>(null);
  // hidden series; the monthly differences start hidden (several times larger, they would
  // flatten the yearly picture)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(["monthly"]));
  const ok = !!result && result.status === "ok";
  const tooShortForSeasons = view === "seasons" && endYear - startYear + 1 < 20;

  // Climate stripes: one per tested year, colour = sign, strength = size relative to the largest
  const stripes = useMemo(() => {
    if (!result || !result.annual.years.length) return [];
    const max = Math.max(...result.annual.anomalies.map(Math.abs)) || 1;
    return result.annual.years.map((y, k) => {
      const a = result.annual.anomalies[k];
      return { y, a, color: rgba(a >= 0 ? WARM : COLD, 0.15 + 0.85 * Math.min(1, Math.abs(a) / max)) };
    });
  }, [result]);

  // traces + legend keys, built without Plotly so the legend can render before it loads
  const plot = useMemo(() => {
    const x = monthLabels(series);
    const num = `%{y:.${decimals + 1}f} ${unit}`;
    const traces: (Record<string, unknown> & { id: string })[] = [];
    const keys: Key[] = [];
    const shapes: object[] = [];
    let xaxis: Record<string, unknown> = { type: "date", range: [x[0], x[x.length - 1]], showgrid: false };
    // the tested period, shaded only when it is narrower than the data
    const partial = +x[0].slice(0, 4) < startYear || +x[x.length - 1].slice(0, 4) > endYear;
    const period = {
      type: "rect", xref: "x", yref: "paper", x0: `${startYear}-01`, x1: `${endYear}-12`, y0: 0, y1: 1,
      fillcolor: "rgba(255,255,255,0.04)", line: { width: 0 }, layer: "below",
    };

    if (view === "raw") {
      const base = monthlyClimate(series, 1991, 2020);
      const mean = base.every(Number.isFinite) ? base.reduce((a, b) => a + b, 0) / 12 : NaN;
      traces.push(
        { id: "values", x, y: gaps(series.values), type: "scatter", mode: "lines",
          line: { color: "rgba(154,164,178,0.45)", width: 1 }, hovertemplate: `${num}<extra>${L.values[lang]}</extra>` },
        { id: "run", x, y: gaps(runningMean(series.values, 12)), type: "scatter", mode: "lines",
          line: { color: "#f4f5f7", width: 2.2, shape: "spline", smoothing: 0.6 }, hovertemplate: `${num}<extra>${L.run[lang]}</extra>` },
      );
      keys.push(
        { id: "values", name: L.values[lang], kind: "line", color: "rgba(154,164,178,0.7)", toggles: true },
        { id: "run", name: L.run[lang], kind: "line", color: "#f4f5f7", toggles: true },
      );
      if (Number.isFinite(mean)) {
        traces.push({ id: "mean", x: [x[0], x[x.length - 1]], y: [mean, mean], type: "scatter", mode: "lines",
          line: { color: "rgba(255,255,255,0.4)", width: 1, dash: "dot" }, hoverinfo: "skip" });
        keys.push({ id: "mean", name: L.mean[lang], kind: "dot", color: "rgba(255,255,255,0.55)", toggles: true });
      }
      if (partial) shapes.push(period);
    } else if (view === "seasons") {
      const span = Math.min(10, Math.floor((endYear - startYear + 1) / 2));
      const first = monthlyClimate(series, startYear, startYear + span - 1);
      const last = monthlyClimate(series, endYear - span + 1, endYear);
      const months = Array.from({ length: 12 }, (_, m) =>
        new Intl.DateTimeFormat(lang, { month: "short" }).format(new Date(2001, m, 1)));
      const mx = months.map((_, m) => m + 1);
      const nameA = `${startYear}–${startYear + span - 1}`;
      const nameB = `${endYear - span + 1}–${endYear}`;
      const up = last.reduce((a, b) => a + b, 0) >= first.reduce((a, b) => a + b, 0);
      const col = up ? WARM : COLD;
      traces.push(
        { id: "first", x: mx, y: gaps(first), type: "scatter", mode: "lines+markers",
          line: { color: "rgba(255,255,255,0.7)", width: 2, dash: "dot", shape: "spline", smoothing: 0.5 },
          marker: { size: 6, color: "#0f1117", line: { color: "rgba(255,255,255,0.8)", width: 1.5 } },
          hovertemplate: `${num}<extra>${nameA}</extra>` },
        { id: "last", x: mx, y: gaps(last), type: "scatter", mode: "lines+markers", fill: "tonexty",
          fillcolor: rgba(col, 0.16), line: { color: rgba(col), width: 2.6, shape: "spline", smoothing: 0.5 },
          marker: { size: 6, color: rgba(col), line: { color: "#0f1117", width: 1.5 } },
          hovertemplate: `${num}<extra>${nameB}</extra>` },
      );
      keys.push(
        { id: "first", name: nameA, kind: "dot", color: "rgba(255,255,255,0.8)", toggles: false },
        { id: "last", name: nameB, kind: "line", color: rgba(col), toggles: false },
      );
      xaxis = { type: "linear", range: [0.6, 12.4], tickmode: "array", tickvals: mx, ticktext: months, tickangle: 0, showgrid: false };
    } else {
      traces.push({ id: "monthly", x, y: gaps(anomalies(series)), type: "scatter", mode: "lines",
        line: { color: "rgba(196,206,227,0.3)", width: 1 }, hoverinfo: "skip" });
      if (result && result.annual.years.length) {
        const years = result.annual.years;
        const a = result.annual.anomalies;
        const xs = years.map((y) => `${y}-07`);
        traces.push({ id: "yearly", x: xs, y: a, type: "bar", width: 0.74 * 365.25 * 864e5,
          marker: { color: a.map((v) => rgba(v >= 0 ? WARM : COLD, 0.82)), cornerradius: 2 },
          hovertemplate: `%{x|%Y}: ${num}<extra></extra>` });
        keys.push({ id: "yearly", name: L.yearly[lang], kind: "split", color: "", toggles: true });
        if (ok && years.length >= 5) {
          // 95 % range of the slope as a fan around the trend line's middle point
          const tc = median(years);
          const at = (y: number) => result.line.intercept + result.line.slopePerYear * (y - result.startYear);
          const yc = at(tc);
          const lo = result.ci95[0] / 10, hi = result.ci95[1] / 10;
          const upper = years.map((y) => yc + Math.max(lo * (y - tc), hi * (y - tc)));
          const lower = years.map((y) => yc + Math.min(lo * (y - tc), hi * (y - tc)));
          const up = result.slopePerDecade >= 0;
          const strong = result.level !== "none";
          const col = strong ? (up ? WARM : COLD) : [200, 206, 220];
          traces.push(
            { id: "band", x: [...xs, ...[...xs].reverse()], y: [...upper, ...[...lower].reverse()], type: "scatter", mode: "lines",
              fill: "toself", fillcolor: rgba(col, 0.14), line: { width: 0 }, hoverinfo: "skip" },
            { id: "smooth", x: xs, y: loess(years, a, 0.5), type: "scatter", mode: "lines",
              line: { color: "rgba(255,255,255,0.8)", width: 1.6, dash: "dot", shape: "spline" }, hovertemplate: `${num}<extra>${L.smooth[lang]}</extra>` },
          );
          // A non-significant slope has no reliable sign: draw only its range, not a line
          if (strong) {
            traces.push({ id: "trend", x: xs, y: years.map(at), type: "scatter", mode: "lines",
              line: { color: rgba(col), width: 2.6 }, hovertemplate: `${num}<extra>${L.trend[lang]}</extra>` });
            keys.push({ id: "trend", name: L.trend[lang], kind: "line", color: rgba(col), toggles: true });
          }
          keys.push(
            { id: "band", name: L.band[lang], kind: "band", color: rgba(col, 0.35), toggles: true },
            { id: "smooth", name: L.smooth[lang], kind: "dot", color: "rgba(255,255,255,0.8)", toggles: true },
          );
        }
      }
      keys.push({ id: "monthly", name: L.monthly[lang], kind: "line", color: "rgba(196,206,227,0.55)", toggles: true });
      if (partial) shapes.push(period);
      // the bend (changepoint.ts): a dashed line where the new pace starts
      if (bendYear != null) {
        shapes.push({ type: "line", xref: "x", yref: "paper", x0: `${bendYear}-01`, x1: `${bendYear}-01`, y0: 0, y1: 1,
          line: { color: "rgba(255,255,255,0.5)", width: 1, dash: "dash" } });
        keys.push({ id: "bend", name: `${L.bend[lang]} · ${bendYear}`, kind: "dash", color: "rgba(255,255,255,0.6)", toggles: false });
      }
      keys.push({ id: "normal", name: L.normal[lang], kind: "line", color: "rgba(255,255,255,0.45)", toggles: false });
    }
    return { traces, keys, shapes, xaxis };
  }, [series, result, view, unit, decimals, startYear, endYear, lang, ok, bendYear]);

  useEffect(() => {
    let dead = false;
    (async () => {
      const Plotly = await preloadPlotly();
      if (dead || !el.current) return;
      const traces = plot.traces.map(({ id, ...t }) => ({ ...t, name: id, showlegend: false, visible: hidden.has(id) ? false : true }));
      const layout = {
        margin: { l: PLOT_L, r: PLOT_R, t: 8, b: 28 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: AXIS, size: 11, family: MONO },
        separators: lang === "tr" ? ",." : ".,",
        showlegend: false,
        bargap: 0,
        xaxis: { ...plot.xaxis, automargin: false, ticks: "outside", ticklen: 4, tickcolor: "rgba(255,255,255,0.15)", linecolor: "rgba(255,255,255,0.12)", showline: true, fixedrange: true },
        yaxis: {
          automargin: false,
          gridcolor: GRID,
          griddash: "dot",
          zeroline: view === "anomaly",
          zerolinecolor: "rgba(255,255,255,0.4)",
          zerolinewidth: 1,
          ticks: "",
          nticks: 6,
          fixedrange: true,
        },
        shapes: plot.shapes,
        hovermode: "x unified",
        hoverlabel: { bgcolor: "rgba(16,18,26,0.96)", bordercolor: "rgba(255,255,255,0.14)", font: { size: 12, family: SANS, color: "#e8eaee" } },
        // a change inside the same view (period, season, a hidden series) eases into place
        transition: { duration: drawn.current === view ? 320 : 0, easing: "cubic-in-out" },
      };
      // a different view has different axes: start clean instead of morphing the old plot
      if (drawn.current !== view) Plotly.purge(el.current);
      drawn.current = view;
      await Plotly.react(el.current, traces as never, layout as never, { displayModeBar: false, responsive: true });
      if (!dead) setReady(true);
    })();
    return () => {
      dead = true;
    };
  }, [plot, hidden, view, lang]);

  useEffect(() => {
    const node = el.current;
    return () => {
      if (node) preloadPlotly().then((P) => P.purge(node));
    };
  }, []);

  const toggle = (id: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className={`chart-wrap ${ready ? "ready" : ""}`}>
      <span className="chart-unit">{unit}</span>
      {view === "anomaly" && stripes.length > 0 && (
        <div className="stripes" style={{ marginLeft: PLOT_L, marginRight: PLOT_R }} role="img" aria-label={L.stripes[lang]} title={L.stripes[lang]}>
          {stripes.map((s, k) => (
            <span
              key={s.y}
              style={{ background: s.color, animationDelay: `${k * 12}ms` }}
              title={`${s.y}: ${s.a >= 0 ? "+" : ""}${s.a.toFixed(decimals + 1)} ${unit}`}
            />
          ))}
        </div>
      )}
      {tooShortForSeasons && <p className="note">{L.needYears[lang]}</p>}
      {!ready && <div className="shimmer" aria-hidden />}
      <div ref={el} className="chart" role="img" aria-label={`${series.label[lang]} · ${view}`} />
      <ul className="chart-keys">
        {plot.keys.map((k) =>
          k.toggles ? (
            <li key={k.id}>
              <button className={hidden.has(k.id) ? "off" : ""} aria-pressed={!hidden.has(k.id)} onClick={() => toggle(k.id)}>
                <i className={`sw ${k.kind}`} style={{ "--c": k.color } as CSSProperties} />
                {k.name}
              </button>
            </li>
          ) : (
            <li key={k.id}>
              <span>
                <i className={`sw ${k.kind}`} style={{ "--c": k.color } as CSSProperties} />
                {k.name}
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
