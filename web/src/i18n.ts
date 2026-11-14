/** UI strings, English (main) + Turkish (PLAN.md decision #16). */
export type Lang = "en" | "tr";

const S = {
  title: { en: "Data May Cry", tr: "Data May Cry" },
  tagline: { en: "Is your corner of Earth changing?", tr: "Dünyanın senin köşen değişiyor mu?" },
  mock: { en: "MOCK DATA", tr: "SAHTE VERİ" },
  view: { en: "View", tr: "Görünüm" },
  landOnly: { en: "land only", tr: "sadece kara" },
  curious: { en: "What are you curious about?", tr: "Ne merak ediyorsun?" },
  howItWorks: { en: "How it works", tr: "Nasıl çalışır?" },
  method: { en: "Method", tr: "Yöntem" },
  limits: { en: "Limits", tr: "Sınırlar" },
  close: { en: "Close", tr: "Kapat" },
  slopeLabel: { en: "Change per decade", tr: "10 yılda değişim" },
  ciLabel: { en: "95 % range", tr: "%95 aralık" },
  pLabel: { en: "Chance it's luck", tr: "Tesadüf ihtimali" },
  totalLabel: { en: "Total since start", tr: "Başlangıçtan beri" },
  yearsLabel: { en: "Years tested", tr: "Test edilen yıl" },
  evidence: { en: "Evidence", tr: "Kanıt" },
  modeRegion: { en: "Continent · Country · City", tr: "Kıta · Ülke · Şehir" },
  modeRegionSub: { en: "Pick a place by its borders", tr: "Yeri sınırlarından seç" },
  modePoint: { en: "Tile view", tr: "Karo görünümü" },
  modePointSub: { en: "Meridians × parallels, down to one cell", tr: "Meridyen × paralel, tek hücreye kadar" },
  continentSummary: { en: "Continent summary", tr: "Kıta özeti" },
  meanTrend: { en: "Average trend over land", tr: "Karada ortalama trend" },
  strongUp: { en: "strong rise", tr: "güçlü artış" },
  strongDown: { en: "strong fall", tr: "güçlü azalış" },
  possibleShare: { en: "possible", tr: "olası" },
  noneShare: { en: "no trend shown", tr: "trend yok" },
  continentNote: {
    en: "From the world trend map, area-weighted over land cells. A continent time series is not in the data yet — pick a country for the chart.",
    tr: "Dünya trend haritasından, kara hücrelerinde alan ağırlıklı. Kıta için zaman serisi henüz veride yok — grafik için bir ülke seç.",
  },
  variable: { en: "Variable", tr: "Değişken" },
  world: { en: "World", tr: "Dünya" },
  continents: { en: "Continents", tr: "Kıtalar" },
  countries: { en: "Countries", tr: "Ülkeler" },
  provinces: { en: "Provinces / cities", tr: "İller / şehirler" },
  noData: { en: "No data in the demo set yet", tr: "Demo veride henüz veri yok" },
  pickPrompt: {
    en: "Click a continent, country or province on the globe — or pick a demo below.",
    tr: "Globe üzerinde bir kıta, ülke ya da il seç — ya da aşağıdan bir demo seç.",
  },
  scales: { en: "Scales", tr: "Ölçekler" },
  demos: { en: "Try a case", tr: "Bir vaka dene" },
  loading: { en: "Loading…", tr: "Yükleniyor…" },
  raw: { en: "Monthly values", tr: "Aylık değerler" },
  anomaly: { en: "Anomaly + trend", tr: "Anomali + trend" },
  period: { en: "Period", tr: "Dönem" },
  season: { en: "Season", tr: "Mevsim" },
  seasonAll: { en: "All year", tr: "Tüm yıl" },
  seasonSummer: { en: "Summer (Jun–Aug)", tr: "Yaz (Haz–Ağu)" },
  trendMap: { en: "World trend map", tr: "Dünya trend haritası" },
  legendUp: { en: "rising", tr: "artış" },
  legendDown: { en: "falling", tr: "azalış" },
  legendFaint: { en: "clear colour = strong evidence · see-through = weak or small", tr: "net renk = güçlü kanıt · saydam = zayıf ya da küçük" },
  source: { en: "Source: NASA MERRA-2 reanalysis", tr: "Kaynak: NASA MERRA-2 reanaliz verisi" },
  statNote: {
    en: "“Statistically significant” means the change is unlikely to be pure chance.",
    tr: "“İstatistiksel olarak anlamlı”, değişimin tesadüf olma ihtimalinin düşük olduğu anlamına gelir.",
  },
  strong: { en: "🟢 Strong evidence", tr: "🟢 Güçlü kanıt" },
  possible: { en: "🟡 Possible trend", tr: "🟡 Olası trend" },
  none: { en: "⚪ No trend shown", tr: "⚪ Trend gösterilemedi" },
  tooShort: {
    en: "Pick at least 10 years — shorter periods cannot be tested.",
    tr: "En az 10 yıl seç — daha kısa dönemler test edilemez.",
  },
  insufficient: {
    en: "Too many missing years here — no test possible.",
    tr: "Burada çok fazla eksik yıl var — test yapılamıyor.",
  },
  constant: {
    en: "The data does not vary (for example no snow at all) — nothing to test.",
    tr: "Veri hiç değişmiyor (ör. hiç kar yok) — test edilecek bir şey yok.",
  },
  webgl: {
    en: "Your browser cannot draw the 3D globe (WebGL 2 is missing). Use the lists instead.",
    tr: "Tarayıcın 3D globe çizemiyor (WebGL 2 yok). Bunun yerine listeleri kullan.",
  },
  error: { en: "Could not load data", tr: "Veri yüklenemedi" },
  ungridded: {
    en: "The demo data only covers 30–40°N, 40–50°E in Point mode.",
    tr: "Demo veri Nokta modunda sadece 30–40°K, 40–50°D alanını kapsıyor.",
  },
  cell: { en: "Grid cell", tr: "Izgara hücresi" },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof S;
export const t = (lang: Lang, key: StringKey): string => S[key][lang];

/**
 * Fixed decimals, but never so few that a small non-zero number prints as 0.00
 * (evaporation changes by ~0.004 mm/day per decade): keeps two significant digits, max 5 decimals.
 */
export function decimalsFor(x: number, d: number): number {
  const ax = Math.abs(x);
  const need = ax > 0 && ax < 1 ? Math.min(5, Math.ceil(-Math.log10(ax)) + 1) : 0;
  return Math.max(d, need);
}
export const smartFixed = (x: number, d: number) => x.toFixed(decimalsFor(x, d));
export const smartSigned = (x: number, d: number) => (x > 0 ? "+" : "") + smartFixed(x, d);
const sign = smartSigned;

export interface CardInput {
  dir: "up" | "down";
  level: "strong" | "possible";
  place: string;
  variable: string;
  unit: string;
  slope: number;
  ci: [number, number];
  p: number;
  total: number;
  startYear: number;
  decimals: number;
}

/** Result-card sentences (PLAN.md §3.5 step 8). No cause-and-effect claims. */
export function cardText(lang: Lang, c: CardInput): string {
  const d = c.decimals;
  const slope = sign(c.slope, d);
  const ci = `${sign(c.ci[0], d)} … ${sign(c.ci[1], d)}`;
  const p = c.p < 0.001 ? "p < 0.001" : `p = ${c.p.toFixed(3)}`;
  const total = `${sign(c.total, d)} ${c.unit}`;
  if (lang === "tr") {
    const verb = c.dir === "up" ? "artmış" : "azalmış";
    const head =
      c.level === "strong"
        ? c.dir === "up" ? "📈 Anlamlı artış" : "📉 Anlamlı azalış"
        : c.dir === "up" ? "📈 Olası artış" : "📉 Olası azalış";
    return `${head}: ${c.place} bölgesinde ${c.variable.toLowerCase()} her 10 yılda ortalama ${slope} ${c.unit} ${verb} (%95 GA: ${ci}). Bunun tesadüf olma ihtimali ${c.level === "strong" ? "çok düşük" : "düşük"} (${p}). ${c.startYear}'den bu yana toplam ≈ ${total}.`;
  }
  const verb = c.dir === "up" ? "risen" : "fallen";
  const head =
    c.level === "strong"
      ? c.dir === "up" ? "📈 Significant increase" : "📉 Significant decrease"
      : c.dir === "up" ? "📈 Possible increase" : "📉 Possible decrease";
  return `${head}: in ${c.place}, ${c.variable.toLowerCase()} has ${verb} by about ${slope} ${c.unit} per decade (95% CI: ${ci}). It is ${c.level === "strong" ? "very unlikely" : "unlikely"} to be chance (${p}). Since ${c.startYear}, total ≈ ${total}.`;
}

export function noTrendText(lang: Lang, slope: number, unit: string, decimals: number): string {
  const s = `${sign(slope, decimals)} ${unit}`;
  return lang === "tr"
    ? `〰️ Anlamlı bir trend yok. Değişim görülüyor (${s}/10 yıl) ama tesadüften ayırt edilemiyor. Daha uzun bir dönem seçmeyi deneyin.`
    : `〰️ No significant trend. Some change is visible (${s}/decade) but it cannot be told apart from chance. Try a longer period.`;
}
