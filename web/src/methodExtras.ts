/**
 * How the extra analyses work (docs/FEATURE_PLAN.md §10: every feature is explained in the
 * "How it works" dialog). Shown in MethodDialog and in the PDF report.
 * Written with AI assistance (Claude).
 */
import type { Lang } from "./i18n.ts";

type T = Record<Lang, string>;

export const METHOD_EXTRAS_TITLE: T = { en: "Extra analyses", tr: "Ek analizler" };

export const METHOD_EXTRAS: { title: T; body: T }[] = [
  {
    title: { en: "Climate fingerprint", tr: "İklim parmak izi" },
    body: {
      en: "The same test for all nine variables of a place. Each bar is the change relative to a typical large change of that variable worldwide (the 95th percentile of all grid cells), so °C and mm can sit side by side. A sentence such as “warming and drying soil are seen together” appears only when every variable it names has at least “possible” evidence and a change of at least a tenth of that typical change; it never claims a cause, and the experimental runoff variable is never used. “Similar places” compares the nine 1980–2025 trends from the world trend map with cosine similarity, on both sides alike; places where almost nothing changes are left out.",
      tr: "Bir yerin dokuz değişkeni için aynı test. Her çubuk, değişimin o değişkenin dünyadaki tipik büyük değişimine (bütün ızgara hücrelerinin 95. yüzdeliği) oranıdır; böylece °C ve mm yan yana durabilir. “Isınma ile topraktaki kuruma birlikte görülüyor” gibi bir cümle, yalnızca adı geçen her değişkende en az “olası” kanıt ve o tipik değişimin en az onda biri kadar bir değişim varsa çıkar; neden iddia etmez, deneysel yüzey akışı hiç kullanılmaz. “Benzer yerler”, dünya trend haritasındaki dokuz 1980–2025 trendini iki tarafta da aynı şekilde kosinüs benzerliğiyle karşılaştırır; neredeyse hiç değişmeyen yerler dışarıda kalır.",
    },
  },
  {
    title: { en: "When the pace changed", tr: "Değişim başlangıcı" },
    body: {
      en: "One straight trend is compared with a trend that bends in one year (at least ten years on each side). The p-value comes from 500 simulated series with a straight trend and year-to-year memory, so a steady trend is never reported as a break. Tested: false bends 3.3 % without a trend and 5.0 % with a strong straight trend; a real change of pace was found 95 % of the time.",
      tr: "Tek düz trend, bir yılda bükülen bir trendle karşılaştırılır (iki yanda en az on yıl). p değeri, düz trend ve yıldan yıla benzerlik içeren 500 benzetim serisinden gelir; bu yüzden düzgün bir trend asla kırılma diye gösterilmez. Denendi: trendsiz seride yanlış kırılma %3,3, güçlü düz trendde %5,0; gerçek bir hız değişimi %95 oranında bulundu.",
    },
  },
  {
    title: { en: "Change by month", tr: "Aylara göre değişim" },
    body: {
      en: "The card's test run on each calendar month alone. Twelve tests at once would show a “significant” month by chance too often, so the labels are corrected with Benjamini–Hochberg (q = 0.05), as on the world map.",
      tr: "Kartın testi her takvim ayı için ayrı çalıştırılır. Aynı anda on iki test şans eseri “anlamlı” bir ayı çok sık gösterirdi; bu yüzden etiketler, dünya haritasında olduğu gibi Benjamini–Hochberg (q = 0,05) ile düzeltilir.",
    },
  },
  {
    title: { en: "Rankings", tr: "Sıralamalar" },
    body: {
      en: "Provinces are ranked by their own monthly series when every province of the country has one (then the rank matches the card); otherwise, like countries, by the world trend map, area-weighted inside the borders. Places smaller than one grid cell are kept, take the nearest cell and are flagged.",
      tr: "İller, ülkenin her ilinin aylık serisi varsa kendi serileriyle sıralanır (sıra kartla aynı olur); yoksa, ülkeler gibi, dünya trend haritasından sınırlar içinde alan ağırlıklı olarak. Bir hücreden küçük yerler atılmaz, en yakın hücreyi alır ve işaretlenir.",
    },
  },
];
