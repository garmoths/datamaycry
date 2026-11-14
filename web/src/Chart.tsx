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
 * Written with AI assistance (Claude).
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { anomalies, monthLabels, type Series, type TrendResult } from "./data.ts";
import { loess, runningMean } from "./stats.ts";
import { COLD, WARM } from "./trendImage.ts";
import { preloadPlotly } from "./plotlyLoader.ts";
import type { Lang } from "./i18n.ts";

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
}

const L = {
  yearly: { en: "Yearly difference from normal", tr: "Yıllık fark (normalden)" },
  monthly: { en: "Monthly difference", tr: "Aylık fark" },
  trend: { en: "Trend (Sen's slope)", tr: "Eğilim (Sen eğimi)" },
  band: { en: "95 % range of the trend", tr: "Eğilimin %95 aralığı" },
  smooth: { en: "Smoothed (LOESS)", tr: "Yumuşatılmış (LOESS)" },
  normal: { en: "1991–2020 normal", tr: "1991–2020 normali" },
  values: { en: "Monthly values", tr: "Aylık değerler" },
  run: { en: "12-month running mean", tr: "12 aylık kayan ortalama" },
  mean: { en: "1991–2020 mean", tr: "1991–2020 ortalaması" },
  stripes: { en: "Each stripe is one year: red above normal, blue below", tr: "Her şerit bir yıl: kırmızı normalin üstü, mavi altı" },
  needYears: { en: "Pick at least 20 years to compare the start and the end.", tr: "Başı ve sonu karşılaştırmak için en az 20 yıl seç." },
} satisfies Record<string, Record<Lang, string>>;

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

export function Chart(props: Props) {
  // Dragging the period slider re-runs the test instantly; the chart catches up a frame later.
  const { series, result, view, unit, decimals, startYear, endYear, lang } = useDeferredValue(props);
  const el = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const drawn = useRef<ChartView | null>(null);
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

  useEffect(() => {
    let dead = false;
    (async () => {
      const Plotly = await preloadPlotly();
      if (dead || !el.current) return;
      const x = monthLabels(series);
      const num = `%{y:.${decimals + 1}f} ${unit}`;
      const traces: object[] = [];
      const shapes: object[] = [];
      let xaxis: object = { gridcolor: "rgba(255,255,255,0.07)", type: "date", range: [x[0], x[x.length - 1]] };
      const period = {
        type: "rect", xref: "x", yref: "paper", x0: `${startYear}-01`, x1: `${endYear}-12`, y0: 0, y1: 1,
        fillcolor: "rgba(255,209,102,0.06)", line: { width: 0 }, layer: "below",
      };

      if (view === "raw") {
        const base = monthlyClimate(series, 1991, 2020);
        const mean = base.every(Number.isFinite) ? base.reduce((a, b) => a + b, 0) / 12 : NaN;
        traces.push(
          { x, y: gaps(series.values), type: "scatter", mode: "lines", name: L.values[lang],
            line: { color: "rgba(142,197,255,0.4)", width: 1 }, hovertemplate: `${num}<extra>${L.values[lang]}</extra>` },
          { x, y: gaps(runningMean(series.values, 12)), type: "scatter", mode: "lines", name: L.run[lang],
            line: { color: "#ffffff", width: 2.2 }, hovertemplate: `${num}<extra>${L.run[lang]}</extra>` },
        );
        if (Number.isFinite(mean))
          traces.push({ x: [x[0], x[x.length - 1]], y: [mean, mean], type: "scatter", mode: "lines", name: L.mean[lang],
            line: { color: "rgba(255,255,255,0.45)", width: 1, dash: "dot" }, hoverinfo: "skip" });
        shapes.push(period);
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
        traces.push(
          { x: mx, y: gaps(first), type: "scatter", mode: "lines+markers", name: nameA,
            line: { color: "rgba(255,255,255,0.75)", width: 2, dash: "dot" }, marker: { size: 5 },
            hovertemplate: `${num}<extra>${nameA}</extra>` },
          { x: mx, y: gaps(last), type: "scatter", mode: "lines+markers", name: nameB, fill: "tonexty",
            fillcolor: rgba(up ? WARM : COLD, 0.18), line: { color: rgba(up ? WARM : COLD), width: 2.6 }, marker: { size: 5 },
            hovertemplate: `${num}<extra>${nameB}</extra>` },
        );
        xaxis = { gridcolor: "rgba(255,255,255,0.07)", type: "linear", range: [0.6, 12.4], tickmode: "array", tickvals: mx, ticktext: months, tickangle: 0 };
      } else {
        traces.push({ x, y: gaps(anomalies(series)), type: "scatter", mode: "lines", name: L.monthly[lang],
          // off by default: monthly swings are several times larger and would flatten the yearly picture
          visible: "legendonly", line: { color: "rgba(196,206,227,0.35)", width: 1 }, hoverinfo: "skip" });
        if (result && result.annual.years.length) {
          const years = result.annual.years;
          const a = result.annual.anomalies;
          const xs = years.map((y) => `${y}-07`);
          traces.push({ x: xs, y: a, type: "bar", name: L.yearly[lang], width: 0.82 * 365.25 * 864e5,
            marker: { color: a.map((v) => rgba(v >= 0 ? WARM : COLD, 0.78)) },
            hovertemplate: `%{x|%Y}: ${num}<extra></extra>` });
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
              { x: [...xs, ...[...xs].reverse()], y: [...upper, ...[...lower].reverse()], type: "scatter", mode: "lines",
                fill: "toself", fillcolor: rgba(col, 0.16), line: { width: 0 }, name: L.band[lang], hoverinfo: "skip" },
              { x: xs, y: loess(years, a, 0.5), type: "scatter", mode: "lines", name: L.smooth[lang],
                line: { color: "rgba(255,255,255,0.85)", width: 1.6, dash: "dot" }, hovertemplate: `${num}<extra>${L.smooth[lang]}</extra>` },
              { x: xs, y: years.map(at), type: "scatter", mode: "lines", name: L.trend[lang],
                line: { color: rgba(col), width: 3, dash: strong ? "solid" : "dash" }, hovertemplate: `${num}<extra>${L.trend[lang]}</extra>` },
            );
          }
        }
        shapes.push(period);
      }

      const layout = {
        margin: { l: 50, r: 10, t: 6, b: 30 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "#c4cee3", size: 11.5, family: "Inter, system-ui, sans-serif" },
        separators: lang === "tr" ? ",." : ".,",
        showlegend: true,
        legend: { orientation: "h", x: 0, y: -0.16, font: { size: 10.5 }, bgcolor: "rgba(0,0,0,0)", itemsizing: "constant" },
        bargap: 0,
        xaxis,
        yaxis: {
          gridcolor: "rgba(255,255,255,0.07)",
          title: { text: unit, standoff: 6 },
          autorange: true,
          zeroline: view === "anomaly",
          zerolinecolor: "rgba(255,255,255,0.45)",
        },
        annotations: view === "anomaly"
          ? [{ xref: "paper", yref: "y", x: 1, y: 0, xanchor: "right", yanchor: "bottom", showarrow: false,
               text: L.normal[lang], font: { size: 10, color: "rgba(255,255,255,0.55)" } }]
          : [],
        shapes,
        hovermode: "x unified",
        hoverlabel: { bgcolor: "#12141c", bordercolor: "rgba(255,255,255,0.15)", font: { size: 11.5 } },
        transition: { duration: 0 },
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
  }, [series, result, view, unit, decimals, startYear, endYear, lang, ok]);

  useEffect(() => {
    const node = el.current;
    return () => {
      if (node) preloadPlotly().then((P) => P.purge(node));
    };
  }, []);

  return (
    <div className={`chart-wrap ${ready ? "ready" : ""}`}>
      {view === "anomaly" && stripes.length > 0 && (
        <div className="stripes" role="img" aria-label={L.stripes[lang]} title={L.stripes[lang]}>
          {stripes.map((s) => (
            <span key={s.y} style={{ background: s.color }} title={`${s.y}: ${s.a >= 0 ? "+" : ""}${s.a.toFixed(decimals + 1)} ${unit}`} />
          ))}
        </div>
      )}
      {tooShortForSeasons && <p className="note">{L.needYears[lang]}</p>}
      {!ready && <div className="shimmer" aria-hidden />}
      <div ref={el} className="chart" role="img" aria-label={`${series.label[lang]} · ${view}`} />
    </div>
  );
}
