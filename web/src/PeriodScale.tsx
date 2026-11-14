/**
 * Period scale under the view switch: choose the first and last year, and the trend is
 * computed for that period on the map and in the side panel. × goes back to the full period.
 * Written with AI assistance (Claude).
 */
import { t, type Lang } from "./i18n.ts";
import { Icon } from "./icons.tsx";

/** a trend needs at least 10 years (same rule as the cards) */
export const MIN_SPAN = 9;
/** thumb diameter in px (App.css .period-track input thumbs) */
const THUMB = 20;

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
  // the native thumb travels from THUMB/2 to width − THUMB/2: the fill follows the thumb centres
  const pos = (y: number) => `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${(y - min) / span})`;
  const full = a === min && b === max;
  return (
    <section className={`period ${full ? "" : "on"}`} aria-label={t(lang, "period")}>
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
                <Icon name="close" size={14} />
              </button>
            )
          )}
        </span>
      </div>
      <div className="period-track">
        <div className="period-rail" />
        <div className="period-fill" style={{ left: pos(a), width: `calc((100% - ${THUMB}px) * ${(b - a) / span})` }} />
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
      <div className="period-ticks" aria-hidden>
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </section>
  );
}
