/**
 * "Change month by month" card (docs/FEATURE_PLAN.md §5): twelve cells in the trend map's
 * colours, strength = evidence after the 12-test correction, and a two-line summary.
 * Only for places with a monthly series. Written with AI assistance (Claude).
 */
import { useMemo } from "react";
import type { Series } from "./data.ts";
import { MONTHS, monthlyTrends, summarizeMonths, type MonthTrend } from "./monthly.ts";
import { trendColor } from "./trendField.ts";
import { smartSigned, type Lang } from "./i18n.ts";
import { asView, useChangeView, viewDecimals, viewUnit } from "./changeView.ts";
import "./monthstrip.css";

const T = {
  title: { tr: "Aylara göre değişim", en: "Change by month" },
  pill: { tr: "12 test, düzeltilmiş", en: "12 tests, corrected" },
  up: { tr: "En belirgin artış", en: "Clearest rise" },
  down: { tr: "En belirgin azalış", en: "Clearest fall" },
  none: { tr: "Hiçbir ay tek başına belirgin bir değişim göstermiyor.", en: "No single month shows a clear change on its own." },
  quiet: { tr: "ayda belirgin değişim yok", en: "months show no clear change" },
  constant: { tr: "ayda değer hiç değişmiyor (ör. hiç kar yok)", en: "months never change (e.g. no snow at all)" },
  note: {
    tr: "Her ay, kartla aynı dönemde ayrı test edildi. 12 test birlikte yapıldığı için sonuçlar Benjamini–Hochberg ile düzeltildi; soluk kutular tek başına belirgin değil.",
    en: "Each month was tested on its own over the card's period. Because 12 tests run together, the results are corrected with Benjamini–Hochberg; faint cells are not clear on their own.",
  },
  level: { strong: { tr: "güçlü", en: "strong" }, possible: { tr: "olası", en: "possible" }, none: { tr: "belirgin değil", en: "not clear" }, constant: { tr: "hiç değişmiyor", en: "never changes" }, untested: { tr: "test edilemedi", en: "could not be tested" } },
} as const;

const signed = (lang: Lang, x: number, d: number) => {
  const s = smartSigned(x, d);
  return lang === "tr" ? s.replace(".", ",") : s;
};

const OPACITY: Record<MonthTrend["level"], number> = { strong: 1, possible: 0.75, none: 0.28, constant: 0, untested: 0 };

export function MonthStrip({ series, startYear, endYear, lang, unit, decimals }: { series: Series; startYear: number; endYear: number; lang: Lang; unit: string; decimals: number }) {
  const months = useMemo(() => monthlyTrends(series, { startYear, endYear }), [series, startYear, endYear]);
  const sum = useMemo(() => summarizeMonths(months), [months]);
  const max = Math.max(1e-12, ...months.filter((m) => Number.isFinite(m.slope)).map((m) => Math.abs(m.slope)));
  const names = MONTHS[lang];
  const constant = months.filter((m) => m.level === "constant").length;
  // tooltips follow the app-wide per decade / total choice (changeView.ts)
  const [view] = useChangeView();
  const per = viewUnit(lang, unit, view, [startYear, endYear]);

  return (
    <>
      <header className="card-head">
        <h3>{T.title[lang]}</h3>
        <span className="pill">{T.pill[lang]}</span>
      </header>
      <ol className="month-strip">
        {months.map((m) => {
          const ok = Number.isFinite(m.slope) && m.level !== "constant";
          const [r, g, b] = trendColor(ok ? m.slope / max : 0);
          const tip = ok
            ? `${names[m.month - 1]}: ${signed(lang, asView(m.slope, view, [startYear, endYear]), viewDecimals(view, decimals))} ${per} · ${T.level[m.level][lang]}`
            : `${names[m.month - 1]}: ${T.level[m.level][lang]}`;
          return (
            <li key={m.month} title={tip} aria-label={tip} className={`lvl-${m.level}`}>
              <span className="month-cell" style={{ background: `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${OPACITY[m.level]})` }} />
              <small>{names[m.month - 1].slice(0, 3)}</small>
            </li>
          );
        })}
      </ol>
      <ul className="month-summary">
        {sum.up.length > 0 && (
          <li>
            <b>{T.up[lang]}:</b> {sum.up.map((m) => names[m - 1]).join(", ")}
          </li>
        )}
        {sum.down.length > 0 && (
          <li>
            <b>{T.down[lang]}:</b> {sum.down.map((m) => names[m - 1]).join(", ")}
          </li>
        )}
        {!sum.up.length && !sum.down.length && <li>{T.none[lang]}</li>}
        {sum.quiet > 0 && (sum.up.length > 0 || sum.down.length > 0) && (
          <li>
            {sum.quiet} {T.quiet[lang]}
          </li>
        )}
        {constant > 0 && (
          <li>
            {constant} {T.constant[lang]}
          </li>
        )}
      </ul>
      <p className="fine">{T.note[lang]}</p>
    </>
  );
}
