/** Loads Plotly (basic bundle) once; App starts it early when the browser is idle. */
type PlotlyLib = typeof import("plotly.js-basic-dist-min").default;

let plotly: Promise<PlotlyLib> | undefined;
export function preloadPlotly(): Promise<PlotlyLib> {
  plotly ??= import("plotly.js-basic-dist-min").then((m) => m.default);
  plotly.catch(() => (plotly = undefined)); // a failed download (offline, redeploy) can be retried
  return plotly;
}
