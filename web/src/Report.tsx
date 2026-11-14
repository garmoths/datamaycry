/**
 * One- to two-page PDF report of the selected place (docs/FEATURE_PLAN.md §6).
 *
 * Uses the browser's own "Print → Save as PDF": no PDF library, the text stays selectable
 * and sharp, the figures are vector SVG. The report is rendered into its own element next to
 * the app, shown only by the print stylesheet (report.css), printed once its asynchronous
 * parts (fonts, fingerprint, ranking) are in, and removed afterwards.
 *
 * Contents: title block · finding · key numbers · chart · extras from the panel
 * (change of pace, fingerprint, change by month, ranking) · method · limits · data and
 * sources with DOIs · link back to the same view. Demo data carries a watermark.
 *
 * Written with AI assistance (Claude).
 */
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { TrendResult, VariableInfo, VariablesFile } from "./data.ts";
import type { AreaSummary } from "./continentStats.ts";
import type { ChangePoint } from "./changepoint.ts";
import { METHOD_LIMITS, METHOD_STEPS } from "./content.ts";
import { METHOD_EXTRAS, METHOD_EXTRAS_TITLE } from "./methodExtras.ts";
import { Provenance, References } from "./Evidence.tsx";
import { smartSigned, unitLabel, type Lang } from "./i18n.ts";
import { COLD, WARM } from "./trendField.ts";
import "./report.css";

const T = {
  heading: { tr: "İklim trend raporu", en: "Climate trend report" },
  finding: { tr: "Bulgu", en: "Finding" },
  numbers: { tr: "Ana sayılar", en: "Key numbers" },
  slope: { tr: "10 yılda değişim (Sen eğimi)", en: "Change per decade (Sen's slope)" },
  ci: { tr: "%95 aralık", en: "95 % range" },
  p: { tr: "Mann-Kendall p", en: "Mann-Kendall p" },
  total: { tr: "Dönem boyunca toplam", en: "Total over the period" },
  years: { tr: "Test edilen yıl", en: "Years tested" },
  level: { tr: "Kanıt", en: "Evidence" },
  areaMean: { tr: "Alan ortalaması (trend haritası)", en: "Area mean (trend map)" },
  cells: { tr: "Izgara hücresi", en: "Grid cells" },
  strongUp: { tr: "Güçlü artış gösteren alan", en: "Area with a strong rise" },
  strongDown: { tr: "Güçlü azalış gösteren alan", en: "Area with a strong fall" },
  chart: { tr: "Yıllık fark (1991–2020 normaline göre) ve trend", en: "Yearly difference from the 1991–2020 normal, and trend" },
  details: { tr: "Ayrıntılar", en: "Details" },
  method: { tr: "Yöntem", en: "Method" },
  limits: { tr: "Sınırlamalar", en: "Limitations" },
  data: { tr: "Veri", en: "Data" },
  sources: { tr: "Kaynakça", en: "References" },
  link: { tr: "Bu görünümü açan bağlantı", en: "Link to this view" },
  made: { tr: "Data May Cry ile oluşturuldu", en: "Made with Data May Cry" },
  demo: { tr: "DEMO VERİ", en: "DEMO DATA" },
  demoNote: {
    tr: "Bu rapor uydurma desenli demo veriyle üretildi; sayılar gerçek değildir.",
    en: "This report was made from demo data with a made-up pattern; the numbers are not real.",
  },
  levels: { strong: { tr: "güçlü", en: "strong" }, possible: { tr: "olası", en: "possible" }, none: { tr: "gösterilemedi", en: "not shown" } },
} as const;

const fmt = (lang: Lang, x: number, d: number) => {
  const s = smartSigned(x, d);
  return lang === "tr" ? s.replace(".", ",") : s;
};
const pct = (x: number) => `%${Math.round(x * 100)}`;

/** Static yearly-anomaly chart for paper: bars, the Sen line, the bend if any. */
function PaperChart({ result, bendYear, unit, lang }: { result: TrendResult; bendYear: number | null; unit: string; lang: Lang }) {
  const { years, anomalies } = result.annual;
  const pts = years.map((y, k) => [y, anomalies[k]] as const).filter(([, a]) => Number.isFinite(a));
  if (pts.length < 3) return null;
  const W = 640, H = 210, L = 44, R = 8, TOP = 20, B = 22;
  const first = years[0], last = years[years.length - 1];
  const line = (y: number) => result.line.intercept + result.line.slopePerYear * (y - result.startYear);
  const vals = [...pts.map(([, a]) => a), line(first), line(last)];
  const lo = Math.min(...vals, 0), hi = Math.max(...vals, 0);
  const span = Math.max(1, last - first);
  const x = (y: number) => L + ((y - first + 0.5) / (span + 1)) * (W - L - R);
  const yy = (a: number) => TOP + (1 - (a - lo) / Math.max(1e-9, hi - lo)) * (H - TOP - B);
  const bw = Math.max(1, ((W - L - R) / (span + 1)) * 0.7);
  const col = (c: readonly number[]) => `rgb(${c.join(",")})`;
  const ticks = [first, Math.round((first + last) / 2), last];
  const label = (v: number) => (lang === "tr" ? v.toFixed(2).replace(".", ",") : v.toFixed(2));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="report-chart" role="img" aria-label={T.chart[lang]}>
      <line x1={L} x2={W - R} y1={yy(0)} y2={yy(0)} stroke="#888" strokeWidth={0.8} />
      {pts.map(([y, a]) => (
        <rect key={y} x={x(y) - bw / 2} width={bw} y={Math.min(yy(a), yy(0))} height={Math.max(0.6, Math.abs(yy(a) - yy(0)))} fill={col(a >= 0 ? WARM : COLD)} opacity={0.85} />
      ))}
      <line x1={x(first)} y1={yy(line(first))} x2={x(last)} y2={yy(line(last))} stroke="#111" strokeWidth={1.6} />
      {bendYear !== null && bendYear > first && bendYear <= last && (
        <line x1={x(bendYear) - (W - L - R) / (span + 1) / 2} x2={x(bendYear) - (W - L - R) / (span + 1) / 2} y1={TOP} y2={H - B} stroke="#111" strokeWidth={0.8} strokeDasharray="3 3" />
      )}
      {ticks.map((y) => (
        <text key={y} x={x(y)} y={H - 6} textAnchor="middle" className="report-tick">
          {y}
        </text>
      ))}
      <text x={L - 6} y={yy(hi) + 4} textAnchor="end" className="report-tick">
        {label(hi)}
      </text>
      <text x={L - 6} y={yy(0) + 4} textAnchor="end" className="report-tick">
        0
      </text>
      <text x={L - 6} y={yy(lo)} textAnchor="end" className="report-tick">
        {label(lo)}
      </text>
      <text x={L} y={10} className="report-tick">
        {unit}
      </text>
    </svg>
  );
}

export interface ReportProps {
  lang: Lang;
  variables: VariablesFile;
  variable: VariableInfo;
  title: string;
  trail: string[];
  /** e.g. "1980–2025 · all year" */
  periodLabel: string;
  /** the card's sentence */
  finding: string;
  result: TrendResult | null;
  area: AreaSummary | null;
  bend: ChangePoint | null;
  /** panel parts that also belong on paper (fingerprint, change by month, ranking) */
  extras: ReactNode;
  onDone: () => void;
}

/** Waits for fonts and the panel parts that load asynchronously, then opens the print dialog. */
function usePrintWhenReady(onDone: () => void) {
  useEffect(() => {
    let dead = false;
    const done = () => {
      if (!dead) onDone();
    };
    (async () => {
      await document.fonts?.ready;
      // the fingerprint and ranking load their data asynchronously; give them up to 4 s
      const t0 = performance.now();
      while (performance.now() - t0 < 4000 && document.querySelector(".report .shimmer-text")) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 150));
      if (dead) return;
      window.addEventListener("afterprint", done, { once: true });
      window.print();
      // some browsers never fire afterprint when the dialog is cancelled
      setTimeout(done, 1500);
    })();
    return () => {
      dead = true;
      window.removeEventListener("afterprint", done);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

export function Report(p: ReportProps) {
  const { lang, variable: v, variables, result, area } = p;
  usePrintWhenReady(p.onDone);
  const unit = unitLabel(v.unit, lang);
  const per = `${unit}/${lang === "tr" ? "10 yıl" : "decade"}`;
  const ok = result?.status === "ok";
  const d = v.decimals + 1;
  const [made] = useState(() => new Date().toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB", { year: "numeric", month: "long", day: "numeric" }));

  return createPortal(
    <div className="report-root">
      <article className="report" lang={lang}>
        {variables.is_mock && <div className="report-watermark">{T.demo[lang]}</div>}
        <header className="report-head">
          <p className="report-kicker">
            {T.heading[lang]} · {made}
          </p>
          <h1>{p.title}</h1>
          <p className="report-sub">
            {p.trail.join(" / ")} · {v.name[lang]} ({unit}) · {p.periodLabel}
          </p>
          {variables.is_mock && <p className="report-demo">{T.demoNote[lang]}</p>}
        </header>

        <section>
          <h2>{T.finding[lang]}</h2>
          <p className="report-finding">{p.finding}</p>
        </section>

        <section>
          <h2>{T.numbers[lang]}</h2>
          <table className="report-table">
            <tbody>
              {ok ? (
                <>
                  <tr><th>{T.slope[lang]}</th><td>{fmt(lang, result!.slopePerDecade, d)} {per}</td></tr>
                  <tr><th>{T.ci[lang]}</th><td>{fmt(lang, result!.ci95[0], d)} … {fmt(lang, result!.ci95[1], d)} {per}</td></tr>
                  <tr><th>{T.p[lang]}</th><td>{result!.pValue < 0.001 ? "< 0.001" : result!.pValue.toFixed(3)}</td></tr>
                  <tr><th>{T.total[lang]}</th><td>{fmt(lang, result!.totalChange, v.decimals)} {unit}</td></tr>
                  <tr><th>{T.years[lang]}</th><td>{result!.annual.years.length} ({result!.startYear}–{result!.endYear})</td></tr>
                  <tr><th>{T.level[lang]}</th><td>{T.levels[result!.level][lang]}</td></tr>
                </>
              ) : area ? (
                <>
                  <tr><th>{T.areaMean[lang]}</th><td>{fmt(lang, area.meanSlope, d)} {per}</td></tr>
                  <tr><th>{T.strongUp[lang]}</th><td>{pct(area.strongUp)}</td></tr>
                  <tr><th>{T.strongDown[lang]}</th><td>{pct(area.strongDown)}</td></tr>
                  <tr><th>{T.cells[lang]}</th><td>{area.cells}</td></tr>
                </>
              ) : null}
            </tbody>
          </table>
        </section>

        {ok && (
          <section>
            <h2>{T.chart[lang]}</h2>
            <PaperChart result={result!} bendYear={p.bend?.year ?? null} unit={unit} lang={lang} />
          </section>
        )}

        <section className="report-extras">
          <h2>{T.details[lang]}</h2>
          {p.extras}
        </section>

        <section className="report-method">
          <h2>{T.method[lang]}</h2>
          {/* the step titles carry their own numbers */}
          <ul>
            {METHOD_STEPS.map((s, k) => (
              <li key={k}>
                <b>{s.title[lang]}.</b> {s.body[lang]}
              </li>
            ))}
          </ul>
          <h2>{METHOD_EXTRAS_TITLE[lang]}</h2>
          <ul>
            {METHOD_EXTRAS.map((s, k) => (
              <li key={k}>
                <b>{s.title[lang]}.</b> {s.body[lang]}
              </li>
            ))}
          </ul>
          <h2>{T.limits[lang]}</h2>
          <p>{METHOD_LIMITS[lang]}</p>
        </section>

        <section>
          <h2>{T.data[lang]}</h2>
          <Provenance variables={variables} lang={lang} />
          <h2>{T.sources[lang]}</h2>
          <References lang={lang} />
        </section>

        <footer className="report-foot">
          <span>{T.link[lang]}:</span> <a href={location.href}>{location.href}</a>
          <br />
          {T.made[lang]} · NASA MERRA-2
        </footer>
      </article>
    </div>,
    document.body,
  );
}
