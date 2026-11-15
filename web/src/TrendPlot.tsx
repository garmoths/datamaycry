/**
 * The trend charts, drawn as SVG at their real width (no chart library):
 *
 *  "anomaly"  yearly difference from the 1991–2020 normal as bars (coral above, blue below),
 *             Sen trend line with its 95 % range as a fan, LOESS curve, monthly differences
 *             (off by default), the change of pace (changepoint.ts) as a dashed line
 *  "raw"      monthly values, 12-month running mean, 1991–2020 mean
 *  "seasons"  the average year at the start and at the end of the period, month by month
 *
 * Rules kept from the Plotly version: a non-significant slope draws only its range, never a
 * line; numbers use the Turkish decimal comma in Turkish. Hovering shows a readout card (the
 * floating card with a connector dot is ported from Cult UI "analytics-chart", ui-lab).
 * `compact` is the small version for the side panel: no axes text, no hover.
 * Written with AI assistance (Claude).
 */
import { useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { anomalies, monthLabels, type Series, type TrendResult } from "./data.ts";
import { loess, runningMean } from "./stats.ts";
import { smartSigned, type Lang } from "./i18n.ts";
import "./trendplot.css";

export type PlotView = "anomaly" | "raw" | "seasons";
type CardRow = { k: string; v: string; c?: string };

export interface PlotProps {
  series: Series;
  result: TrendResult | null;
  view: PlotView;
  /** display unit (already localised) */
  unit: string;
  decimals: number;
  startYear: number;
  endYear: number;
  lang: Lang;
  bendYear?: number | null;
  /** series ids that are switched off (see `PLOT_KEYS`) */
  hidden?: Set<string>;
  compact?: boolean;
  height?: number;
}

const EASE = [0.22, 1, 0.36, 1] as const;
const UP = "var(--up)";
const DOWN = "var(--down)";

const T = {
  normal: { en: "normal", tr: "normal" },
  trend: { en: "Trend", tr: "Eğilim" },
  smooth: { en: "Smoothed", tr: "Yumuşatılmış" },
  yearly: { en: "Difference", tr: "Fark" },
  run: { en: "12-month mean", tr: "12 aylık ort." },
  value: { en: "Value", tr: "Değer" },
  range: { en: "Year's range", tr: "Yıl aralığı" },
  mean: { en: "1991–2020 mean", tr: "1991–2020 ort." },
  bend: { en: "pace changes", tr: "hız değişimi" },
  diff: { en: "Change", tr: "Değişim" },
} as const;

/** 1, 2 or 5 × a power of ten near `raw` */
function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(1e-12, raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
function niceRange(lo: number, hi: number, n = 5): { lo: number; hi: number; ticks: number[]; step: number } {
  if (!(hi > lo)) {
    const pad = Math.abs(lo) * 0.1 || 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep((hi - lo) / n);
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo: a, hi: b, ticks, step };
}
/** a smooth path through the points (Catmull-Rom as cubic Béziers); gaps break the line */
function smoothPath(pts: ([number, number] | null)[], tension = 0.5): string {
  let d = "";
  let run: [number, number][] = [];
  const flush = () => {
    if (run.length === 1) d += `M${run[0][0]},${run[0][1]}`;
    for (let i = 0; i < run.length - 1; i++) {
      const p0 = run[i - 1] ?? run[i], p1 = run[i], p2 = run[i + 1], p3 = run[i + 2] ?? p2;
      if (i === 0) d += `M${p1[0].toFixed(1)},${p1[1].toFixed(1)}`;
      const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension * 2, p1[1] + ((p2[1] - p0[1]) / 6) * tension * 2];
      const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension * 2, p2[1] - ((p3[1] - p1[1]) / 6) * tension * 2];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    run = [];
  };
  for (const p of pts) {
    if (p && Number.isFinite(p[1])) run.push(p);
    else flush();
  }
  flush();
  return d;
}
const linePath = (pts: ([number, number] | null)[]) => {
  let d = "";
  let pen = false;
  for (const p of pts) {
    if (p && Number.isFinite(p[1])) {
      d += `${pen ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
      pen = true;
    } else pen = false;
  }
  return d;
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
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export function TrendPlot(p: PlotProps) {
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(360);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(160, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");
  const hidden = p.hidden ?? new Set<string>();
  const on = (id: string) => !hidden.has(id);
  const compact = !!p.compact;
  const H = p.height ?? (compact ? 96 : 300);
  const M = compact ? { l: 2, r: 8, t: 6, b: 16 } : { l: 40, r: 14, t: 26, b: 28 };
  const iw = Math.max(10, W - M.l - M.r), ih = H - M.t - M.b;
  const tr = p.lang === "tr";
  const num = (v: number, d = p.decimals + 1) => (tr ? smartSigned(v, d).replace(".", ",") : smartSigned(v, d));
  const plain = (v: number, d = p.decimals + 1) => (tr ? v.toFixed(d).replace(".", ",") : v.toFixed(d));

  const monthlyOn = !hidden.has("monthly");
  const model = useMemo(() => {
    const { series, result, view, startYear, endYear } = p;
    if (view === "anomaly") {
      const years = result?.annual.years ?? [];
      const a = result?.annual.anomalies ?? [];
      const ok = !!result && result.status === "ok" && years.length >= 5;
      const strong = ok && result!.level !== "none";
      const up = ok && result!.slopePerDecade >= 0;
      const at = (y: number) => result!.line.intercept + result!.line.slopePerYear * (y - result!.startYear);
      let band: { y: number; lo: number; hi: number }[] = [];
      if (ok) {
        const tc = median(years);
        const yc = at(tc);
        const lo = result!.ci95[0] / 10, hi = result!.ci95[1] / 10;
        band = years.map((y) => ({ y, lo: yc + Math.min(lo * (y - tc), hi * (y - tc)), hi: yc + Math.max(lo * (y - tc), hi * (y - tc)) }));
      }
      const sm = ok ? loess(years, a, 0.5) : [];
      // monthly differences (fractional years) inside the tested period
      const labels = monthLabels(series);
      const an = anomalies(series);
      const monthly: [number, number][] = [];
      labels.forEach((l, i) => {
        const y = +l.slice(0, 4), m = +l.slice(5, 7);
        if (y >= startYear && y <= endYear && Number.isFinite(an[i])) monthly.push([y + (m - 0.5) / 12, an[i]]);
      });
      const vals = [...a, ...(ok ? band.flatMap((b) => [b.lo, b.hi]) : []), 0];
      if (monthlyOn) vals.push(...monthly.map((x) => x[1]));
      const fin = vals.filter(Number.isFinite);
      return { kind: "anomaly" as const, years, a, ok, strong, up, at, band, sm, monthly, x0: (years[0] ?? startYear) - 0.5, x1: (years[years.length - 1] ?? endYear) + 0.5, y: niceRange(Math.min(...fin), Math.max(...fin), compact ? 3 : 5) };
    }
    if (view === "raw") {
      const labels = monthLabels(series);
      const pts: [number, number][] = [];
      const runAll = runningMean(series.values, 12);
      const run: [number, number][] = [];
      labels.forEach((l, i) => {
        const x = +l.slice(0, 4) + (+l.slice(5, 7) - 0.5) / 12;
        pts.push([x, series.values[i]]);
        run.push([x, runAll[i]]);
      });
      const base = monthlyClimate(series, 1991, 2020);
      const mean = base.every(Number.isFinite) ? base.reduce((s, b) => s + b, 0) / 12 : NaN;
      const fin = series.values.filter(Number.isFinite) as unknown as number[];
      const lo = Math.min(...Array.from(fin)), hi = Math.max(...Array.from(fin));
      const byYear = new Map<number, { lo: number; hi: number }>();
      pts.forEach(([x, v]) => {
        if (!Number.isFinite(v)) return;
        const y = Math.floor(x);
        const r = byYear.get(y);
        if (!r) byYear.set(y, { lo: v, hi: v });
        else {
          r.lo = Math.min(r.lo, v);
          r.hi = Math.max(r.hi, v);
        }
      });
      const ranges = [...byYear.entries()].map(([y, r]) => ({ y, ...r }));
      const x0 = Math.floor(pts[0]?.[0] ?? 0);
      return { kind: "raw" as const, pts, run, mean, ranges, x0, x1: Math.ceil(pts[pts.length - 1]?.[0] ?? 1), y: niceRange(lo, hi, 5) };
    }
    const span = Math.min(10, Math.floor((endYear - startYear + 1) / 2));
    const first = monthlyClimate(series, startYear, startYear + span - 1);
    const last = monthlyClimate(series, endYear - span + 1, endYear);
    const fin = [...first, ...last].filter(Number.isFinite);
    const up = last.reduce((s, b) => s + (Number.isFinite(b) ? b : 0), 0) >= first.reduce((s, b) => s + (Number.isFinite(b) ? b : 0), 0);
    return {
      kind: "seasons" as const,
      first,
      last,
      up,
      nameA: `${startYear}–${startYear + span - 1}`,
      nameB: `${endYear - span + 1}–${endYear}`,
      x0: 0.5,
      x1: 12.5,
      y: niceRange(Math.min(...fin), Math.max(...fin), 5),
    };
  }, [p.series, p.result, p.view, p.startYear, p.endYear, compact, monthlyOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const sx = (x: number) => M.l + ((x - model.x0) / Math.max(1e-9, model.x1 - model.x0)) * iw;
  const sy = (y: number) => M.t + (1 - (y - model.y.lo) / Math.max(1e-9, model.y.hi - model.y.lo)) * ih;
  const monthsShort = Array.from({ length: 12 }, (_, m) => new Intl.DateTimeFormat(p.lang, { month: "short" }).format(new Date(2001, m, 1)));

  // ── hover: the nearest year / month ──
  const onMove = (e: ReactPointerEvent<SVGRectElement>) => {
    if (compact) return;
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const x = model.x0 + ((e.clientX - r.left) / r.width) * (model.x1 - model.x0);
    if (model.kind === "anomaly") {
      let best = -1, bd = Infinity;
      model.years.forEach((y, k) => {
        const d = Math.abs(y - x);
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      setHover(best >= 0 ? best : null);
    } else if (model.kind === "raw") {
      let best = -1, bd = Infinity;
      model.pts.forEach(([px, py], k) => {
        if (!Number.isFinite(py)) return;
        const d = Math.abs(px - x);
        if (d < bd) {
          bd = d;
          best = k;
        }
      });
      setHover(best >= 0 ? best : null);
    } else setHover(Math.max(0, Math.min(11, Math.round(x) - 1)));
  };

  const draw = reduce ? { duration: 0 } : { duration: 0.9, ease: EASE };
  const bw = model.kind === "anomaly" ? Math.max(1.2, (iw / Math.max(1, model.years.length)) * (compact ? 0.62 : 0.66)) : 0;

  // ── readout card ──
  let card: { x: number; y: number; head: string; rows: CardRow[]; dot: string } | null = null;
  if (hover !== null && !compact) {
    if (model.kind === "anomaly" && model.years[hover] !== undefined) {
      const y = model.years[hover], a = model.a[hover];
      const rows: CardRow[] = [{ k: T.yearly[p.lang], v: Number.isFinite(a) ? `${num(a)} ${p.unit}` : "–", c: a >= 0 ? UP : DOWN }];
      if (model.strong && on("trend")) rows.push({ k: T.trend[p.lang], v: `${num(model.at(y))} ${p.unit}`, c: model.up ? UP : DOWN });
      if (model.ok && on("smooth") && Number.isFinite(model.sm[hover])) rows.push({ k: T.smooth[p.lang], v: `${num(model.sm[hover])} ${p.unit}`, c: "rgba(255,255,255,0.85)" });
      card = { x: sx(y), y: sy(Number.isFinite(a) ? a : 0), head: String(y), rows, dot: a >= 0 ? UP : DOWN };
    } else if (model.kind === "raw" && model.pts[hover]) {
      const [x, v] = model.pts[hover];
      const yr = Math.floor(x), m = Math.round((x - yr) * 12 + 0.5) - 1;
      const rows: CardRow[] = [{ k: T.value[p.lang], v: `${plain(v)} ${p.unit}` }];
      rows[0].c = "rgba(170,180,195,0.9)";
      if (Number.isFinite(model.run[hover][1])) rows.push({ k: T.run[p.lang], v: `${plain(model.run[hover][1])} ${p.unit}`, c: "#f4f6f9" });
      const yrRange = model.ranges.find((r) => r.y === yr);
      if (yrRange) rows.push({ k: T.range[p.lang], v: `${plain(yrRange.lo, 1)} – ${plain(yrRange.hi, 1)}`, c: "rgba(121,170,230,0.6)" });
      card = { x: sx(x), y: sy(v), head: `${monthsShort[m]} ${yr}`, rows, dot: "#aab4c3" };
    } else if (model.kind === "seasons") {
      const a = model.first[hover], b = model.last[hover];
      const rows: CardRow[] = [
        { k: model.nameA, v: Number.isFinite(a) ? `${plain(a)} ${p.unit}` : "–" },
        { k: model.nameB, v: Number.isFinite(b) ? `${plain(b)} ${p.unit}` : "–", c: model.up ? UP : DOWN },
      ];
      if (Number.isFinite(a) && Number.isFinite(b)) rows.push({ k: T.diff[p.lang], v: `${num(b - a)} ${p.unit}` });
      card = { x: sx(hover + 1), y: sy(Number.isFinite(b) ? b : a), head: monthsShort[hover], rows, dot: model.up ? UP : DOWN };
    }
  }

  return (
    <div className={`tp ${compact ? "compact" : ""}`} ref={box} onPointerLeave={() => setHover(null)}>
      <svg width={W} height={H} role="img" aria-label={`${p.series.label[p.lang]}`}>
        <defs>
          <linearGradient id={`tp-up-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: UP, stopOpacity: 0.95 }} />
            <stop offset="1" style={{ stopColor: UP, stopOpacity: 0.35 }} />
          </linearGradient>
          <linearGradient id={`tp-down-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: DOWN, stopOpacity: 0.35 }} />
            <stop offset="1" style={{ stopColor: DOWN, stopOpacity: 0.95 }} />
          </linearGradient>
          <linearGradient id={`tp-range-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: UP, stopOpacity: 0.55 }} />
            <stop offset="0.5" style={{ stopColor: "#c9d2de", stopOpacity: 0.18 }} />
            <stop offset="1" style={{ stopColor: DOWN, stopOpacity: 0.55 }} />
          </linearGradient>
          <linearGradient id="tp-run" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* grid + y axis */}
        {!compact &&
          model.y.ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 && model.kind === "anomaly" ? "tp-zero" : "tp-grid"} x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} />
              <text className="tp-axis" x={M.l - 8} y={sy(t) + 3.5} textAnchor="end">
                {t === 0 ? "0" : plain(t, Math.max(0, -Math.floor(Math.log10(model.y.step) + 1e-9)))}
              </text>
            </g>
          ))}
        {compact && model.kind === "anomaly" && <line className="tp-zero" x1={M.l} x2={W - M.r} y1={sy(0)} y2={sy(0)} />}
        {!compact && model.kind === "anomaly" && (
          <text className="tp-normal" x={M.l + 6} y={sy(0) - 6}>
            1991–2020 {T.normal[p.lang]}
          </text>
        )}
        {!compact && (
          <text className="tp-unit" x={M.l - 8} y={10} textAnchor="end">
            {p.unit}
          </text>
        )}

        {/* x axis labels */}
        {!compact && model.kind !== "seasons" &&
          Array.from({ length: 20 }, (_, k) => Math.ceil((model.x0 - 0.5) / 10) * 10 + k * 10)
            .filter((y) => y >= model.x0 - 0.5 && y <= model.x1)
            .map((y) => (
              <text key={y} className="tp-axis" x={sx(y)} y={H - 8} textAnchor="middle">
                {y}
              </text>
            ))}
        {!compact && model.kind === "seasons" &&
          monthsShort.map((m, k) => (
            <text key={m} className="tp-axis" x={sx(k + 1)} y={H - 8} textAnchor="middle">
              {m}
            </text>
          ))}
        {compact && model.kind === "anomaly" && model.years.length > 0 && (
          <>
            <text className="tp-axis" x={M.l} y={H - 2} textAnchor="start">
              {model.years[0]}
            </text>
            <text className="tp-axis" x={W - M.r} y={H - 2} textAnchor="end">
              {model.years[model.years.length - 1]}
            </text>
          </>
        )}

        {/* ── anomaly ── */}
        {model.kind === "anomaly" && (
          <>
            {model.ok && on("band") && (
              <motion.path
                className="tp-band"
                d={`${linePath(model.band.map((b) => [sx(b.y), sy(b.hi)]))}L${[...model.band].reverse().map((b) => `${sx(b.y).toFixed(1)},${sy(b.lo).toFixed(1)}`).join("L")}Z`}
                fill={model.strong ? (model.up ? UP : DOWN) : "#c8cedc"}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              />
            )}
            {on("monthly") && !compact && (
              <path className="tp-monthly" d={linePath(model.monthly.map(([x, v]) => [sx(x), sy(v)]))} />
            )}
            {on("yearly") &&
              model.years.map((y, k) => {
                const v = model.a[k];
                if (!Number.isFinite(v)) return null;
                const y0 = sy(0), y1 = sy(v);
                const dim = hover !== null && hover !== k;
                return (
                  <motion.rect
                    key={y}
                    className="tp-bar"
                    x={sx(y) - bw / 2}
                    width={bw}
                    rx={Math.min(2, bw / 3)}
                    fill={compact ? (v >= 0 ? UP : DOWN) : `url(#tp-${v >= 0 ? "up" : "down"}-${uid})`}
                    initial={reduce ? false : { attrY: y0, height: 0, opacity: 1 }}
                    animate={{ attrY: Math.min(y0, y1), height: Math.max(0.8, Math.abs(y1 - y0)), opacity: dim ? 0.38 : 1 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.55, ease: EASE, delay: hover === null ? Math.min(0.5, 0.008 * k) : 0, opacity: { duration: 0.15 } }}
                  />
                );
              })}
            {model.ok && on("smooth") && !compact && (
              <motion.path
                className="tp-smooth"
                d={smoothPath(model.years.map((y, k) => [sx(y), sy(model.sm[k])]))}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: reduce ? 0 : 0.6 }}
              />
            )}
            {model.strong && on("trend") && (
              <>
                <motion.line
                  className="tp-trend"
                  stroke={model.up ? UP : DOWN}
                  x1={sx(model.years[0])}
                  x2={sx(model.years[model.years.length - 1])}
                  y1={sy(model.at(model.years[0]))}
                  y2={sy(model.at(model.years[model.years.length - 1]))}
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ ...draw, delay: 0.35 }}
                />
                <motion.circle
                  className="tp-end"
                  cx={sx(model.years[model.years.length - 1])}
                  cy={sy(model.at(model.years[model.years.length - 1]))}
                  r={compact ? 3 : 4}
                  fill={model.up ? UP : DOWN}
                  initial={reduce ? false : { opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: reduce ? 0 : 1.2 }}
                />
              </>
            )}
            {p.bendYear != null && p.bendYear > model.x0 && p.bendYear < model.x1 && (
              <g className="tp-bendg">
                <line className="tp-bend" x1={sx(p.bendYear - 0.5)} x2={sx(p.bendYear - 0.5)} y1={M.t} y2={H - M.b} />
                {!compact && (
                  <text className="tp-bendlabel" x={sx(p.bendYear - 0.5) + 5} y={M.t + 10}>
                    {T.bend[p.lang]} · {p.bendYear}
                  </text>
                )}
              </g>
            )}
          </>
        )}

        {/* ── raw ── */}
        {model.kind === "raw" && (
          <>
            {on("values") &&
              model.ranges.map((r, k) => {
                const bw2 = Math.max(2, (iw / Math.max(1, model.ranges.length)) * 0.56);
                return (
                  <motion.rect
                    key={r.y}
                    className="tp-range"
                    x={sx(r.y + 0.5) - bw2 / 2}
                    width={bw2}
                    rx={bw2 / 2}
                    fill={`url(#tp-range-${uid})`}
                    initial={reduce ? false : { attrY: sy((r.lo + r.hi) / 2), height: 0, opacity: 0 }}
                    animate={{ attrY: sy(r.hi), height: Math.max(1, sy(r.lo) - sy(r.hi)), opacity: hover !== null && Math.floor(model.pts[hover]?.[0] ?? -1) !== r.y ? 0.35 : 1 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.5, ease: EASE, delay: hover === null ? Math.min(0.45, k * 0.008) : 0, opacity: { duration: 0.15 } }}
                  />
                );
              })}
            {on("mean") && Number.isFinite(model.mean) && (
              <>
                <line className="tp-mean" x1={M.l} x2={W - M.r} y1={sy(model.mean)} y2={sy(model.mean)} />
                <text className="tp-normal" x={M.l + 6} y={sy(model.mean) - 6}>
                  {T.mean[p.lang]}
                </text>
              </>
            )}
            {on("run") && (
              <>
                <path
                  className="tp-runarea"
                  d={`${smoothPath(model.run.map(([x, v]) => [sx(x), sy(v)]))}L${sx(model.x1).toFixed(1)},${H - M.b}L${sx(model.x0).toFixed(1)},${H - M.b}Z`}
                  fill="url(#tp-run)"
                />
                <path className="tp-run-glow" d={smoothPath(model.run.map(([x, v]) => [sx(x), sy(v)]))} />
                <motion.path
                  className="tp-run"
                  d={smoothPath(model.run.map(([x, v]) => [sx(x), sy(v)]))}
                  initial={reduce ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={draw}
                />
              </>
            )}
          </>
        )}

        {/* ── seasons ── */}
        {model.kind === "seasons" && (
          <>
            <path
              className="tp-gap"
              fill={model.up ? UP : DOWN}
              d={`${linePath(model.last.map((v, k) => [sx(k + 1), sy(v)]))}L${model.first
                .map((v, k) => [sx(k + 1), sy(v)] as const)
                .reverse()
                .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
                .join("L")}Z`}
            />
            <motion.path
              className="tp-first"
              d={smoothPath(model.first.map((v, k) => [sx(k + 1), sy(v)]))}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6 }}
            />
            <motion.path
              className="tp-last"
              stroke={model.up ? UP : DOWN}
              d={smoothPath(model.last.map((v, k) => [sx(k + 1), sy(v)]))}
              initial={reduce ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ ...draw, delay: 0.2 }}
            />
            {model.first.map((v, k) =>
              Number.isFinite(v) ? <circle key={`a${k}`} className="tp-dot-a" cx={sx(k + 1)} cy={sy(v)} r={3} /> : null,
            )}
            {model.last.map((v, k) =>
              Number.isFinite(v) ? <circle key={`b${k}`} className="tp-dot-b" cx={sx(k + 1)} cy={sy(v)} r={3.5} fill={model.up ? UP : DOWN} /> : null,
            )}
          </>
        )}

        {/* hover guide */}
        {card && <line className="tp-guide" x1={card.x} x2={card.x} y1={M.t} y2={H - M.b} />}
        {!compact && <rect className="tp-hit" x={M.l} y={M.t} width={iw} height={ih} onPointerMove={onMove} />}
      </svg>

      {card && (
        <>
          <span className="tp-dot" style={{ left: card.x, top: card.y, background: card.dot }} />
          <div className={`tp-card ${card.x > W / 2 ? "at-left" : "at-right"}`} style={card.x > W / 2 ? { left: M.l + 10 } : { right: M.r + 10 }}>
            <span className="tp-card-head">{card.head}</span>
            {card.rows.map((r) => (
              <span key={r.k} className="tp-card-row">
                <i style={{ background: r.c ?? "rgba(255,255,255,0.5)" }} />
                <span>{r.k}</span>
                <b>{r.v}</b>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
