/**
 * Small, honest building blocks for the inspector:
 *  - Sparkline: the annual anomalies and the Sen trend line, inline SVG (no chart library)
 *  - BadgeList: independent-source checks (contract 1.3: NOAA GHCN stations, NASA GPCP)
 *  - Provenance: dataset, data period, test years, baseline, processing date
 *  - References: the full source list, grouped
 *  - ProvinceSelect: searchable province picker instead of dozens of chips
 * Written with AI assistance (Claude).
 */
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Badge, TrendResult, VariablesFile } from "./data.ts";
import { monthLabel, REFERENCE_GROUPS, REFERENCES, type Reference } from "./content.ts";
import { fold } from "./fold.ts";
import { Icon } from "./icons.tsx";
import { smartSigned, type Lang } from "./i18n.ts";
import { COLD, WARM } from "./trendField.ts";

const rgb = (c: readonly number[]) => `rgb(${c.join(",")})`;

/** Annual mean anomalies as bars + the Sen trend line; the "shape" of the answer. */
export function Sparkline({ result, unit, lang }: { result: TrendResult; unit: string; lang: Lang }) {
  const reduce = useReducedMotion();
  const { years, anomalies } = result.annual;
  const pts = years.map((y, k) => [y, anomalies[k]] as const).filter(([, a]) => Number.isFinite(a));
  if (pts.length < 3) return null;
  const W = 320, H = 96, P = 6;
  const first = years[0], last = years[years.length - 1];
  const line = (y: number) => result.line.intercept + result.line.slopePerYear * (y - result.startYear);
  const ys = [...pts.map(([, a]) => a), line(first), line(last)];
  const lo = Math.min(...ys, 0), hi = Math.max(...ys, 0);
  const span = Math.max(1, last - first);
  const bw = Math.max(1.5, ((W - 2 * P) / (span + 1)) * 0.62);
  const x = (y: number) => P + bw / 2 + ((y - first) / span) * (W - 2 * P - bw);
  const yy = (a: number) => H - P - ((a - lo) / Math.max(1e-9, hi - lo)) * (H - 2 * P);
  const up = result.slopePerDecade >= 0;
  const label =
    lang === "tr"
      ? `${first}–${last} yıllık anomaliler ve trend çizgisi, ${unit}`
      : `Annual anomalies ${first}–${last} and trend line, ${unit}`;
  return (
    <figure className="spark" aria-label={label}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
        {pts.map(([y, a], k) => (
          <motion.rect
            key={y}
            x={x(y) - bw / 2}
            width={bw}
            rx={Math.min(1.5, bw / 2)}
            className={a >= 0 ? "spark-pos" : "spark-neg"}
            initial={reduce ? false : { attrY: yy(0), height: 0 }}
            animate={{ attrY: Math.min(yy(a), yy(0)), height: Math.max(0.8, Math.abs(yy(a) - yy(0))) }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.008 * k }}
          />
        ))}
        <line x1={P} x2={W - P} y1={yy(0)} y2={yy(0)} className="spark-zero" />
        <motion.line
          x1={x(first)}
          y1={yy(line(first))}
          x2={x(last)}
          y2={yy(line(last))}
          stroke={rgb(up ? WARM : COLD)}
          className="spark-line"
          initial={reduce ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
        />
      </svg>
      <figcaption>
        <span>{first}</span>
        <span>{lang === "tr" ? "yıllık anomali + Sen eğimi" : "annual anomaly + Sen slope"}</span>
        <span>{last}</span>
      </figcaption>
    </figure>
  );
}

const SOURCE_NAME: Record<Badge["source"], Record<Lang, string>> = {
  GHCN: { en: "NOAA weather stations (GHCN-M v4)", tr: "NOAA meteoroloji istasyonları (GHCN-M v4)" },
  GPCP: { en: "NASA GPCP v3.3 (satellite + gauges)", tr: "NASA GPCP v3.3 (uydu + yağış ölçer)" },
};
const STATUS: Record<Badge["status"], Record<Lang, string>> = {
  agree: { en: "consistent", tr: "tutarlı" },
  disagree: { en: "disagrees", tr: "farklı sonuç veriyor" },
  inconclusive: { en: "inconclusive", tr: "kararsız" },
};

/** Independent-source checks for this place and variable. */
export function BadgeList({ badges, lang, decimals }: { badges: Badge[]; lang: Lang; decimals: number }) {
  if (!badges.length) return null;
  const f = (x: number) => smartSigned(x, decimals + 1);
  return (
    <ul className="badges">
      {badges.map((b, k) => (
        <li key={k} className={`badge ${b.status}`}>
          <Icon name={b.status === "agree" ? "check" : b.status === "disagree" ? "alert" : "info"} size={15} />
          <div>
            <b>
              {SOURCE_NAME[b.source][lang]}: {STATUS[b.status][lang]}
            </b>
            <small>
              {b.years.start}–{b.years.end} · MERRA-2 {f(b.ours.slopePerDecade)} {lang === "tr" ? "vs" : "vs"} {f(b.ref.slopePerDecade)} / {lang === "tr" ? "10 yıl" : "decade"}
              {b.detail ? ` · ${b.detail[lang]}` : ""}
            </small>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Where the numbers come from, and when. */
export function Provenance({ variables, lang }: { variables: VariablesFile; lang: Lang }) {
  const tr = lang === "tr";
  const p = variables.period;
  const processed = variables.processed_at && variables.processed_at !== "mock" ? variables.processed_at.slice(0, 10) : null;
  return (
    <dl className="prov">
      <div>
        <dt>{tr ? "Veri" : "Data"}</dt>
        <dd>{variables.is_mock ? (tr ? "Demo (sahte) veri — MERRA-2 v5.12.4 düzeni" : "Demo (mock) data — MERRA-2 v5.12.4 layout") : variables.dataset}</dd>
      </div>
      <div>
        <dt>{tr ? "Dönem" : "Period"}</dt>
        <dd>
          {monthLabel(p.start, lang)} – {monthLabel(p.end, lang)} · {p.months} {tr ? "ay" : "months"}
        </dd>
      </div>
      <div>
        <dt>{tr ? "Test edilen" : "Tested"}</dt>
        <dd>
          {variables.test_years.start}–{variables.test_years.end} {tr ? "(sadece tam yıllar)" : "(complete years only)"}
        </dd>
      </div>
      <div>
        <dt>{tr ? "Referans" : "Baseline"}</dt>
        <dd>
          {variables.baseline_years.start}–{variables.baseline_years.end} {tr ? "(WMO iklim normali)" : "(WMO climate normal)"}
        </dd>
      </div>
      <div>
        <dt>{tr ? "İşlenme" : "Processed"}</dt>
        <dd>{processed ?? (tr ? "demo veri" : "demo data")}</dd>
      </div>
    </dl>
  );
}

/** The full source list, grouped. */
export function References({ lang }: { lang: Lang }) {
  const groups = Object.keys(REFERENCE_GROUPS) as Reference["group"][];
  return (
    <div className="refs">
      {groups.map((g) => (
        <div key={g}>
          <h4>{REFERENCE_GROUPS[g][lang]}</h4>
          <ol>
            {REFERENCES.filter((r) => r.group === g).map((r) => (
              <li key={r.url + r.text}>
                {r.text}{" "}
                <a href={r.url} target="_blank" rel="noreferrer noopener">
                  {r.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** One province of the chosen country (from its border file). */
export interface ProvinceItem {
  id: string;
  name: Record<Lang, string>;
  /** has its own monthly series in the data */
  hasSeries: boolean;
  lowRes: boolean;
}

/** Province picker with a filter box (the United Kingdom alone has 232). */
export function ProvinceSelect({
  lang,
  countryId,
  rows,
  value,
  onCountry,
  onAdmin1,
}: {
  lang: Lang;
  countryId: string;
  rows: ProvinceItem[];
  value: string | null;
  onCountry: (id: string) => void;
  onAdmin1: (country: string, id: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const f = fold(q.trim());
    return [...rows]
      .sort((a, b) => Number(b.hasSeries) - Number(a.hasSeries) || a.name[lang].localeCompare(b.name[lang], lang))
      .filter((a) => !f || fold(`${a.name.en} ${a.name.tr}`).includes(f));
  }, [rows, q, lang]);
  const tr = lang === "tr";
  return (
    <div className="provsel">
      <div className="provsel-head">
        <button className={`chip ${value === null ? "on" : ""}`} onClick={() => onCountry(countryId)}>
          {tr ? "Ülkenin tamamı" : "Whole country"}
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tr ? `${rows.length} bölge içinde ara…` : `Filter ${rows.length} regions…`}
          aria-label={tr ? "İl ara" : "Filter provinces"}
        />
      </div>
      <ul className="provsel-list" role="listbox">
        {list.map((a) => (
          <li key={a.id}>
            <button role="option" aria-selected={a.id === value} className={a.id === value ? "on" : ""} onClick={() => onAdmin1(countryId, a.id)}>
              <span>{a.name[lang]}</span>
              {a.hasSeries && <i className="data-dot" title={tr ? "Aylık serisi var" : "Has a monthly series"} />}
              {a.lowRes && <small title={tr ? "Bir hücreden küçük" : "Smaller than one grid cell"}>{tr ? "düşük çöz." : "low res."}</small>}
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="provsel-empty">{tr ? "Sonuç yok" : "No match"}</li>}
      </ul>
    </div>
  );
}
