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
      en: "A label is given only when the autocorrelation-corrected 95 % interval excludes zero. Strong evidence needs several checks to agree (false alarm ≈ 0.2 %); it is lowered to “possible” for experimental variables or when an independent source (NOAA stations, NASA GPCP) disagrees.",
      tr: "Etiket yalnızca otokorelasyona göre düzeltilmiş %95 aralık sıfırı dışlarsa verilir. Güçlü kanıt için birden çok kontrol uyuşmalı (yanlış alarm ≈ %0,2); deneysel değişkenlerde ya da bağımsız bir kaynak (NOAA istasyonları, NASA GPCP) farklı sonuç verdiğinde “olası”ya düşürülür.",
    },
  },
];

export const METHOD_LIMITS: T = {
  en: "MERRA-2 is a reanalysis (model + observations) on a 0.5° × 0.625° grid, about 55 × 70 km at the equator. A trend says something changed — not why.",
  tr: "MERRA-2 bir reanalizdir (model + gözlem), 0,5° × 0,625° ızgarada; ekvatorda bir hücre yaklaşık 55 × 70 km. Trend bir şeyin değiştiğini söyler — nedenini değil.",
};

// ── References (shown in Explore → Sources and in the method dialog) ─────────
// Only citations we are sure of; where unsure of a DOI, the data provider's page is linked.

export interface Reference {
  group: "data" | "validation" | "methods" | "maps";
  text: string;
  url: string;
}

export const REFERENCES: Reference[] = [
  {
    group: "data",
    text: "Global Modeling and Assimilation Office (GMAO) (2015). MERRA-2 tavgM_2d_slv_Nx: 2d, Monthly mean, Single-Level Diagnostics, V5.12.4. NASA GES DISC.",
    url: "https://doi.org/10.5067/AP1B0BA5PD2K",
  },
  {
    group: "data",
    text: "GMAO (2015). MERRA-2 tavgM_2d_flx_Nx: Surface Flux Diagnostics, V5.12.4. NASA GES DISC.",
    url: "https://doi.org/10.5067/0JRLVL8YV2Y4",
  },
  {
    group: "data",
    text: "GMAO (2015). MERRA-2 tavgM_2d_lnd_Nx: Land Surface Diagnostics, V5.12.4. NASA GES DISC.",
    url: "https://doi.org/10.5067/8S35XF81C28F",
  },
  {
    group: "data",
    text: "GMAO (2015). MERRA-2 tavgM_2d_aer_Nx: Aerosol Diagnostics, V5.12.4. NASA GES DISC.",
    url: "https://doi.org/10.5067/FH9A0MLJPC7N",
  },
  {
    group: "data",
    text: "Gelaro, R., et al. (2017). The Modern-Era Retrospective Analysis for Research and Applications, Version 2 (MERRA-2). Journal of Climate, 30, 5419–5454.",
    url: "https://doi.org/10.1175/JCLI-D-16-0758.1",
  },
  {
    group: "validation",
    text: "Menne, M. J., et al. (2018). The Global Historical Climatology Network Monthly Temperature Dataset, Version 4. Journal of Climate, 31, 9835–9854.",
    url: "https://doi.org/10.1175/JCLI-D-18-0094.1",
  },
  {
    group: "validation",
    text: "NASA GPCP Version 3.3 Monthly precipitation (satellite + gauge). NASA GES DISC.",
    url: "https://disc.gsfc.nasa.gov/",
  },
  {
    group: "validation",
    text: "GISTEMP Team. GISS Surface Temperature Analysis (GISTEMP v4). NASA Goddard Institute for Space Studies.",
    url: "https://data.giss.nasa.gov/gistemp/",
  },
  {
    group: "methods",
    text: "Mann, H. B. (1945). Nonparametric tests against trend. Econometrica, 13(3), 245–259.",
    url: "https://doi.org/10.2307/1907187",
  },
  {
    group: "methods",
    text: "Kendall, M. G. (1975). Rank Correlation Methods (4th ed.). Charles Griffin, London.",
    url: "https://search.worldcat.org/search?q=Kendall+Rank+Correlation+Methods+1975",
  },
  {
    group: "methods",
    text: "Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. Journal of the American Statistical Association, 63(324), 1379–1389.",
    url: "https://doi.org/10.1080/01621459.1968.10480934",
  },
  {
    group: "methods",
    text: "Yue, S., Pilon, P., Phinney, B., & Cavadias, G. (2002). The influence of autocorrelation on the ability to detect trend in hydrological series. Hydrological Processes, 16(9), 1807–1829.",
    url: "https://doi.org/10.1002/hyp.1095",
  },
  {
    group: "methods",
    text: "Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate. Journal of the Royal Statistical Society B, 57(1), 289–300.",
    url: "https://doi.org/10.1111/j.2517-6161.1995.tb02031.x",
  },
  {
    group: "methods",
    text: "World Meteorological Organization. WMO Climatological Normals 1991–2020.",
    url: "https://community.wmo.int/en/activity-areas/climate-services/climate-products-and-initiatives/wmo-climatological-normals",
  },
  {
    group: "maps",
    text: "Natural Earth — free vector and raster map data (public domain), naturalearthdata.com.",
    url: "https://www.naturalearthdata.com/",
  },
  {
    group: "maps",
    text: "NASA Blue Marble: Shaded Relief and Bathymetry, served by NASA Global Imagery Browse Services (GIBS).",
    url: "https://nasa-gibs.github.io/gibs-api-docs/",
  },
];

export const REFERENCE_GROUPS: Record<Reference["group"], Record<Lang, string>> = {
  data: { en: "Data", tr: "Veri" },
  validation: { en: "Independent checks", tr: "Bağımsız kontroller" },
  methods: { en: "Methods", tr: "Yöntem" },
  maps: { en: "Maps and imagery", tr: "Harita ve görüntü" },
};

const MONTHS: Record<Lang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  tr: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
};

/** "1980-01" → "Jan 1980" / "Oca 1980" */
export function monthLabel(ym: string, lang: Lang): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[lang][(m || 1) - 1]} ${y}`;
}
