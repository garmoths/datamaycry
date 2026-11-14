/**
 * The calculation, drawn. Small inline-SVG figures for the analysis column:
 *  - ZCurve:    where the Mann-Kendall Z score falls on the "pure chance" bell curve
 *  - CiBar:     Sen's slope with its 95 % interval against the zero line
 *  - Histogram: how the cell slopes of an area are spread (trend map)
 *  - Gates:     the checks a result passes on the way to its label
 *  - StatGrid:  the numbers behind them
 * Shapes ease in with motion; nothing moves for people who prefer reduced motion.
 * Written with AI assistance (Claude).
 */
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { AreaSummary } from "./continentStats.ts";
import type { Diagnostics, GateId } from "./diagnostics.ts";
import { Icon } from "./icons.tsx";
import { smartSigned, type Lang } from "./i18n.ts";
import { COLD, WARM } from "./trendField.ts";

const rgb = (c: readonly number[]) => `rgb(${c.join(",")})`;
const EASE = [0.22, 1, 0.36, 1] as const;

/** Standard normal density (not normalised: only the shape is drawn). */
const bell = (z: number) => Math.exp(-0.5 * z * z);

/** The Z score on the bell curve of "no trend, only chance". The tails beyond ±1.96 hold 5 %. */
export function ZCurve({ z, p, lang }: { z: number; p: number; lang: Lang }) {
  const reduce = useReducedMotion();
  const W = 320, H = 96, B = 74, R = 4.6; // B = baseline y, R = half-width in Z units
  const x = (v: number) => ((v + R) / (2 * R)) * W;
  const y = (v: number) => B - bell(v) * 58;
  const curve = (from: number, to: number) => {
    const pts: string[] = [];
    for (let v = from; v <= to + 1e-9; v += 0.1) pts.push(`${x(v).toFixed(1)},${y(v).toFixed(1)}`);
    return pts;
  };
  const area = (from: number, to: number) => `M${x(from)},${B} L${curve(from, to).join(" L")} L${x(to)},${B} Z`;
  const shown = Math.max(-R + 0.15, Math.min(R - 0.15, z));
  const off = Math.abs(z) > R - 0.15;
  const tr = lang === "tr";
  const zText = `Z = ${z >= 0 ? "+" : ""}${z.toFixed(2)}`;
  return (
    <figure className="viz zcurve">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${zText}, p ${p < 0.001 ? "< 0.001" : `= ${p.toFixed(3)}`}`}>
        <path d={area(-R, -1.96)} className="z-tail" />
        <path d={area(1.96, R)} className="z-tail" />
        <path d={area(-1.96, 1.96)} className="z-body" />
        <path d={`M${curve(-R, R).join(" L")}`} className="z-line" />
        <line x1={0} x2={W} y1={B} y2={B} className="axis" />
        {[-1.96, 0, 1.96].map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={B} y2={B + 4} className="axis" />
            <text x={x(v)} y={B + 15} textAnchor="middle" className="tick">
              {v === 0 ? "0" : v > 0 ? "+1.96" : "−1.96"}
            </text>
          </g>
        ))}
        <motion.g initial={reduce ? false : { x: x(0), opacity: 0 }} animate={{ x: x(shown), opacity: 1 }} transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}>
          <line x1={0} x2={0} y1={10} y2={B} className="z-mark" />
          <circle cx={0} cy={B} r={3.5} className="z-dot" />
          <text x={shown > 0 ? -6 : 6} y={9} textAnchor={shown > 0 ? "end" : "start"} className="z-label">
            {zText}
            {off ? (z > 0 ? " →" : " ←") : ""}
          </text>
        </motion.g>
      </svg>
      <figcaption>
        {tr
          ? "Trend olmasaydı Z bu çan eğrisinin ortasına düşerdi. Koyu uçlar tesadüfen ancak %5 ihtimalle görülür."
          : "With no trend, Z would land near the middle of this bell curve. The dark tails are reached by chance only 5 % of the time."}
      </figcaption>
    </figure>
  );
}

/** Sen's slope and its 95 % interval against zero. An interval that clears zero is the key check. */
export function CiBar({ slope, ci, unit, decimals, lang }: { slope: number; ci: [number, number]; unit: string; decimals: number; lang: Lang }) {
  const reduce = useReducedMotion();
  const W = 320, H = 54, Y = 22, P = 14;
  const R = Math.max(Math.abs(ci[0]), Math.abs(ci[1]), Math.abs(slope), 1e-12) * 1.25;
  const x = (v: number) => P + ((v + R) / (2 * R)) * (W - 2 * P);
  const clear = ci[0] > 0 || ci[1] < 0;
  const color = rgb(slope >= 0 ? WARM : COLD);
  const f = (v: number) => smartSigned(v, decimals + 1);
  return (
    <figure className="viz cibar">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${f(slope)} ${unit}, 95% ${f(ci[0])} … ${f(ci[1])}`}>
        <line x1={P} x2={W - P} y1={Y} y2={Y} className="axis" />
        <line x1={x(0)} x2={x(0)} y1={6} y2={Y + 10} className="zero" />
        <text x={x(0)} y={H - 4} textAnchor="middle" className="tick">
          0
        </text>
        <motion.rect
          x={x(ci[0])}
          y={Y - 5}
          height={10}
          rx={5}
          fill={color}
          fillOpacity={0.35}
          initial={reduce ? false : { width: 0, attrX: x(slope) }}
          animate={{ width: Math.max(2, x(ci[1]) - x(ci[0])), attrX: x(ci[0]) }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.2 }}
        />
        <motion.circle cy={Y} r={5.5} fill={color} stroke="#fff" strokeWidth={1.5} initial={reduce ? false : { cx: x(0) }} animate={{ cx: x(slope) }} transition={{ duration: 0.8, ease: EASE, delay: 0.1 }} />
        <text x={x(ci[0])} y={H - 4} textAnchor="middle" className="tick">
          {f(ci[0])}
        </text>
        <text x={x(ci[1])} y={H - 4} textAnchor="middle" className="tick">
          {f(ci[1])}
        </text>
      </svg>
      <figcaption>
        {lang === "tr"
          ? clear
            ? "%95 aralık sıfırı içermiyor: yön belli."
            : "%95 aralık sıfırı içeriyor: yön kesin değil."
          : clear
            ? "The 95 % range clears zero: the direction is settled."
            : "The 95 % range includes zero: the direction is not settled."}
      </figcaption>
    </figure>
  );
}

/** How the per-cell slopes of an area are spread, with the mean and the middle 80 %. */
export function Histogram({ s, unit, decimals, lang }: { s: AreaSummary; unit: string; decimals: number; lang: Lang }) {
  const reduce = useReducedMotion();
  const W = 320, H = 92, B = 66, P = 4;
  const n = s.hist.length;
  const bw = (W - 2 * P) / n;
  const top = Math.max(...s.hist, 1e-9);
  const x = (v: number) => P + ((Math.max(-s.histRange, Math.min(s.histRange, v)) + s.histRange) / (2 * s.histRange)) * (W - 2 * P);
  const f = (v: number) => smartSigned(v, decimals + 1);
  const mix = (k: number) => {
    const t = (k + 0.5) / n; // 0 = falling … 1 = rising
    const c = t < 0.5 ? COLD : WARM;
    const a = 0.35 + Math.abs(t - 0.5) * 1.3;
    return `rgba(${c.join(",")},${Math.min(1, a).toFixed(2)})`;
  };
  const tr = lang === "tr";
  return (
    <figure className="viz hist">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr ? `Hücre eğimlerinin dağılımı, ortalama ${f(s.meanSlope)} ${unit}` : `Spread of cell slopes, mean ${f(s.meanSlope)} ${unit}`}>
        {s.hist.map((share, k) => {
          const h = (share / top) * (B - 8);
          return (
            <motion.rect
              key={k}
              x={P + k * bw + 1}
              width={Math.max(1, bw - 2)}
              rx={2}
              fill={mix(k)}
              initial={reduce ? false : { attrY: B, height: 0 }}
              animate={{ attrY: B - h, height: h }}
              transition={{ duration: 0.55, ease: EASE, delay: 0.015 * k }}
            />
          );
        })}
        <line x1={P} x2={W - P} y1={B} y2={B} className="axis" />
        {/* the middle 80 % of the area and the mean */}
        <line x1={x(s.p10)} x2={x(s.p90)} y1={B + 6} y2={B + 6} className="spread" />
        <line x1={x(0)} x2={x(0)} y1={4} y2={B} className="zero" />
        <line x1={x(s.meanSlope)} x2={x(s.meanSlope)} y1={2} y2={B + 9} className="mean" />
        <text x={P} y={H - 2} className="tick">
          {f(-s.histRange)}
        </text>
        <text x={x(0)} y={H - 2} textAnchor="middle" className="tick">
          0
        </text>
        <text x={W - P} y={H - 2} textAnchor="end" className="tick">
          {f(s.histRange)}
        </text>
      </svg>
      <figcaption>
        {tr
          ? "Her çubuk: o eğime sahip alanın payı. Dik çizgi ortalama, alttaki çizgi alanın ortadaki %80'i."
          : "Each bar: share of the area with that slope. The upright line is the mean, the line below spans the middle 80 % of the area."}
      </figcaption>
    </figure>
  );
}

const GATE_TEXT: Record<GateId, Record<Lang, string>> = {
  p05: { en: "Mann-Kendall p < 0.05", tr: "Mann-Kendall p < 0,05" },
  ci: { en: "95 % range of the slope clears zero", tr: "Eğimin %95 aralığı sıfırı içermiyor" },
  p01: { en: "Stricter: p < 0.01", tr: "Daha sıkı: p < 0,01" },
  robust: {
    en: "Holds after removing month-to-month memory and trimming 5 years off each end",
    tr: "Aydan aya hafıza ayıklanınca ve iki uçtan 5 yıl kırpılınca da geçerli",
  },
};

/** The checks behind the label: the first two give "possible", all four give "strong". */
export function Gates({ d, lang }: { d: Diagnostics; lang: Lang }) {
  const reduce = useReducedMotion();
  return (
    <ol className="gates">
      {d.gates.map((g, k) => (
        <motion.li key={g.id} className={g.pass ? "pass" : "fail"} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease: EASE, delay: 0.25 + 0.09 * k }}>
          <Icon name={g.pass ? "check" : "close"} size={14} />
          <span>{GATE_TEXT[g.id][lang]}</span>
          <em>{k < 2 ? (lang === "tr" ? "olası" : "possible") : lang === "tr" ? "güçlü" : "strong"}</em>
        </motion.li>
      ))}
    </ol>
  );
}

/** A grid of labelled numbers. */
export function StatGrid({ items }: { items: { label: string; value: ReactNode; hint?: string; wide?: boolean }[] }) {
  return (
    <dl className="statgrid">
      {items.map((it) => (
        <div key={it.label} title={it.hint} className={it.wide ? "wide" : undefined}>
          <dt>{it.label}</dt>
          <dd>{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
