/**
 * "Time travel" controls (contract 1.4). The scrubber's track is itself a climate-stripes
 * strip: one stripe per year, coloured by that year's world mean difference from normal,
 * so the whole 46 years can be read at a glance before pressing play.
 * Pure UI; playback logic lives in App + timeline.ts. Written with AI assistance (Claude).
 */
import { t, type Lang } from "./i18n.ts";
import { Icon } from "./icons.tsx";
import { SPEEDS, type Timeline } from "./timeline.ts";
import { PALETTE_CSS, trendColor } from "./trendImage.ts";

interface Props {
  lang: Lang;
  unit: string;
  decimals: number;
  colorMax: number | null;
  /** world mean difference from normal per year, index 0 = tl.min */
  means: number[];
  tl: Timeline;
  playing: boolean;
  speed: number;
  smooth: boolean;
  /** 0…1 while tiles are being prepared, null otherwise */
  preload: number | null;
  error: string | null;
  onPlay: () => void;
  onPause: () => void;
  onYear: (y: number) => void;
  onRange: (from: number, to: number) => void;
  onSpeed: (s: number) => void;
  onSmooth: (on: boolean) => void;
  onClose: () => void;
}

const num = (lang: Lang, x: number, d: number) => {
  const s = (x > 0 ? "+" : "") + x.toFixed(d);
  return lang === "tr" ? s.replace(".", ",") : s;
};

export function TimeBar(p: Props) {
  const { lang, tl } = p;
  const busy = p.preload !== null;
  const span = tl.max - tl.min;
  const pos = (y: number) => `${((y - tl.min) / span) * 100}%`;
  const scale = Math.max(1e-9, ...p.means.filter(Number.isFinite).map(Math.abs));
  const years = Array.from({ length: span + 1 }, (_, k) => tl.min + k);
  // decades, plus the last year unless a decade label sits right next to it
  const ticks = years.filter((y) => y === tl.max || (y % 10 === 0 && tl.max - y >= 6));

  return (
    <section className="timebar" aria-label={t(lang, "timeTravel")}>
      <button
        className={`tb-play ${p.playing ? "on" : ""}`}
        onClick={p.playing ? p.onPause : p.onPlay}
        disabled={busy || !!p.error}
        aria-label={t(lang, p.playing ? "pause" : "play")}
        data-tip={t(lang, p.playing ? "pause" : "play")}
      >
        {busy ? (
          <svg className="tb-ring" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="15" />
            <circle cx="18" cy="18" r="15" style={{ strokeDasharray: `${(p.preload ?? 0) * 94.2} 94.2` }} />
          </svg>
        ) : (
          <Icon name={p.playing ? "pause" : "play"} size={20} />
        )}
      </button>

      <div className="tb-main">
        <div className="tb-head">
          {/* the year itself is the big label on the map */}
          <span className="tb-mean">{busy ? `${t(lang, "preparing")} ${Math.round((p.preload ?? 0) * 100)}%` : ""}</span>
          <span className="tb-tools">
            <span className="seg small" role="group" aria-label={t(lang, "speed")}>
              {SPEEDS.map((s) => (
                <button key={s} className={p.speed === s ? "on" : ""} onClick={() => p.onSpeed(s)}>
                  {s}×
                </button>
              ))}
            </span>
            <button
              className={`tb-chip ${p.smooth ? "on" : ""}`}
              onClick={() => p.onSmooth(!p.smooth)}
              aria-pressed={p.smooth}
              data-tip={t(lang, "smoothTip")}
            >
              {t(lang, "smooth5")}
            </button>
          </span>
        </div>

        <div className="tb-track">
          <div className="tb-stripes" aria-hidden>
            {years.map((y, k) => {
              const m = p.means[k];
              const c = Number.isFinite(m) ? trendColor(m / scale) : [60, 60, 66];
              const out = y < tl.from || y > tl.to;
              return <span key={y} style={{ background: `rgb(${c.join(",")})`, opacity: out ? 0.18 : 1 }} />;
            })}
          </div>
          <div className="tb-cursor" style={{ left: pos(tl.year) }} aria-hidden />
          <input
            type="range"
            min={tl.min}
            max={tl.max}
            value={tl.year}
            aria-label={t(lang, "animYear")}
            onChange={(e) => {
              const y = +e.target.value;
              if (y < tl.from || y > tl.to) p.onRange(Math.min(y, tl.from), Math.max(y, tl.to));
              p.onYear(y);
            }}
          />
        </div>

        <div className="tb-foot">
          <span className="tb-ticks" aria-hidden>
            {ticks.map((y) => (
              <i key={y} style={{ left: pos(y) }}>
                {y}
              </i>
            ))}
          </span>
        </div>

        <div className="tb-bottom">
          <label className="tb-range">
            {t(lang, "animRange")}
            <select value={tl.from} onChange={(e) => p.onRange(+e.target.value, tl.to)}>
              {years.filter((y) => y < tl.to).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            –
            <select value={tl.to} onChange={(e) => p.onRange(tl.from, +e.target.value)}>
              {years.filter((y) => y > tl.from).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          {p.colorMax !== null && (
            <span className="tb-legend" data-tip={t(lang, "animLegend")}>
              <small>{num(lang, -p.colorMax, p.decimals)}</small>
              <span className="bar" style={{ background: PALETTE_CSS }} />
              <small>
                {num(lang, p.colorMax, p.decimals)} {p.unit}
              </small>
            </span>
          )}
        </div>
        {p.error && <p className="warn">{p.error}</p>}
      </div>

      <button className="tb-close" onClick={p.onClose} aria-label={t(lang, "closeAnim")} data-tip={t(lang, "closeAnim")}>
        <Icon name="close" size={15} />
      </button>
    </section>
  );
}
