/**
 * The analysed period in the chart drawer: one track with two handles (start and end year).
 * Two native range inputs share the track, so keyboard, touch and screen readers work as
 * usual; the chosen span is drawn between them, with decade marks underneath and the
 * years in bubbles over the handles. Styled to match TrendPlot (yearrange.css).
 * Written with AI assistance (Claude).
 */
import type { CSSProperties } from "react";
import type { Lang } from "./i18n.ts";
import "./yearrange.css";

export function YearRange({ min, max, value, onChange, lang }: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  lang: Lang;
}) {
  const [a, b] = value;
  const pct = (y: number) => ((y - min) / Math.max(1, max - min)) * 100;
  const decades = [];
  for (let y = Math.ceil(min / 10) * 10; y <= max; y += 10) decades.push(y);
  const tr = lang === "tr";
  const full = a === min && b === max;
  return (
    <div className="yr" style={{ "--a": `${pct(a)}%`, "--b": `${pct(b)}%` } as CSSProperties}>
      <div className="yr-head">
        <span className="yr-label">{tr ? "Dönem" : "Period"}</span>
        <b className="yr-years">
          {a}
          <span>–</span>
          {b}
        </b>
        <span className="yr-span">
          {b - a + 1} {tr ? "yıl" : "years"}
        </span>
        {!full && (
          <button className="yr-reset" onClick={() => onChange([min, max])}>
            {tr ? "Tümü" : "All"}
          </button>
        )}
      </div>
      <div className="yr-track">
        <div className="yr-rail" />
        <div className="yr-fill" />
        <span className="yr-bubble start">{a}</span>
        <span className="yr-bubble end">{b}</span>
        <input
          type="range"
          aria-label={tr ? "Başlangıç yılı" : "Start year"}
          min={min}
          max={max}
          value={a}
          onChange={(e) => onChange([Math.min(+e.target.value, b - 1), b])}
        />
        <input
          type="range"
          aria-label={tr ? "Bitiş yılı" : "End year"}
          min={min}
          max={max}
          value={b}
          onChange={(e) => onChange([a, Math.max(+e.target.value, a + 1)])}
        />
      </div>
      <div className="yr-ticks" aria-hidden>
        {decades.map((y) => (
          <span key={y} style={{ left: `${pct(y)}%` }}>
            {y}
          </span>
        ))}
      </div>
    </div>
  );
}
