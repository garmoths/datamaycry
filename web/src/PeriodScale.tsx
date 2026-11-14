/**
 * Period scale under the view switch, drawn as climate stripes: one stripe per year,
 * coloured by that year's world mean difference from the 1991–2020 normal (blue cooler,
 * red warmer). The chosen years stay bright, the rest dim; drag either edge (or press on a
 * stripe) to change the period. The trend is then computed for that period on the map and
 * in the side panel; × goes back to the whole period. Arrow keys work on the two edges.
 * Written with AI assistance (Claude).
 */
import { useRef, useState } from "react";
import { t, type Lang } from "./i18n.ts";
import { Icon } from "./icons.tsx";
import { dragRange, pickEdge, rangeBox, yearAt, type Edge, type Range } from "./periodRange.ts";
import { trendColor } from "./trendImage.ts";

interface Props {
  lang: Lang;
  min: number;
  max: number;
  value: Range;
  /** world mean difference from normal per year, index 0 = min (empty until loaded) */
  means: number[];
  /** the map for this period is being computed */
  busy: boolean;
  onChange: (v: Range) => void;
  onReset: () => void;
}

export function PeriodScale({ lang, min, max, value, means, busy, onChange, onReset }: Props) {
  const [a, b] = value;
  const strip = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Edge | null>(null);
  const [focus, setFocus] = useState<Edge | null>(null);
  const full = a === min && b === max;
  const years = Array.from({ length: max - min + 1 }, (_, k) => min + k);
  const scale = Math.max(1e-9, ...means.filter(Number.isFinite).map(Math.abs));
  const box = rangeBox(value, min, max);
  const ticks = years.filter((y) => y === min || y === max || (y % 10 === 0 && y - min >= 6 && max - y >= 6));

  const yearOf = (clientX: number) => {
    const r = strip.current!.getBoundingClientRect();
    return yearAt(clientX - r.left, r.width, min, max);
  };
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const y = yearOf(e.clientX);
    const edge = pickEdge(y, value);
    strip.current!.setPointerCapture(e.pointerId);
    setDrag(edge);
    onChange(dragRange(value, edge, y, min, max));
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag) onChange(dragRange(value, drag, yearOf(e.clientX), min, max));
  };

  return (
    <section className={`period ${full ? "" : "on"} ${drag ? "dragging" : ""}`} aria-label={t(lang, "period")}>
      <div className="period-head">
        <span className="period-label">{t(lang, "period")}</span>
        <b className="period-years">
          {a}
          <i>–</i>
          {b}
        </b>
        {/* fixed slot, so nothing moves under the cursor when it appears */}
        <span className="period-slot">
          {busy ? (
            <span className="period-spin" aria-label={t(lang, "preparing")} />
          ) : (
            !full && (
              <button className="period-reset" onClick={onReset} aria-label={t(lang, "periodReset")} title={t(lang, "periodReset")}>
                <Icon name="close" size={13} />
              </button>
            )
          )}
        </span>
      </div>
      <div
        ref={strip}
        className="period-strip"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        <div className="period-stripes" aria-hidden>
          {years.map((y, k) => {
            const m = means[k];
            const c = Number.isFinite(m) ? trendColor(m / scale) : null;
            return <span key={y} className={y < a || y > b ? "out" : ""} style={c ? { background: `rgb(${c.join(",")})` } : undefined} />;
          })}
        </div>
        <div className="period-box" style={{ left: `${box.left * 100}%`, width: `${box.width * 100}%` }} aria-hidden>
          <i className={`period-grip start ${focus === "start" ? "focus" : ""}`} />
          <i className={`period-grip end ${focus === "end" ? "focus" : ""}`} />
        </div>
        {/* keyboard and screen readers: the two edges as sliders (arrow keys, Shift = 5 years) */}
        {(["start", "end"] as const).map((edge) => (
          <input
            key={edge}
            className="period-key"
            type="range"
            min={min}
            max={max}
            step={1}
            value={edge === "start" ? a : b}
            aria-label={t(lang, edge === "start" ? "periodStart" : "periodEnd")}
            onChange={(e) => onChange(dragRange(value, edge, +e.target.value, min, max))}
            onFocus={() => setFocus(edge)}
            onBlur={() => setFocus(null)}
          />
        ))}
      </div>
      <div className="period-ticks" aria-hidden>
        {ticks.map((y) => (
          <span key={y} style={{ left: `${((y - min + 0.5) / years.length) * 100}%` }}>
            {y}
          </span>
        ))}
      </div>
    </section>
  );
}
