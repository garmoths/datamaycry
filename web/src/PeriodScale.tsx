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
  // the native thumb (16 px) travels from 8 px to width − 8 px: the fill follows the thumb centres
  const pos = (y: number) => `calc(8px + (100% - 16px) * ${(y - min) / span})`;
  const full = a === min && b === max;
  return (
    <section className={`period ${full ? "" : "on"}`} aria-label={t(lang, "period")}>
      <span className="period-label">{t(lang, "period")}</span>
      <div className="period-track">
        <div className="period-rail" />
        <div className="period-fill" style={{ left: pos(a), width: `calc((100% - 16px) * ${(b - a) / span})` }} />
        <input
          type="range"
          min={min}
          max={max}
          value={a}
          aria-label={t(lang, "periodStart")}
          // when both thumbs meet at the right end, the start thumb must stay reachable
          style={{ zIndex: a > (min + max) / 2 ? 2 : 1 }}
          onChange={(e) => {
            // pushing into the other thumb moves both, keeping at least 10 years
            const x = Math.min(+e.target.value, max - MIN_SPAN);
            onChange([x, Math.max(b, x + MIN_SPAN)]);
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={b}
          aria-label={t(lang, "periodEnd")}
          onChange={(e) => {
            const x = Math.max(+e.target.value, min + MIN_SPAN);
            onChange([Math.min(a, x - MIN_SPAN), x]);
          }}
        />
      </div>
      <b className="period-years">
        {a}–{b}
      </b>
      {/* fixed slot, so the track never changes width under the cursor */}
      <span className="period-slot">
        {busy ? (
          <span className="period-spin" aria-label={t(lang, "preparing")} />
        ) : (
          !full && (
            <button className="period-reset" onClick={onReset} aria-label={t(lang, "periodReset")}>
              <Icon name="close" size={14} />
            </button>
          )
        )}
      </span>
    </section>
  );
}
