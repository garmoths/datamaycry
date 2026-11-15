/**
 * Rankings (docs/FEATURE_PLAN.md §4): a drawer tab with the full table, and a one-line badge
 * on the result card ("12th largest rise of 81 provinces"). The order rules are in ranking.ts.
 * Written with AI assistance (Claude).
 */
import { useMemo, useState } from "react";
import { CONTINENTS } from "./geo.ts";
import { ordinal, rankRows, standing, type RankDir, type RankMetric } from "./ranking.ts";
import { ChangeToggle } from "./ChangeToggle.tsx";
import { asView, useChangeView, viewDecimals, viewUnit } from "./changeView.ts";
import { useRankRows, type RankInputs, type RankScope } from "./useRankRows.ts";
import { smartSigned, unitLabel, type Lang } from "./i18n.ts";
import { TextShimmer } from "./amicro/TextShimmer.tsx";
import "./ranking.css";


const signed = (lang: Lang, x: number, d: number) => {
  const s = smartSigned(x, d);
  return lang === "tr" ? s.replace(".", ",") : s;
};

const T = {
  countries: { tr: "Ülkeler", en: "Countries" },
  provinces: { tr: "İller", en: "Provinces" },
  up: { tr: "En çok artan", en: "Largest rise" },
  down: { tr: "En çok azalan", en: "Largest fall" },
  slope: { tr: "10 yılda değişim", en: "Change per decade" },
  strong: { tr: "Güçlü kanıtlı alan", en: "Area with strong evidence" },
  pickCountry: { tr: "İlleri sıralamak için bir ülke seç.", en: "Pick a country to rank its provinces." },
  loading: { tr: "Sıralama hesaplanıyor…", en: "Ranking…" },
  empty: { tr: "Sıralanacak veri yok.", en: "Nothing to rank." },
  lowRes: { tr: "küçük", en: "small" },
  lowResTip: { tr: "Bir ızgara hücresinden küçük: en yakın hücrenin değeri", en: "Smaller than one grid cell: the nearest cell's value" },
  fromSeries: { tr: "Her ilin kendi aylık serisinden, kartla aynı dönem ve mevsim.", en: "From each province's own monthly series, same period and season as the card." },
  fromMap: { tr: "Dünya trend haritasından, sınırlar içinde alan ağırlıklı, 1980–2025.", en: "From the world trend map, area-weighted inside the borders, 1980–2025." },
  strongNeedsMap: { tr: "Güçlü kanıtlı alan payı yalnız trend haritasından hesaplanır.", en: "The share of area with strong evidence comes from the trend map only." },
  level: { strong: { tr: "güçlü", en: "strong" }, possible: { tr: "olası", en: "possible" }, none: { tr: "yok", en: "none" } },
} as const;

/** Badge on the result card: where this place stands among its peers. */
/**
 * `cardFromSeries`: the card shows the place's own monthly series. If the ranking has to come
 * from the trend map instead (not every peer has a series), the badge says so, because its
 * numbers can then differ from the card's.
 */
export function RankBadge({ scope, id, inputs, onOpen, cardFromSeries }: { scope: RankScope; id: string; inputs: RankInputs; onOpen: () => void; cardFromSeries: boolean }) {
  const { lang } = inputs;
  const { rows, ready, source } = useRankRows(scope, inputs);
  const s = ready ? standing(rows, id, lang) : null;
  if (!s) return null;
  const peers = scope.kind === "provinces" ? (lang === "tr" ? "il" : "provinces") : lang === "tr" ? "ülke" : "countries";
  const text =
    lang === "tr"
      ? `${s.of} ${peers} arasında en çok ${s.dir === "up" ? "artan" : "azalan"} ${ordinal(s.rank, lang)}`
      : `${ordinal(s.rank, lang)} largest ${s.dir === "up" ? "rise" : "fall"} of ${s.of} ${peers}`;
  return (
    <button className="rank-badge" onClick={onOpen}>
      <b>#{s.rank}</b> {text}
      {cardFromSeries && source === "map" && <small>{lang === "tr" ? "trend haritasına göre" : "by the trend map"}</small>}
    </button>
  );
}

/** The drawer tab. */
export function RankingPane(p: RankInputs & { countryId: string | null; continent: string | null; selected: string | null; onCountry: (id: string) => void; onAdmin1: (country: string, id: string) => void }) {
  const { lang, variable: v } = p;
  const [kind, setKind] = useState<"countries" | "provinces">(p.selected && p.selected !== p.countryId ? "provinces" : "countries");
  const [dir, setDir] = useState<RankDir>("up");
  const [metric, setMetric] = useState<RankMetric>("slope");
  const useProvinces = kind === "provinces" && !!p.countryId;
  const scope: RankScope | null = useMemo(
    () => (useProvinces ? { kind: "provinces", country: p.countryId! } : { kind: "countries", continent: p.continent }),
    [useProvinces, p.countryId, p.continent],
  );
  const { rows, source, ready } = useRankRows(scope, p);
  const effMetric: RankMetric = source === "series" ? "slope" : metric;
  const ordered = useMemo(() => rankRows(rows, effMetric, dir, lang), [rows, effMetric, dir, lang]);
  const unit = unitLabel(v.unit, lang);
  // per decade or total (changeView.ts); series rankings use the card's period, map ones 1980–2025
  const [view] = useChangeView();
  const years: [number, number] = source === "series" ? [p.opts.startYear ?? p.fullYears[0], p.opts.endYear ?? p.fullYears[1]] : p.fullYears;
  const max = Math.max(1e-12, ...ordered.map((r) => (effMetric === "slope" ? Math.abs(r.slope) : (dir === "up" ? r.strongUp : r.strongDown) ?? 0)));
  const cont = CONTINENTS.find((c) => c.id === p.continent);
  const countryName = p.countryRows.find((c) => c.id === p.countryId)?.[`name_${lang}`] ?? "";
  const title =
    scope?.kind === "provinces"
      ? lang === "tr"
        ? `${countryName} · iller`
        : `${countryName} · provinces`
      : cont
        ? `${cont[lang]} · ${T.countries[lang].toLowerCase()}`
        : lang === "tr"
          ? "Dünya · ülkeler"
          : "World · countries";

  return (
    <section className="ranking">
      <div className="rank-controls">
        <div className="seg small" role="group">
          <button className={!useProvinces ? "on" : ""} onClick={() => setKind("countries")}>
            {T.countries[lang]}
          </button>
          <button className={useProvinces ? "on" : ""} disabled={!p.countryId} onClick={() => setKind("provinces")} title={p.countryId ? undefined : T.pickCountry[lang]}>
            {T.provinces[lang]}
          </button>
        </div>
        <div className="seg small" role="group">
          {(["up", "down"] as const).map((d) => (
            <button key={d} className={dir === d ? "on" : ""} onClick={() => setDir(d)}>
              {T[d][lang]}
            </button>
          ))}
        </div>
        <div className="seg small" role="group">
          {(["slope", "strong"] as const).map((m) => (
            <button key={m} className={effMetric === m ? "on" : ""} disabled={m === "strong" && source === "series"} onClick={() => setMetric(m)} title={m === "strong" && source === "series" ? T.strongNeedsMap[lang] : undefined}>
              {T[m][lang]}
            </button>
          ))}
        </div>
      </div>
      <h2>{title}</h2>
      <p className="eyebrow">
        {v.name[lang]} <span className="unit">{effMetric === "slope" ? viewUnit(lang, unit, view, years) : "%"}</span>
        {effMetric === "slope" && <ChangeToggle lang={lang} />}
      </p>
      <p className="fine">{source === "series" ? T.fromSeries[lang] : T.fromMap[lang]}</p>
      {!ready ? (
        <TextShimmer>{T.loading[lang]}</TextShimmer>
      ) : ordered.length === 0 ? (
        <p className="fine">{T.empty[lang]}</p>
      ) : (
        <ol className="rank-list">
          {ordered.map((r) => {
            const val = effMetric === "slope" ? r.slope : ((dir === "up" ? r.strongUp : r.strongDown) ?? 0);
            return (
              <li key={r.id}>
                <button className={r.id === p.selected ? "on" : ""} onClick={() => (r.kind === "country" ? p.onCountry(r.id) : p.onAdmin1(r.country, r.id))}>
                  <span className="rank-n">{r.rank}</span>
                  <span className="rank-name">
                    {r.name[lang]}
                    {r.lowRes && (
                      <small title={T.lowResTip[lang]}>{T.lowRes[lang]}</small>
                    )}
                  </span>
                  <span className="rank-bar" aria-hidden>
                    <i className={(effMetric === "slope" ? val >= 0 : dir === "up") ? "pos" : "neg"} style={{ width: `${(Math.abs(val) / max) * 100}%` }} />
                  </span>
                  <span className="rank-val">{effMetric === "slope" ? signed(lang, asView(val, view, years), viewDecimals(view, v.decimals)) : `%${Math.round(val * 100)}`}</span>
                  <span className={`rank-lvl lvl-${r.level}`}>{T.level[r.level][lang]}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
