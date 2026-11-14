# Sözleşme v1.0 — Rumet için başlangıç rehberi

> Bu belge PLAN.md §8 adım 2'deki "sözleşmeyi birlikte oku" toplantısı için. Okuyup onaylarsan
> `CHANGELOG.md`'deki "draft" yazısını kaldırırız ve sürüm 1.0 olur. Gün 1 saat 12:30'da sözleşme dondurulur.

## 1. Kurulum (5 dk)

```bash
git clone https://github.com/garmoths/datamaycry.git
cd datamaycry/web
npm install
npm run dev      # http://localhost:5173
npm test         # 48 test geçmeli
```

Kendi işin için branch aç: `git checkout -b rumet/globe-panel`. `main`'e force push ve silme kapalı. İşini PR olarak aç.

## 2. Tek kural

**Arayüz verilere sadece `web/src/data.ts` üzerinden ulaşır.** `public/data/` içindeki dosyaları doğrudan okuma.
Bugün bu dosyalar sahte. Yarın öğlen gerçekleriyle değiştirilecek ve senin kodunda hiçbir şey değişmeyecek.

## 3. Kullanacağın fonksiyonlar

```ts
import {
  loadVariables, listCountries, getRegionSeries, getPointSeries,
  getTrendMap, analyzeTrend, anomalies, monthLabels,
} from "./data";
```

| Fonksiyon | Ne döndürür | Nerede kullanılır |
|---|---|---|
| `loadVariables()` | 9 değişken: isim, açıklama (EN+TR), birim, ondalık sayısı | Değişken seçici, birim etiketleri |
| `listCountries()` | Ülkeler → iller (`id`, EN+TR isim, `bbox`) | Bölge modu listesi, `flyTo(bbox)` |
| `getRegionSeries("TUR", "TR-21", "T2M")` | Aylık seri (`values`, `start`, `unit`, `label`) | Bölge modu grafiği. Ülkenin tamamı için `admin1 = null` |
| `getPointSeries(lat, lon, "T2M")` | Tıklanan noktanın aylık serisi | Nokta modu |
| `getTrendMap("T2M")` | Her hücre için eğim, p, seviye (0/1/2) | Dünya trend haritası (raster) |
| `analyzeTrend(series, { startYear, endYear, months })` | Sonuç kartı: `slopePerDecade`, `ci95`, `pValue`, `level`, `totalChange`, `status` | Sonuç kartı ve dönem kaydırıcı (anında hesaplanır) |
| `anomalies(series)` | Mevsim etkisi çıkarılmış aylık seri | Grafikte "anomali" görünümü |
| `monthLabels(series)` | `"1980-01"`... | Grafiğin x ekseni |

Tipler ve alanların açıklamaları: [`types.ts`](types.ts).

### Örnek: Diyarbakır kartı

```ts
const s = await getRegionSeries("TUR", "TR-21", "T2M");
const r = analyzeTrend(s);                       // 1980–2025
if (r.status === "ok") {
  // r.level: "strong" | "possible" | "none"
  // r.slopePerDecade, r.ci95 = [alt, üst], r.pValue, r.totalChange
}
// r.status: "too_short" (< 10 yıl) | "insufficient_data" | "constant" → kartta uyarı göster
```

### Sonuç kartı kuralları (PLAN.md §3.5 adım 8 ve §3.6 L3)

| `level` | Etiket | Metin şablonu |
|---|---|---|
| `strong` | 🟢 Güçlü kanıt | "📈/📉 Anlamlı artış/azalış: {bölge}'de {değişken} her 10 yılda **{eğim} {birim}** …" |
| `possible` | 🟡 Olası trend | aynı şablon, daha temkinli dil |
| `none` | ⚪ Trend gösterilemedi | "〰️ Anlamlı bir trend yok…" |

- Neden-sonuç cümlesi kurma ("iklim değişikliği yüzünden" deme).
- `NaN` değerini asla 0 olarak gösterme, "veri yok" yaz.
- Her kartta "Kaynak: NASA MERRA-2" yazsın.
- `variables.json` içinde `is_mock: true` varsa ekranın köşesinde "SAHTE VERİ" etiketi göster.

## 4. Sahte verinin kapsamı

| Ne | Kapsam |
|---|---|
| Ülkeler | `TUR` (Diyarbakır TR-21, Konya TR-42, Ankara TR-06, İstanbul TR-34), `EGY` (Kahire, Asvan), `BRA` (Amazonas, São Paulo) |
| Nokta modu | Sadece **30–40°K, 40–50°D** karosu (Doğu Türkiye, Diyarbakır dahil). Başka yere tıklarsan `DataError` gelir; hata mesajı göstermen gerekiyor |
| Trend haritası | 9 değişkenin hepsi, bütün dünya (desen sahte) |

## 5. Senin onaylaman gerekenler

- [ ] Fonksiyon isimleri ve döndürdükleri alanlar arayüz için yeterli mi?
- [ ] Eksik bir alan var mı? (ör. değişken için renk paleti, ikon)
- [ ] İl `id`'leri (`TR-21` gibi) Natural Earth'teki `iso_3166_2` alanıyla eşleşiyor. Haritada tıklanan ilin bu alanını `getRegionSeries`'e verebiliyor musun?

Değişiklik istersen bugün 12:30'dan önce söyle. Sonrasında sadece **yeni alan ekleme** yapılabilir.

---
*AI (Claude) yardımıyla yazıldı.*
