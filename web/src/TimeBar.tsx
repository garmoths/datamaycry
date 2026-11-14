/**
 * "Time travel" controls (contract 1.4): play/pause, year scrubber, range, speed,
 * 5-year smoothing and a fixed-scale legend. Pure UI; playback logic lives in App + timeline.ts.
 * Written with AI assistance (Claude).
 */
import { t, type Lang } from "./i18n.ts";
import { Icon } from "./icons.tsx";
import { SPEEDS, type Timeline } from "./timeline.ts";
import { PALETTE_CSS } from "./trendImage.ts";

interface Props {
  lang: Lang;
  unit: string;
  decimals: number;
  colorMax: number | null;
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
  return (
    <section className="timebar" aria-label={t(lang, "timeTravel")}>
      <div className="tb-row">
        <button
          className="tb-play"
          onClick={p.playing ? p.onPause : p.onPlay}
          disabled={busy || !!p.error}
          aria-label={t(lang, p.playing ? "pause" : "play")}
          data-tip={t(lang, p.playing ? "pause" : "play")}
        >
          {busy ? <span className="tb-pct">{Math.round((p.preload ?? 0) * 100)}%</span> : <Icon name={p.playing ? "pause" : "play"} size={18} />}
        </button>
        <div className="tb-scrub">
          <input
            type="range"
            min={tl.from}
            max={tl.to}
            value={tl.year}
            aria-label={t(lang, "animYear")}
            onChange={(e) => p.onYear(+e.target.value)}
          />
          <div className="tb-ends">
            <span>{tl.from}</span>
            <b>{tl.year}</b>
            <span>{tl.to}</span>
          </div>
        </div>
        <button className="icon-btn" onClick={p.onClose} aria-label={t(lang, "closeAnim")} data-tip={t(lang, "closeAnim")}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="tb-row tb-small">
        <label className="tb-range">
          {t(lang, "animRange")} <b>{tl.from}–{tl.to}</b>
          <span className="range2">
            <input type="range" aria-label="start year" min={tl.min} max={tl.max} value={tl.from} onChange={(e) => p.onRange(+e.target.value, tl.to)} />
            <input type="range" aria-label="end year" min={tl.min} max={tl.max} value={tl.to} onChange={(e) => p.onRange(tl.from, +e.target.value)} />
          </span>
        </label>
        <div className="seg small" role="group" aria-label={t(lang, "speed")}>
          {SPEEDS.map((s) => (
            <button key={s} className={p.speed === s ? "on" : ""} onClick={() => p.onSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        <label className="tb-check" data-tip={t(lang, "smoothTip")}>
          <input type="checkbox" checked={p.smooth} onChange={(e) => p.onSmooth(e.target.checked)} /> {t(lang, "smooth5")}
        </label>
      </div>
      {p.colorMax !== null && (
        <div className="tb-legend">
          <div className="bar" style={{ background: PALETTE_CSS }} />
          <div className="ends">
            <span>{num(lang, -p.colorMax, p.decimals)} {p.unit}</span>
            <span>{t(lang, "animLegend")}</span>
            <span>{num(lang, p.colorMax, p.decimals)} {p.unit}</span>
          </div>
        </div>
      )}
      {p.error && <p className="warn">{p.error}</p>}
    </section>
  );
}
