/**
 * Period scale under the view switch: choose the first and last year, and the trend is
 * computed for that period on the map and in the side panel. × goes back to the full period.
 * Written with AI assistance (Claude).
 */
import { t, type Lang } from "./i18n.ts";
import { Icon } from "./icons.tsx";

/** a trend needs at least 10 years (same rule as the cards) */
export const MIN_SPAN = 9;

interface Props {
  lang: Lang;
  min: number;
  max: number;
  value: [number, number];
  /** the map for this period is being computed */
  busy: boolean;
  onChange: (v: [number, number]) => void;
  onReset: () => void;
}

export function PeriodScale({ lang, min, max, value: [a, b], busy, onChange, onReset }: Props) {
  const span = max - min;
  const pos = (y: number) => `${((y - min) / span) * 100}%`;
  const full = a === min && b === max;
  return (
    <section className={`period ${full ? "" : "on"}`} aria-label={t(lang, "period")}>
      <span className="period-label">{t(lang, "period")}</span>
      <div className="period-track">
        <div className="period-rail" />
        <div className="period-fill" style={{ left: pos(a), right: `calc(100% - ${pos(b)})` }} />
        <input
          type="range"
          min={min}
          max={max}
          value={a}
          aria-label={t(lang, "periodStart")}
          onChange={(e) => onChange([Math.min(+e.target.value, b - MIN_SPAN), b])}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={b}
          aria-label={t(lang, "periodEnd")}
          onChange={(e) => onChange([a, Math.max(+e.target.value, a + MIN_SPAN)])}
        />
      </div>
      <b className="period-years">
        {a}–{b}
      </b>
      {busy ? (
        <span className="period-spin" aria-label={t(lang, "preparing")} />
      ) : (
        !full && (
          <button className="period-reset" onClick={onReset} aria-label={t(lang, "periodReset")}>
            <Icon name="close" size={14} />
          </button>
        )
      )}
    </section>
  );
}
