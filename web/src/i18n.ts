/** UI strings, English (main) + Turkish (PLAN.md decision #16). */
export type Lang = "en" | "tr";

const S = {
  title: { en: "Data May Cry", tr: "Data May Cry" },
  tagline: { en: "Is your corner of Earth changing?", tr: "Dünyanın senin köşen değişiyor mu?" },
  mock: { en: "MOCK DATA", tr: "SAHTE VERİ" },
  view: { en: "View", tr: "Görünüm" },
  share: { en: "Share", tr: "Paylaş" },
  searchAll: { en: "Search a place, variable or question", tr: "Yer, değişken ya da soru ara" },
  experimentalTag: { en: "experimental", tr: "deneysel" },
  checksTitle: { en: "Checked against independent sources", tr: "Bağımsız kaynaklarla karşılaştırma" },
  cappedBadge: {
    en: "An independent source points the other way for this place, so the label is kept at “possible”.",
    tr: "Bağımsız bir kaynak bu yer için farklı bir sonuç veriyor, bu yüzden etiket “olası”da tutuldu.",
  },
  aboutData: { en: "About these numbers", tr: "Bu sayılar hakkında" },
  allSources: { en: "Sources", tr: "Kaynaklar" },
  sources: { en: "Sources", tr: "Kaynakça" },
  areaShares: { en: "Across the continent's grid cells", tr: "Kıtanın ızgara hücrelerinde" },
  cappedTitle: { en: "That is why we do not call it a clear change.", tr: "Bu yüzden “net değişim” demiyoruz." },
  lowResNote: {
    en: "This province is smaller than the data's smallest square (about 50 × 50 km, 0.5° × 0.625°), so the number also includes the area around it.",
    tr: "Bu il, verinin en küçük karesinden (yaklaşık 50 × 50 km, 0,5° × 0,625°) küçük; bu yüzden sayı çevresini de içeriyor.",
  },
  mockTip: {
    en: "Demo data with a made-up pattern. Real NASA MERRA-2 numbers replace it without changing the app.",
    tr: "Uydurma desenli demo veri. Gerçek NASA MERRA-2 sayıları uygulama değişmeden yerine geçecek.",
  },
  tabSummary: { en: "Summary", tr: "Özet" },
  tabChart: { en: "Chart", tr: "Grafik" },
  tabExplore: { en: "Explore", tr: "Keşfet" },
  panelTabs: { en: "Inspector", tr: "Bilgi paneli" },
  seeChart: { en: "See the chart and change the period", tr: "Grafiği gör, dönemi değiştir" },
  downloadCsv: { en: "Download the monthly series (CSV)", tr: "Aylık seriyi indir (CSV)" },
  chartEmpty: {
    en: "Pick a city or a grid cell with data to see its monthly series since 1980. Or try a case:",
    tr: "1980'den bu yana aylık seriyi görmek için verisi olan bir şehir ya da ızgara hücresi seç. Ya da bir vaka dene:",
  },
  copied: { en: "Link copied", tr: "Bağlantı kopyalandı" },
  landOnly: { en: "land only", tr: "sadece kara" },
  curious: { en: "What are you curious about?", tr: "Ne merak ediyorsun?" },
  howItWorks: { en: "How it works", tr: "Nasıl çalışır?" },
  method: { en: "Method", tr: "Yöntem" },
  limits: { en: "Limits", tr: "Sınırlar" },
  close: { en: "Close", tr: "Kapat" },
  slopeLabel: { en: "Change per decade", tr: "10 yılda değişim" },
  ciLabel: { en: "Most likely between", tr: "Büyük ihtimalle" },
  pLabel: { en: "Chance it's a fluke", tr: "Şans eseri olma ihtimali" },
  totalLabel: { en: "Total change", tr: "Toplam değişim" },
  yearsLabel: { en: "Years looked at", tr: "İncelenen yıllar" },
  evidence: { en: "How sure are we?", tr: "Ne kadar eminiz?" },
  perDecade: { en: "per decade", tr: "her 10 yılda" },
  modeRegion: { en: "Continent · Country · City", tr: "Kıta · Ülke · Şehir" },
  modeRegionSub: { en: "Pick a place by its borders", tr: "Yeri sınırlarından seç" },
  modePoint: { en: "Tile view", tr: "Karo görünümü" },
  modePointSub: { en: "Meridians × parallels, down to one cell", tr: "Meridyen × paralel, tek hücreye kadar" },
  continentSummary: { en: "Continent summary", tr: "Kıta özeti" },
  countrySummary: { en: "Country summary", tr: "Ülke özeti" },
  worldSummary: { en: "World summary", tr: "Dünya özeti" },
  meanTrend: { en: "Average trend over land", tr: "Karada ortalama trend" },
  meanTrendAll: { en: "Average trend, land and sea", tr: "Ortalama trend, kara ve deniz" },
  decade: { en: "decade", tr: "10 yıl" },
  worldNote: {
    en: "Area-weighted average of every grid cell with data. Pick a continent to dig deeper.",
    tr: "Verisi olan tüm hücrelerin alan ağırlıklı ortalaması. Ayrıntı için bir kıta seç.",
  },
  countryNoteSeries: {
    en: "Average of the grid cells inside the borders. Pick a province to dig deeper.",
    tr: "Sınırlar içindeki hücrelerin ortalaması. Ayrıntı için bir il seç.",
  },
  countryNoteNoSeries: {
    en: "Average of the grid cells inside the borders.",
    tr: "Sınırlar içindeki hücrelerin ortalaması.",
  },
  strongUp: { en: "clear rise", tr: "net artış" },
  strongDown: { en: "clear fall", tr: "net azalış" },
  possibleShare: { en: "likely", tr: "muhtemel" },
  noneShare: { en: "unclear", tr: "belirsiz" },
  continentNote: {
    en: "Area-weighted average of the land cells. Pick a country to dig deeper.",
    tr: "Kara hücrelerinin alan ağırlıklı ortalaması. Ayrıntı için bir ülke seç.",
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
  anomaly: { en: "Change + trend", tr: "Değişim + eğilim" },
  seasons: { en: "Seasons then vs now", tr: "Mevsimler: önce ve şimdi" },
  period: { en: "Period", tr: "Dönem" },
  season: { en: "Season", tr: "Mevsim" },
  seasonAll: { en: "All year", tr: "Tüm yıl" },
  seasonSummer: { en: "Summer", tr: "Yaz" },
  seasonWinter: { en: "Winter", tr: "Kış" },
  seasonSpring: { en: "Spring", tr: "İlkbahar" },
  seasonAutumn: { en: "Autumn", tr: "Sonbahar" },
  seasonHint: {
    en: "Winter = Dec–Feb (December counts to the next year), spring = Mar–May, summer = Jun–Aug, autumn = Sep–Nov.",
    tr: "Kış = Ara–Şub (Aralık bir sonraki yıla sayılır), ilkbahar = Mar–May, yaz = Haz–Ağu, sonbahar = Eyl–Kas.",
  },
  robustTitle: { en: "Does the period matter?", tr: "Dönem seçimi sonucu değiştiriyor mu?" },
  unclear: { en: "unclear", tr: "belirsiz" },
  trendMap: { en: "World trend map", tr: "Dünya trend haritası" },
  legendUp: { en: "rising", tr: "artış" },
  legendDown: { en: "falling", tr: "azalış" },
  legendFaint: { en: "faint = weak or small change", tr: "soluk = zayıf ya da küçük değişim" },
  source: { en: "Source: NASA MERRA-2 reanalysis", tr: "Kaynak: NASA MERRA-2 reanaliz verisi" },
  statNote: {
    en: "If nothing had really changed, how often would ordinary year-to-year ups and downs still look like this trend?",
    tr: "Gerçekte hiçbir şey değişmemiş olsaydı, yıldan yıla olan sıradan iniş çıkışlar ne sıklıkla böyle bir eğilim gibi görünürdü?",
  },
  strong: { en: "Clear change", tr: "Net değişim" },
  possible: { en: "Likely change", tr: "Muhtemel değişim" },
  none: { en: "No clear change", tr: "Belirgin değişim yok" },
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
  timeTravel: { en: "Time travel", tr: "Zaman yolculuğu" },
  timeTravelTip: {
    en: "Play the map year by year: how far each place was from its 1991–2020 normal.",
    tr: "Haritayı yıl yıl oynat: her yer 1991–2020 normalinden ne kadar uzaktaydı.",
  },
  play: { en: "Play", tr: "Oynat" },
  pause: { en: "Pause", tr: "Duraklat" },
  closeAnim: { en: "Back to the trend map", tr: "Trend haritasına dön" },
  animYear: { en: "Year", tr: "Yıl" },
  animRange: { en: "Years", tr: "Yıllar" },
  speed: { en: "Speed", tr: "Hız" },
  smooth5: { en: "5-year average", tr: "5 yıllık ortalama" },
  smoothTip: {
    en: "Each frame shows the average of 5 years around it: less flicker, the long-term change stands out.",
    tr: "Her kare çevresindeki 5 yılın ortalaması: daha az titreme, uzun dönemli değişim öne çıkar.",
  },
  animLegend: { en: "difference from the 1991–2020 normal", tr: "1991–2020 normalinden fark" },
  worldMean: { en: "World average", tr: "Dünya ortalaması" },
  preparing: { en: "Preparing maps…", tr: "Haritalar hazırlanıyor…" },
  vsNormal: { en: "vs normal", tr: "normalden" },
  animNoData: { en: "No yearly maps for this variable yet.", tr: "Bu değişken için yıllık haritalar henüz yok." },
  animWait: {
    en: "A trend needs at least 10 years: the card fills in as the years play.",
    tr: "Bir eğilim için en az 10 yıl gerekiyor: yıllar ilerledikçe kart dolacak.",
  },
  emergedPossible: { en: "Likely change since", tr: "Muhtemel değişim:" },
  emergedStrong: { en: "Clear change since", tr: "Net değişim:" },
  emergedNever: { en: "In this period the evidence never became clear.", tr: "Bu dönemde kanıt hiç netleşmedi." },
  emergedSuffix: { en: "", tr: "ve sonrası" },
} satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof S;

/** Units come from variables.json in English; show them in the UI language. */
export function unitLabel(unit: string, lang: Lang): string {
  if (lang !== "tr") return unit;
  return unit.replace("/day", "/gün");
}
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

/** What a rise or a fall means, in everyday words: [headline, verb]. */
const MEANING: Record<string, Record<Lang, { up: [string, string]; down: [string, string] }>> = {
  T2M: { tr: { up: ["Isınıyor", "ısınmış"], down: ["Soğuyor", "soğumuş"] }, en: { up: ["Getting warmer", "warmed"], down: ["Getting cooler", "cooled"] } },
  QV2M: { tr: { up: ["Hava nemleniyor", "nemlenmiş"], down: ["Hava kuruyor", "kurumuş"] }, en: { up: ["The air is getting more humid", "become more humid"], down: ["The air is getting drier", "become drier"] } },
  SPEED: { tr: { up: ["Rüzgâr güçleniyor", "güçlenmiş"], down: ["Rüzgâr zayıflıyor", "zayıflamış"] }, en: { up: ["Winds are getting stronger", "strengthened"], down: ["Winds are getting weaker", "weakened"] } },
  PRECTOT: { tr: { up: ["Daha çok yağış düşüyor", "artmış"], down: ["Daha az yağış düşüyor", "azalmış"] }, en: { up: ["More rain and snow", "increased"], down: ["Less rain and snow", "decreased"] } },
  EVAP: { tr: { up: ["Buharlaşma artıyor", "artmış"], down: ["Buharlaşma azalıyor", "azalmış"] }, en: { up: ["More water evaporates", "increased"], down: ["Less water evaporates", "decreased"] } },
  GWETROOT: { tr: { up: ["Toprak nemleniyor", "nemlenmiş"], down: ["Toprak kuruyor", "kurumuş"] }, en: { up: ["The soil is getting wetter", "become wetter"], down: ["The soil is drying out", "dried out"] } },
  RUNOFF: { tr: { up: ["Yüzey akışı artıyor", "artmış"], down: ["Yüzey akışı azalıyor", "azalmış"] }, en: { up: ["More water runs off", "increased"], down: ["Less water runs off", "decreased"] } },
  SNOMAS: { tr: { up: ["Kar artıyor", "artmış"], down: ["Kar azalıyor", "azalmış"] }, en: { up: ["More snow on the ground", "increased"], down: ["Snow is disappearing", "decreased"] } },
  TOTEXTTAU: { tr: { up: ["Hava puslanıyor", "puslanmış"], down: ["Hava temizleniyor", "temizlenmiş"] }, en: { up: ["The air is getting hazier", "become hazier"], down: ["The air is getting clearer", "become clearer"] } },
};

/** Number for sentences: no sign (the verb gives the direction), Turkish decimal comma. */
function plain(lang: Lang, x: number, d: number): string {
  const s = smartFixed(Math.abs(x), d);
  return lang === "tr" ? s.replace(".", ",") : s;
}

/** Number + unit; Turkish writes the percent sign first (%0,21). */
function q(lang: Lang, x: number, d: number, unit: string): string {
  const n = plain(lang, x, d);
  return lang === "tr" && unit === "%" ? `%${n}` : `${n} ${unit}`;
}

/** "How likely is this a fluke?" in words instead of a p-value. */
export function chanceText(lang: Lang, p: number): string {
  if (lang === "tr") {
    if (p < 0.001) return "binde birden az";
    if (p < 0.01) return "yüzde birden az";
    if (p < 0.05) return "yüzde beşten az";
    return `yaklaşık yüzde ${Math.round(p * 100)}`;
  }
  if (p < 0.001) return "less than 1 in 1,000";
  if (p < 0.01) return "less than 1 in 100";
  if (p < 0.05) return "less than 1 in 20";
  return `about ${Math.round(p * 100)} in 100`;
}

/** Headline in everyday words, e.g. "Getting warmer" / "Toprak kuruyor". Null for unknown variables. */
export function meaningHead(lang: Lang, varId: string | undefined, dir: "up" | "down"): string | null {
  const m = varId ? MEANING[varId]?.[lang] : undefined;
  return m ? m[dir][0] : null;
}

export interface CardInput {
  varId?: string;
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
  endYear?: number;
  decimals: number;
}

/** Result-card sentences for high-school and university students (PLAN.md §3.5 step 8).
 *  The place, the variable and the rate per decade are already on screen (title, dock, big
 *  number), so the text adds only what is new: the total change, the likely range and the
 *  chance of a fluke. No cause-and-effect claims. */
export function cardText(lang: Lang, c: CardInput): string {
  const d = c.decimals;
  const m = c.varId ? MEANING[c.varId]?.[lang] : undefined;
  const years = c.endYear ? `${c.startYear}–${c.endYear}` : `${c.startYear}`;
  const lo = Math.min(Math.abs(c.ci[0]), Math.abs(c.ci[1]));
  const hi = Math.max(Math.abs(c.ci[0]), Math.abs(c.ci[1]));
  const chance = chanceText(lang, c.p);
  if (lang === "tr") {
    const verb = m ? m[c.dir][1] : c.dir === "up" ? "artmış" : "azalmış";
    const what = m ? "" : `${c.variable.toLocaleLowerCase("tr")} `;
    const range = `${c.unit === "%" ? q(lang, lo, d, c.unit) : plain(lang, lo, d)} ile ${q(lang, hi, d, c.unit)}`;
    const base =
      `${years} arasında ${what}toplam yaklaşık ${q(lang, c.total, d, c.unit)} ${verb}. ` +
      `Gerçek eğim büyük ihtimalle 10 yılda ${range} arası; şans eseri olma ihtimali ${chance}.`;
    return c.level === "strong" ? base : `${base} Yine de kanıt henüz kesin değil.`;
  }
  const verb = m ? m[c.dir][1] : c.dir === "up" ? "increased" : "decreased";
  const subject = m ? "it has" : `${c.variable.toLowerCase()} has`;
  const base =
    `Over ${years} ${subject} ${verb} by about ${plain(lang, c.total, d)} ${c.unit} in total. ` +
    `The true rate is most likely ${plain(lang, lo, d)} to ${plain(lang, hi, d)} ${c.unit} per decade; ` +
    `the chance this is a fluke is ${chance}.`;
  return c.level === "strong" ? base : `${base} Still, the evidence is not conclusive yet.`;
}

/** Sentence when no clear change was found. No direction and no slope: a non-significant
 *  slope has no reliable sign (Collaud Coen et al. 2020). */
export function noTrendText(lang: Lang, years?: { start: number; end: number }): string {
  if (lang === "tr") {
    const lead = years ? `${years.start}–${years.end} arasında belirgin bir değişim yok` : "Belirgin bir değişim yok";
    return `${lead}: yıldan yıla doğal iniş çıkışlar olası bir eğilimden büyük, yönü söylenemiyor. Daha uzun bir dönem dene.`;
  }
  const lead = years ? `Over ${years.start}–${years.end} there is no clear change` : "There is no clear change";
  return `${lead}: the normal ups and downs between years are bigger than any trend, so the direction is unknown. Try a longer period.`;
}

/** One line about start/end-year sensitivity. */
export function robustText(lang: Lang, same: number, total: number, shift = 5): string {
  if (lang === "tr") {
    return same === total
      ? `Dönem ${shift} yıl kaydırılsa da sonuç aynı.`
      : `Dönem ${shift} yıl kaydırılınca sonuç ${total} denemeden ${total - same} tanesinde değişiyor; seçilen yıllara duyarlı.`;
  }
  return same === total
    ? `Moving the period by ${shift} years gives the same answer.`
    : `Moving the period by ${shift} years changes the answer in ${total - same} of ${total} tries; it depends on the years chosen.`;
}
