/**
 * One line on the result card when the pace of change bent in a year (changepoint.ts,
 * docs/FEATURE_PLAN.md §3). Nothing is shown when the test finds no bend.
 * Written with AI assistance (Claude).
 */
import type { ChangePoint } from "./changepoint.ts";
import { smartSigned, type Lang } from "./i18n.ts";
import { yearSuffix } from "./turkish.ts";
import "./bend.css";

const signed = (lang: Lang, x: number, d: number) => {
  const s = smartSigned(x, d);
  return lang === "tr" ? s.replace(".", ",") : s;
};

export function BendNote({ bend, lang, unit, decimals }: { bend: ChangePoint; lang: Lang; unit: string; decimals: number }) {
  const tr = lang === "tr";
  const per = `${unit}/${tr ? "10 yıl" : "decade"}`;
  const b = signed(lang, bend.before, decimals + 1);
  const a = signed(lang, bend.after, decimals + 1);
  const p = bend.p < 0.01 ? "p < 0.01" : `p = ${bend.p.toFixed(2)}`;
  const pTxt = tr ? p.replace("0.", "0,") : p;
  const rising = bend.after >= 0;
  const head = tr
    ? bend.kind === "reversed"
      ? `~${yearSuffix(bend.year, "de")} yön değişti`
      : `${rising ? "Artış" : "Azalış"} ~${yearSuffix(bend.year, "den")} sonra ${bend.kind === "faster" ? "hızlandı" : "yavaşladı"}`
    : bend.kind === "reversed"
      ? `The direction turned around ${bend.year}`
      : `The ${rising ? "rise" : "fall"} ${bend.kind === "faster" ? "sped up" : "slowed down"} after about ${bend.year}`;
  return (
    <p className="bend-note">
      <b>{head}.</b> {tr ? "Önce" : "Before"} {b}, {tr ? "sonra" : "after"} {a} {per} ({pTxt}).
    </p>
  );
}
