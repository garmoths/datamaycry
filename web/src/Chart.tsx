/**
 * Time-series chart (Plotly.js basic bundle, loaded on demand and prefetched when idle).
 * Written with AI assistance (Claude).
 */
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { anomalies, monthLabels, type Series, type TrendResult } from "./data.ts";
import { COLD, WARM } from "./trendImage.ts";
import { preloadPlotly } from "./plotlyLoader.ts";

interface Props {
  series: Series;
  result: TrendResult | null;
  view: "raw" | "anomaly";
  unit: string;
  decimals: number;
  startYear: number;
  endYear: number;
}

const rgb = (c: readonly number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
const gaps = (a: ArrayLike<number>) => Array.from(a, (v) => (Number.isFinite(v) ? v : null));

export function Chart(props: Props) {
  // Dragging the period slider re-runs the test instantly; the chart catches up a frame later.
  const { series, result, view, unit, decimals, startYear, endYear } = useDeferredValue(props);
  const el = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let dead = false;
    (async () => {
      const Plotly = await preloadPlotly();
      if (dead || !el.current) return;
      const x = monthLabels(series);
      const traces: object[] = [];

      if (view === "raw") {
        traces.push({
          x,
          y: gaps(series.values),
          type: "scatter",
          mode: "lines",
          name: unit,
          line: { color: "#8ec5ff", width: 1.4 },
          hovertemplate: `%{x}<br>%{y:.${decimals}f} ${unit}<extra></extra>`,
        });
      } else {
        traces.push({
          x,
          y: gaps(anomalies(series)),
          type: "scatter",
          mode: "lines",
          name: "anomaly",
          line: { color: "rgba(142,197,255,0.45)", width: 1 },
          hovertemplate: `%{x}<br>%{y:.${decimals}f} ${unit}<extra></extra>`,
        });
        if (result && result.status === "ok") {
          const years = result.annual.years;
          const up = result.slopePerDecade >= 0;
          traces.push(
            {
              x: years.map((y) => `${y}-07`),
              y: gaps(result.annual.anomalies),
              type: "scatter",
              mode: "markers",
              name: "annual mean",
              marker: { color: "#ffffff", size: 6, line: { color: "#08060d", width: 1 } },
              hovertemplate: `%{x|%Y}<br>%{y:.${decimals}f} ${unit}<extra></extra>`,
            },
            {
              x: years.map((y) => `${y}-07`),
              y: years.map((y) => result.line.intercept + result.line.slopePerYear * (y - result.startYear)),
              type: "scatter",
              mode: "lines",
              name: "trend",
              line: { color: rgb(up ? WARM : COLD), width: 3 },
              hoverinfo: "skip",
            },
          );
        }
      }

      const layout = {
        margin: { l: 48, r: 10, t: 8, b: 32 },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { color: "#c4cee3", size: 11.5, family: "Inter, system-ui, sans-serif" },
        showlegend: false,
        xaxis: { gridcolor: "rgba(255,255,255,0.07)", range: [x[0], x[x.length - 1]] },
        yaxis: {
          gridcolor: "rgba(255,255,255,0.07)",
          title: { text: unit, standoff: 6 },
          zeroline: view === "anomaly",
          zerolinecolor: "rgba(255,255,255,0.3)",
        },
        shapes: [
          {
            type: "rect",
            xref: "x",
            yref: "paper",
            x0: `${startYear}-01`,
            x1: `${endYear}-12`,
            y0: 0,
            y1: 1,
            fillcolor: "rgba(255,209,102,0.07)",
            line: { width: 0 },
            layer: "below",
          },
        ],
        hovermode: "x unified",
        transition: { duration: 0 },
      };
      await Plotly.react(el.current, traces as never, layout as never, { displayModeBar: false, responsive: true });
      if (!dead) setReady(true);
    })();
    return () => {
      dead = true;
    };
  }, [series, result, view, unit, decimals, startYear, endYear]);

  useEffect(() => {
    const node = el.current;
    return () => {
      if (node) preloadPlotly().then((P) => P.purge(node));
    };
  }, []);

  return (
    <div className={`chart-wrap ${ready ? "ready" : ""}`}>
      {!ready && <div className="shimmer" aria-hidden />}
      <div ref={el} className="chart" role="img" aria-label={`${series.label.en} time series`} />
    </div>
  );
}
