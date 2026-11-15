/**
 * Text for the API tab of "How it works" (MethodDialog.tsx). The sample response is a real
 * answer of /api/v1/trend for Diyarbakır, shortened. Written with AI assistance (Claude).
 */
import type { Lang } from "./i18n.ts";

export type Tx = Record<Lang, string>;

export const API_TEXT: { intro: Tx; badges: Tx[]; note: Tx } = {
  intro: {
    tr: "Data May Cry'ın cevaplarını kendi uygulamanda, haberinde ya da ödevinde kullan. Sitedeki kartla aynı hesap, JSON olarak.",
    en: "Use Data May Cry's answers in your own app, story or homework. The same calculation as the card on the site, as JSON.",
  },
  badges: [
    { tr: "Ücretsiz", en: "Free" },
    { tr: "Anahtar gerekmez", en: "No key" },
    { tr: "JSON", en: "JSON" },
    { tr: "CORS açık", en: "CORS open" },
    { tr: "Türkçe + İngilizce metin", en: "Turkish + English text" },
  ],
  note: {
    tr: "\"Belirgin değişim yok\" çıkan sonuçlarda yön ve sayı verilmez (null): anlamlı olmayan bir eğimin işareti güvenilir değildir. Cevaplar bir gün önbellekte tutulur. Kullanırken kaynak olarak \"NASA MERRA-2 · Data May Cry\" yazman yeterli.",
    en: "Results with \"no clear change\" give no direction and no numbers (null): the sign of a non-significant slope is not reliable. Answers are cached for a day. Please credit \"NASA MERRA-2 · Data May Cry\".",
  },
};

export const API_ENDPOINTS: { path: string; example: string; what: Tx }[] = [
  {
    path: "/trend",
    example: "/trend?place=TR-21&var=T2M",
    what: {
      tr: "Bir yerin kartı: kanıt düzeyi, 10 yıllık ve toplam değişim, %95 aralık, p, Türkçe/İngilizce açıklama ve yıllık değerler.",
      en: "A place's card: evidence level, change per decade and in total, 95 % range, p, Turkish/English text and the yearly values.",
    },
  },
  {
    path: "/places",
    example: "/places?q=erzurum",
    what: { tr: "Yer arama: kıta, ülke ve il kimlikleri (ör. TUR, TR-25).", en: "Place search: continent, country and province ids (e.g. TUR, TR-25)." },
  },
  {
    path: "/variables",
    example: "/variables",
    what: { tr: "Dokuz değişken, birimleri ve veri dönemi.", en: "The nine variables, their units and the data period." },
  },
  {
    path: "/series",
    example: "/series?place=TUR&var=PRECTOT",
    what: { tr: "Bir yerin 1980'den bugüne aylık değerleri.", en: "A place's monthly values since 1980." },
  },
];

export const API_PARAMS: { name: string; what: Tx }[] = [
  { name: "place", what: { tr: "Yer kimliği: kıta (EU), ülke (TUR) ya da il (TR-21). /places ile bulunur.", en: "Place id: continent (EU), country (TUR) or province (TR-21). Find it with /places." } },
  { name: "lat, lon", what: { tr: "place yerine koordinat: en yakın 0,5° × 0,625° hücre.", en: "Instead of place, a coordinate: the nearest 0.5° × 0.625° cell." } },
  { name: "var", what: { tr: "T2M, QV2M, SPEED, PRECTOT, EVAP, GWETROOT, RUNOFF, SNOMAS, TOTEXTTAU (varsayılan T2M).", en: "T2M, QV2M, SPEED, PRECTOT, EVAP, GWETROOT, RUNOFF, SNOMAS, TOTEXTTAU (default T2M)." } },
  { name: "from, to", what: { tr: "Dönem, tam yıl, en az 10 yıl (varsayılan 1980–2025).", en: "Period in whole years, at least 10 (default 1980–2025)." } },
  { name: "season", what: { tr: "all, winter, spring, summer, autumn (kış Aralık–Şubat).", en: "all, winter, spring, summer, autumn (winter = Dec–Feb)." } },
];

export const API_SAMPLE = `{
  "api_version": "1",
  "place": {
    "id": "TR-21",
    "kind": "province",
    "name": {
      "en": "Diyarbakır",
      "tr": "Diyarbakır"
    },
    "country": "TUR"
  },
  "variable": {
    "id": "T2M",
    "name": {
      "en": "Air temperature",
      "tr": "Hava sıcaklığı"
    },
    "unit": "°C",
    "experimental": false
  },
  "period": {
    "from": 1980,
    "to": 2025,
    "season": "all"
  },
  "status": "ok",
  "evidence": "strong",
  "capped": null,
  "change_per_decade": 0.4167,
  "change_total": 1.875,
  "ci95_per_decade": [
    0.2417,
    0.606
  ],
  "p_value": 3e-06,
  "years_used": 46,
  "meaning": {
    "en": "Getting warmer",
    "tr": "Isınıyor"
  },
  "text": {
    "tr": "1980–2025 arasında toplam yaklaşık 1,9 °C ısınmış. Gerçek eğim büyük ihtimalle 10 yılda 0,24 ile 0,61 °C arası; şans eseri olma ihtimali binde birden az."
  },
  "annual": [
    {
      "year": 1980,
      "anomaly": -0.5096
    },
    {
      "year": 1981,
      "anomaly": -0.1054
    },
    …,
    {
      "year": 2025,
      "anomaly": 1.7204
    }
  ],
  "badges": [
    {
      "source": "GHCN",
      "status": "agree",
      "years": {
        "start": 1980,
        "end": 2025
      }
    }
  ],
  "source": "NASA MERRA-2 v5.12.4"
}`;
