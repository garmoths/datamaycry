/**
 * UI content that is not data: variable groups/icons, the "What are you curious about?"
 * questions (README §1 extras) and the method steps (PLAN.md §3.5–3.6).
 * Names, units and descriptions of variables still come from variables.json via data.ts.
 *
 * Written with AI assistance (Claude).
 */
import type { VarId } from "./data.ts";
import type { Lang } from "./i18n.ts";
import type { IconName } from "./icons.tsx";

/** Line icon per variable (icons.tsx). */
export const VAR_ICONS: Record<VarId, IconName> = {
  T2M: "thermometer",
  QV2M: "droplet",
  SPEED: "wind",
  PRECTOT: "rain",
  EVAP: "evaporation",
  RUNOFF: "runoff",
  GWETROOT: "sprout",
  SNOMAS: "snow",
  TOTEXTTAU: "haze",
};


type T = Record<Lang, string>;

export const VAR_GROUPS: { title: T; ids: VarId[] }[] = [
  { title: { en: "Air", tr: "Hava" }, ids: ["T2M", "QV2M", "SPEED"] },
  { title: { en: "Water cycle", tr: "Su döngüsü" }, ids: ["PRECTOT", "EVAP", "RUNOFF"] },
  { title: { en: "Land", tr: "Kara" }, ids: ["GWETROOT", "SNOMAS"] },
  { title: { en: "Air quality", tr: "Hava kalitesi" }, ids: ["TOTEXTTAU"] },
];

export interface Question {
  id: string;
  icon: IconName;
  q: T;
  vars: VarId[];
  tip: T;
}

/** Picking a question selects its first variable and suggests the others. */
export const QUESTIONS: Question[] = [
  {
    id: "warming",
    icon: "flame",
    q: { en: "Is it getting hotter?", tr: "Daha mı ısınıyor?" },
    vars: ["T2M"],
    tip: { en: "Try “Summer” in the season box to see if summers warm faster.", tr: "Yazların daha hızlı ısınıp ısınmadığını görmek için mevsimde “Yaz”ı seç." },
  },
  {
    id: "drought",
    icon: "drought",
    q: { en: "Is it drying out?", tr: "Kuraklaşıyor mu?" },
    vars: ["GWETROOT", "PRECTOT", "EVAP"],
    tip: { en: "Drought shows up as less soil moisture — compare with rainfall and evaporation.", tr: "Kuraklık toprak neminin azalmasıyla görünür — yağış ve buharlaşmayla karşılaştır." },
  },
  {
    id: "rain",
    icon: "rain",
    q: { en: "Does it rain more or less?", tr: "Yağış artıyor mu, azalıyor mu?" },
    vars: ["PRECTOT", "RUNOFF"],
    tip: { en: "Rain trends are noisy; a longer period helps.", tr: "Yağış trendleri gürültülüdür; daha uzun dönem seçmek yardımcı olur." },
  },
  {
    id: "snow",
    icon: "snow",
    q: { en: "Is the snow disappearing?", tr: "Kar azalıyor mu?" },
    vars: ["SNOMAS", "T2M"],
    tip: { en: "Pick a mountain or northern area — deserts have no snow to lose.", tr: "Bir dağ ya da kuzey bölgesi seç — çölde kaybedilecek kar yok." },
  },
  {
    id: "air",
    icon: "haze",
    q: { en: "Is the air getting hazier?", tr: "Hava daha mı puslu?" },
    vars: ["TOTEXTTAU"],
    tip: { en: "Aerosols include dust and pollution. Read the data note below the card.", tr: "Aerosol toz ve kirliliği kapsar. Kartın altındaki veri notunu oku." },
  },
  {
    id: "wind",
    icon: "kite",
    q: { en: "Is it windier?", tr: "Rüzgâr artıyor mu?" },
    vars: ["SPEED"],
    tip: { en: "Wind changes are usually small — look at the confidence interval.", tr: "Rüzgâr değişimleri genelde küçüktür — güven aralığına bak." },
  },
];

export const METHOD_STEPS: { title: T; body: T }[] = [
  {
    title: { en: "1 · Clean", tr: "1 · Temizle" },
    body: {
      en: "NASA MERRA-2 monthly data since January 1980. Missing values stay missing — never shown as 0.",
      tr: "1980 Ocak'tan bu yana NASA MERRA-2 aylık verisi. Eksik değer eksik kalır — asla 0 gösterilmez.",
    },
  },
  {
    title: { en: "2 · Remove the seasons", tr: "2 · Mevsimleri çıkar" },
    body: {
      en: "Each month is compared with its 1991–2020 average (the WMO normal). What is left is the anomaly.",
      tr: "Her ay kendi 1991–2020 ortalamasıyla (WMO normali) karşılaştırılır. Geriye kalan anomalidir.",
    },
  },
  {
    title: { en: "3 · One number per year", tr: "3 · Her yıla bir sayı" },
    body: {
      en: "Anomalies are averaged per complete year. This removes most month-to-month memory that causes false alarms.",
      tr: "Anomaliler tam yıllar için ortalanır. Bu, yanlış alarma yol açan aylar arası bağımlılığın çoğunu giderir.",
    },
  },
  {
    title: { en: "4 · Test and measure", tr: "4 · Test et ve ölç" },
    body: {
      en: "Mann-Kendall says whether there is a trend (p-value). Sen's slope says how fast, with a 95 % confidence interval.",
      tr: "Mann-Kendall bir trend olup olmadığını söyler (p-değeri). Sen eğimi ne kadar hızlı olduğunu, %95 güven aralığıyla söyler.",
    },
  },
  {
    title: { en: "5 · Label carefully", tr: "5 · Temkinli etiketle" },
    body: {
      en: "Strong evidence needs several checks to agree (false alarm ≈ 0.2 %). Possible trend = p < 0.05 only. Otherwise: no trend shown.",
      tr: "Güçlü kanıt için birden çok kontrol uyuşmalı (yanlış alarm ≈ %0,2). Olası trend = sadece p < 0,05. Diğer durumlarda: trend gösterilemedi.",
    },
  },
];

export const METHOD_LIMITS: T = {
  en: "MERRA-2 is a reanalysis (model + observations), about 50 km per cell. A trend says something changed — not why.",
  tr: "MERRA-2 bir reanalizdir (model + gözlem), hücre başına yaklaşık 50 km. Trend bir şeyin değiştiğini söyler — nedenini değil.",
};
