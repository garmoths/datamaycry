/**
 * "Climate fingerprint" views (docs/FEATURE_PLAN.md §2): every variable's trend for the
 * selected place in one table, what they show together, and the most alike places.
 * The numbers come from useFingerprint.ts.
 *
 * Numbers per row: the place's own monthly series (same period and season as the main
 * card) when it has one, otherwise the world trend map inside its borders. Similar places
 * always compare trend-map means on both sides (like with like).
 *
 * Written with AI assistance (Claude).
 */
import type { VarId, VariableInfo } from "./data.ts";
import { VAR_GROUPS, VAR_ICONS } from "./content.ts";
import { Icon } from "./icons.tsx";
import { smartSigned, unitLabel, type Lang } from "./i18n.ts";
import { TextShimmer } from "./amicro/TextShimmer.tsx";
import { ChangeToggle } from "./ChangeToggle.tsx";
import { asView, useChangeView, viewDecimals } from "./changeView.ts";
import { useFingerprint, type FingerprintData, type FingerprintInputs } from "./useFingerprint.ts";
import "./fingerprint.css";

const T = {
  title: { tr: "İklim parmak izi", en: "Climate fingerprint" },
  vars: { tr: "değişken", en: "variables" },
  loading: { tr: "Dokuz değişkenin haritası yükleniyor…", en: "Loading all nine variables…" },
  together: { tr: "Birlikte ne gösteriyor", en: "What they show together" },
  noInsight: { tr: "Değişkenler arasında belirgin bir ortak desen yok.", en: "No clear shared pattern between the variables." },
  similar: { tr: "Benzer yerler", en: "Similar places" },
  inCountry: { tr: "Bu ülkede", en: "In this country" },
  inWorld: { tr: "Dünyada", en: "Around the world" },
  similarNote: {
    tr: "1980–2025 trendleri en çok benzeyen yerler. Benzer trend, benzer iklim demek değildir.",
    en: "Places whose 1980–2025 trends look most alike. Similar trends do not mean a similar climate.",
  },
  noSimilar: {
    tr: "Karşılaştırmaya yetecek kadar belirgin bir değişim yok.",
    en: "Not enough clear change here to compare with other places.",
  },
  noData: { tr: "veri yok", en: "no data" },
  rowTip: { tr: "Bu değişkene geç", en: "Switch to this variable" },
  bar: {
    tr: "Çubuk: değişimin, o değişkenin dünyadaki tipik büyük değişimine oranı.",
    en: "Bar: the change relative to a typical large change of that variable worldwide.",
  },
  valDecade: { tr: "Değerler: 10 yıldaki değişim.", en: "Values: change per decade." },
  valTotal: { tr: "Değerler: dönem boyunca toplam değişim.", en: "Values: total change over the period." },
  fromSeries: { tr: "aylık seriden, seçili dönem", en: "from the monthly series, selected period" },
  fromMap: { tr: "trend haritasından, 1980–2025", en: "from the trend map, 1980–2025" },
  level: {
    strong: { tr: "güçlü", en: "strong" },
    possible: { tr: "olası", en: "possible" },
    none: { tr: "yok", en: "none" },
  },
} as const;


interface Props extends FingerprintInputs {
  /** the trend maps' period (map-based rows), for totals */
  fullYears: [number, number];
  current: VarId;
  onVariable: (id: VarId) => void;
  onCountry: (id: string) => void;
  onAdmin1: (country: string, id: string) => void;
}


/** Signed number, Turkish with a decimal comma (same as the main card). */
const signed = (lang: Lang, x: number, d: number) => {
  const s = smartSigned(x, d);
  return lang === "tr" ? s.replace(".", ",") : s;
};

/** Similarity as a percentage; never shows a rounded 100 for a different place. */
const pctOf = (score: number) => (score >= 0.995 ? "99+" : String(Math.round(score * 100)));


/** The nine rows and the "seen together" sentences. */
export function FingerprintTable({
  data,
  lang,
  variables,
  current,
  onVariable,
  years,
  fullYears,
}: {
  data: FingerprintData;
  lang: Lang;
  variables: VariableInfo[];
  current: VarId;
  onVariable: (id: VarId) => void;
  /** the card's period (series-based rows) and the trend maps' period (map-based rows), for totals */
  years: [number, number];
  fullYears: [number, number];
}) {
  const [view] = useChangeView();
  if (!data.ready) return <TextShimmer>{T.loading[lang]}</TextShimmer>;
  const { rows, insights } = data;
  const anySeries = rows.some((r) => r.slope !== null && r.source === "series");
  const anyMap = rows.some((r) => r.slope !== null && r.source === "map");
  const byId = new Map(variables.map((v) => [v.id, v]));
  return (
    <>
      {insights.length > 0 && (
        <ul className="fp-insights">
          {insights.map((x) => (
            <li key={x.id}>{x.text[lang]}</li>
          ))}
        </ul>
      )}
      <div className="fp-rows" role="list">
        {VAR_GROUPS.flatMap((g) => g.ids)
          .filter((id) => byId.has(id))
          .map((id) => {
            const v = byId.get(id)!;
            const r = rows.find((x) => x.var === id)!;
            const unit = unitLabel(v.unit, lang);
            const rel = r.relative ?? 0;
            return (
              <button
                key={id}
                role="listitem"
                className={`fp-row lvl-${r.level} ${id === current ? "on" : ""} ${r.slope === null ? "empty" : ""}`}
                onClick={() => onVariable(id)}
                title={T.rowTip[lang]}
              >
                <Icon name={VAR_ICONS[id]} size={14} />
                <span className="fp-name">
                  {v.name[lang]}
                  {v.experimental && <i className="fp-exp">*</i>}
                </span>
                <span className="fp-bar" aria-hidden>
                  <i className={rel >= 0 ? "pos" : "neg"} style={{ width: `${(Math.abs(rel) / 1.5) * 50}%` }} />
                </span>
                <span className="fp-val">
                  {r.slope === null
                    ? T.noData[lang]
                    : `${signed(lang, asView(r.slope, view, r.source === "series" ? years : fullYears), viewDecimals(view, v.decimals))} ${unit}`}
                </span>
                <span className="fp-lvl">{r.slope === null ? "" : T.level[r.level][lang]}</span>
              </button>
            );
          })}
      </div>
      <div className="fp-foot">
        <ChangeToggle lang={lang} />
        <p className="fine">
          {view === "total" ? T.valTotal[lang] : T.valDecade[lang]} {T.bar[lang]} {anySeries && anyMap ? `${T.fromSeries[lang]}; ${T.fromMap[lang]}` : anySeries ? T.fromSeries[lang] : T.fromMap[lang]}.
        </p>
      </div>
    </>
  );
}

/** The most alike provinces of the same country and countries elsewhere. */
export function SimilarPlaces({ data, lang, onCountry, onAdmin1 }: { data: FingerprintData; lang: Lang; onCountry: (id: string) => void; onAdmin1: (country: string, id: string) => void }) {
  if (!data.ready) return <TextShimmer>{T.loading[lang]}</TextShimmer>;
  const { similar } = data;
  if (!similar.near.length && !similar.world.length) return <p className="fine">{T.noSimilar[lang]}</p>;
  return (
    <div className="fp-similar-groups">
      {[
        { key: "near", title: T.inCountry[lang], list: similar.near },
        { key: "world", title: T.inWorld[lang], list: similar.world },
      ]
        .filter((g) => g.list.length)
        .map((g) => (
          <div key={g.key}>
            <p className="fp-group">{g.title}</p>
            <ol className="fp-similar">
              {g.list.map((x) => (
                <li key={`${x.kind}:${x.id}`}>
                  <button onClick={() => (x.kind === "country" ? onCountry(x.id) : onAdmin1(x.country, x.id))}>
                    <span>{x.name[lang]}</span>
                    <b>%{pctOf(x.score)}</b>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ))}
    </div>
  );
}

/** The whole fingerprint in one block (used by the PDF report). */
export function Fingerprint(p: Props) {
  const { lang } = p;
  const data = useFingerprint(p, true);
  return (
    <>
      <header className="card-head">
        <h3>{T.title[lang]}</h3>
      </header>
      <FingerprintTable
        data={data}
        lang={lang}
        variables={p.variables}
        current={p.current}
        onVariable={p.onVariable}
        years={[p.opts.startYear ?? p.fullYears[0], p.opts.endYear ?? p.fullYears[1]]}
        fullYears={p.fullYears}
      />
      <h4>{T.similar[lang]}</h4>
      <SimilarPlaces data={data} lang={lang} onCountry={p.onCountry} onAdmin1={p.onAdmin1} />
    </>
  );
}
