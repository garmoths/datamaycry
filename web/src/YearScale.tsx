/**
 * Year scale under the view switch. Off: the map shows the 1980–2025 trend. Pick a year
 * (click or drag the strip) and the map shows that year's difference from the 1991–2020
 * normal, the side panel analyses the years up to it; ▶ plays the years in order.
 * The strip is a climate-stripes track: one stripe per year, coloured by the world mean.
 * Written with AI assistance (Claude).
 */
import { t, type Lang } from "./i18n.ts";
import { Icon } from "./icons.tsx";
import { trendColor } from "./trendImage.ts";

interface Props {
  lang: Lang;
  min: number;
  max: number;
  /** null = off (trend map) */
  year: number | null;
  /** world mean difference from normal per year, index 0 = min (empty until loaded) */
  means: number[];
  /** this year's world mean, already formatted */
  value: string | null;
  playing: boolean;
  /** 0…1 while tiles are being prepared */
  preload: number | null;
  onYear: (y: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onClose: () => void;
}

export function YearScale(p: Props) {
  const span = p.max - p.min;
  const years = Array.from({ length: span + 1 }, (_, k) => p.min + k);
  const scale = Math.max(1e-9, ...p.means.filter(Number.isFinite).map(Math.abs));
  const busy = p.preload !== null;
  const on = p.year !== null;
  return (
    <section className={`yearscale ${on ? "on" : ""}`} aria-label={t(p.lang, "timeTravel")}>
      <button
        className="ys-play"
        onClick={p.playing ? p.onPause : p.onPlay}
        disabled={busy}
        aria-label={t(p.lang, p.playing ? "pause" : "play")}
      >
        {busy ? (
          <svg className="ys-ring" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="14" />
            <circle cx="18" cy="18" r="14" style={{ strokeDasharray: `${(p.preload ?? 0) * 88} 88` }} />
          </svg>
        ) : (
          <Icon name={p.playing ? "pause" : "play"} size={14} />
        )}
      </button>
      <div className="ys-track">
        <div className="ys-stripes" aria-hidden>
          {years.map((y, k) => {
            const m = p.means[k];
            const c = on && Number.isFinite(m) ? trendColor(m / scale) : null;
            return <span key={y} style={c ? { background: `rgb(${c.join(",")})` } : undefined} />;
          })}
        </div>
        {on && <div className="ys-cursor" style={{ left: `${((p.year! - p.min) / span) * 100}%` }} aria-hidden />}
        <input
          type="range"
          min={p.min}
          max={p.max}
          value={p.year ?? p.max}
          aria-label={t(p.lang, "animYear")}
          onChange={(e) => p.onYear(+e.target.value)}
        />
      </div>
      <div className="ys-label">
        <b>{on ? p.year : `${p.min}–${p.max}`}</b>
        <small>{on ? (p.value ?? "") : t(p.lang, "trendMap")}</small>
      </div>
      {on && (
        <button className="ys-close" onClick={p.onClose} aria-label={t(p.lang, "closeAnim")}>
          <Icon name="close" size={14} />
        </button>
      )}
    </section>
  );
}
