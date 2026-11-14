# Yeni özellikler planı: parmak izi, değişim başlangıcı, sıralama, aylık değişim, PDF rapor

Hazırlayan: Rumet (arayüz), Claude yardımıyla. Tarih: 2026-11-14.
Kapsam: 5 özellik (numaralar konuşmadaki listeden).

| # | Özellik | Tek cümle |
|---|---|---|
| 1 | **İklim parmak izi** | Bir yerin 9 değişkendeki trendi tek tabloda + birlikte ne anlattıkları + "benzer yerler" |
| 2 | **Değişim başlangıcı** | Değişimin hangi yıl hızlandığını ya da yön değiştirdiğini bulur, grafikte işaretler |
| 4 | **Sıralamalar** | "Türkiye'nin en hızlı ısınan illeri" gibi tablolar; tıklayınca o yere gider |
| 5 | **Aylara göre değişim** | 12 ayın her biri için ayrı trend: "En çok yazlar ısınıyor" |
| 6 | **PDF rapor** | Seçili yer için 1–2 sayfalık, kaynakçalı, indirilebilir rapor |

Hepsi **statik** kalır (sunucu yok, PLAN.md karar #7). Hesaplar tarayıcıda, mevcut `data.ts`
fonksiyonlarıyla yapılır. Sözleşmeye dokunan tek şey isteğe bağlı bir 1.5 eklemesidir (§7).

---

## 0. Bugünkü durum (planın dayandığı gerçekler)

- **Aylık seri olan yerler:** `getRegionSeries` (ülke/il), `getContinentSeries` (kıta),
  `getPointSeries` (ızgara hücresi). Bir bölge dosyası (`regions/{ÜLKE}.bin`) bir ülkenin
  **kendisini, bütün illerini ve bütün değişkenleri** içerir (`RegionHeader.vars`).
- **Gerçek veride her yerin serisi var.** `worker/package.py` her ülke için
  `regions/{ÜLKE}.bin` yazıyor (ülke + bütün illeri). Sahte veride ise yalnız TUR, EGY, BRA ve
  9 il var. Yani "4.596 ilden yalnız 9'unun serisi var" **sahte verinin** durumu; gerçek veri
  gelince her il tam hesap kartını alır. Bu plan iki durumda da çalışacak şekilde yazıldı:
  seri varsa seri, yoksa trend haritası.
- **Serisi olmayan yerler:** dünya trend haritası `trend_map/{VAR}.bin` (eğim, p, seviye, FDR;
  hücre başına). Değişken başına **1,66 MB**, 9 değişken ≈ **15 MB**.
- **Hazır hesaplar:** `analyzeTrend(series, {startYear, endYear, months})`,
  `robustness(...)`, `emergence(...)` (Enes), `summarize / summarizeCells / cellsInside`
  (continentStats.ts), `diagnose` (diagnostics.ts), `mannKendall / senSlope / lag1 / loess`
  (stats.ts).
- **Hazır ızgaralar:** `rasterizeCountries`, `rasterizeContinents` (App.tsx'te bir kez
  hesaplanıyor), il hücreleri `cellsInside(feature)`.
- **Arayüz yerleri:** sağ panel kartları (`Panel.tsx`), sol çekmece sekmeleri
  (`DrawerTab = "chart" | "explore" | "sources"`), grafik (`Chart.tsx`, Plotly),
  küçük grafik (`Sparkline`, Evidence.tsx).

---

## 1. Ortak altyapı (önce bu, ~1 saat)

Özellik 1, 4 ve 6 aynı iki parçayı kullanır; bir kez yazılır.

### 1.1 `trendStack.ts`: 9 trend haritası birden
- `loadTrendStack(): Promise<Record<VarId, TrendMap>>`: 9 haritayı **ihtiyaç anında**
  (parmak izi ya da sıralama ilk açıldığında) paralel yükler, önbelleğe alır.
  `getTrendMap` zaten önbellekli; bu sadece hepsini birlikte ister.
- Açılışta yüklenmez (15 MB). Yüklenirken Amicro text-shimmer ile "Haritalar yükleniyor…".
- `scaleOf(var)`: her değişken için hücre eğimlerinin mutlak değerinin **%95'liği**.
  Farklı birimleri (°C, mm/gün, kg/m²) karşılaştırılabilir yapar (§2.3). Değişken başına
  bir kez hesaplanır.

### 1.2 `areaStats.ts`: tek geçişte bölge özetleri
- `summarizeByGrid(map, grid, nIds)`: ızgaradaki **her** bölge için tek geçişte (207.936
  hücre, ~5 ms) alan ağırlıklı ortalama eğim, güçlü artış/azalış payı, FDR payı, hücre sayısı.
  Bugünkü `summarize` bölge başına bütün ızgarayı dolaşıyor; 242 ülke için 242 kez dolaşmak
  yerine bir kez.
- `provinceCells(countryId)`: bir ülkenin illerinin hücre listeleri (`cellsInside`), ülke
  başına önbellekli.
- Test: `summarizeByGrid` sonucu, her bölge için `summarize` ile birebir aynı olmalı.

---

## 2. Özellik 1: İklim parmak izi (~3–4 saat)

### 2.1 Ne görünür
Sağ panelde sonuç kartının hemen altında **"İklim parmak izi"** bölümü:

```
Değişken          Yön   Büyüklük (göreli)        Kanıt
Hava sıcaklığı    ▲     ███████████░░  +0,61 °C   güçlü
Toprak nemi       ▼     ██████░░░░░░░  −0,8 %     olası
Yağış             –     █░░░░░░░░░░░░  +0,01 mm   yok
…(9 satır, değişken grupları ayrı)
```
- Satıra tıklamak o değişkene geçer (alt çubuktaki seçimle aynı).
- Altında **yorum cümleleri** (§2.4) ve **"Benzer yerler"** listesi (§2.5).

### 2.2 Veri nereden
| Yer | Kaynak | Hesap |
|---|---|---|
| Serisi olan (il/ülke/kıta/hücre) | aynı bölge dosyası, 9 değişken | her değişken için `analyzeTrend` (aynı dönem ve mevsim ayarıyla) |
| Serisi olmayan | 9 trend haritası (§1.1) | `summarizeCells` / `summarizeByGrid` |

Satırın yanında küçük bir etiket kaynağı söyler: "aylık seri" ya da "trend haritası".
`land_only` değişkenler denizde boş kalır ("veri yok"), 0 sayılmaz.

### 2.3 Göreli büyüklük (birimleri karşılaştırmak)
- `göreli = eğim / scaleOf(var)`, ±1,5'te kırpılır. Çubuk uzunluğu bu.
- Gerçek değer ve birim her zaman yanında yazar; çubuk sadece "bu değişken için büyük mü
  küçük mü" sorusunu cevaplar. Açıklama: "Çubuk, değişimin o değişkenin dünya genelindeki
  değişimlerine göre büyüklüğü."

### 2.4 Yorum kuralları (birlikte ne anlatıyor)
`content.ts`'e **sabit bir kural tablosu**, TR/EN, nedensellik iddiası yok ("neden oluyor"
değil "birlikte görülüyor"). Kural yalnızca ilgili değişkenlerin hepsi **en az "olası"**
kanıta sahipse tetiklenir. Deneysel değişken (RUNOFF) bir kuralın **tek** dayanağı olamaz.

| Kural | Koşul | Cümle (TR) |
|---|---|---|
| Isınma + kuruma | T2M ▲ ve GWETROOT ▼ | "Isınma ile topraktaki kuruma birlikte görülüyor." |
| Isınma + kar kaybı | T2M ▲ ve SNOMAS ▼ | "Isınırken kar örtüsü azalıyor." |
| Islanma | PRECTOT ▲ ve GWETROOT ▲ | "Yağış ve toprak nemi birlikte artıyor." |
| Kuruma, yağış sabit | GWETROOT ▼ ve PRECTOT "yok" | "Yağış belirgin değişmezken toprak kuruyor." |
| Nemli ısınma | T2M ▲ ve QV2M ▲ | "Hava hem ısınıyor hem daha çok nem taşıyor." |
| Durgun | hepsi "yok" | "Bu dönemde hiçbir değişkende belirgin bir değişim yok." |

Kural sırası sabittir; en fazla 2 cümle gösterilir. Sahte veride çıkan cümleler uydurma
desenden gelir; "SAHTE VERİ" etiketi zaten görünür.

### 2.5 Benzer yerler
- Karşılaştırma **her iki tarafta da trend haritasından** yapılır (1980–2025, alan ağırlıklı
  ortalama eğim). Seçili yerin kartındaki seri sonuçları kullanıcının seçtiği döneme ve
  mevsime bağlı; adaylarınki değil. İki farklı ölçüyü karşılaştırmamak için benzerlik
  hesabında seçili yer için de harita değerleri kullanılır.
- Her yerin parmak izi = 9 göreli eğimden oluşan vektör (veri olmayan değişken atlanır).
- Benzerlik = vektörler arası **kosinüs benzerliği**, yalnızca iki yerde de verisi olan
  değişkenler üzerinden; en az 5 ortak değişken şartı.
- **Neredeyse sıfır vektörler elenir:** vektör uzunluğu 0,3'ün altındaysa (hiçbir şey
  belirgin değişmiyorsa) kosinüs gürültüdür; o yer için "benzer yer" gösterilmez, adaylardan
  da çıkarılır.
- Aday havuzu:
  - **v1 (tarayıcı):** 242 ülke (`summarizeByGrid` ile tek geçiş) + açık ülkenin illeri.
  - **v2 (worker, isteğe bağlı):** bütün 4.596 il için hazır parmak izleri (§7).
- 3 hücreden küçük yerler havuza girmez (gürültülü).
- Gösterim: ilk 5 yer, benzerlik yüzdesi, tıklayınca gider. Not: "Benzer trend, benzer
  iklim demek değildir."

### 2.6 Testler
- Göreli büyüklük: bilinen ölçek → bilinen çubuk; kırpma çalışıyor.
- Kurallar: her kural için tetikleyen ve tetiklemeyen sentetik örnek; RUNOFF tek başına
  kural tetiklemiyor; "olası"nın altındaki değişkenler kural dışı.
- Benzerlik: simetrik, kendisi %100, ortak değişken < 5 ise sonuç yok.

### 2.7 Bitti sayılır, eğer
- Serisi olan ve olmayan bir yerde 9 satır doğru kaynakla geliyor; satıra tıklayınca değişken
  değişiyor; yorum cümleleri yalnızca kurala uyunca çıkıyor; benzer yerler tıklanabiliyor;
  TR/EN; telefonda tek sütun.

---

## 3. Özellik 2: Değişim başlangıcı (~3 saat, en riskli, gerekirse çıkarılır)

### 3.1 Ne yapar
"Artıyor" demenin yanında **"artış yaklaşık 1998'den sonra hızlandı"** gibi bir cümle kurar
ve grafikte o yılı dikey çizgiyle işaretler. Öncesi ve sonrasının eğimlerini yan yana verir.

### 3.2 Neden Pettitt değil
İlk taslakta Pettitt testi vardı. Pettitt **seviye sıçraması** arar; düzgün artan bir seride
istatistiği ortadaki yılda doruğa çıkar ve küçük bir p verir. Yani güçlü ısınan her yer
"2002 civarında kırılma" gösterirdi. Bu yanlış bir bulgu olurdu. Elendi.

### 3.3 Yöntem: eğim değişimi testi
- Soru: "Tek bir düz trend mi, yoksa bir yılda bükülen iki parçalı (kırık çizgi) trend mi?"
- Yıllık ortalama anomaliler üzerinde (trend testinin kullandığı seri, `TrendResult.annual`):
  1. **Tek parça:** doğrusal trend, artık kareler toplamı SSE₁.
  2. **İki parça:** kırılma yılı b için sürekli kırık çizgi (eğim b'de değişir, sıçrama yok);
     iki yanda en az 10 yıl; en küçük SSE₂(b) veren b seçilir.
  3. İstatistik: `F = (SSE₁ − SSE₂) / SSE₂ · (n − 3)`.
- **p değeri, düz trend + otokorelasyon altında simülasyonla** (parametrik bootstrap):
  tek parça trendi ve artıkların AR(1) katsayısını tahmin et; bu modelden 500 sahte seri
  üret; her birinde aynı en büyük F'yi hesapla; p = gerçek F'yi aşanların oranı.
  Böylece düz artan seri "kırılma yok" çıkar; yalnızca eğim gerçekten değiştiyse bulgu çıkar.
  Tarayıcıda yer başına ~10–20 ms.
- Etiket yalnızca p < 0,05 **ve** iki eğim farkının yönü anlamlıysa: "hızlandı",
  "yavaşladı" ya da "yön değiştirdi". Aksi hâlde hiçbir şey yazılmaz.
- Kod `changepoint.ts` adlı ayrı dosyada. `stats.ts`'e girmez: onun başlığı Python ile
  birebir aynı sonucu vermeyi vaat ediyor ve bu testin Python karşılığı yok.

### 3.4 Kalibrasyon (yayına almadan önce şart)
Üç sıfır senaryosu, her biri 1.000 tekrar, 46 yıl:
| Senaryo | Beklenen | Hedef |
|---|---|---|
| Trend yok, AR(1) φ = 0,6 | kırılma yok | yanlış alarm ≤ %5 |
| **Düz trend + AR(1) φ = 0,6** | kırılma yok | yanlış alarm ≤ %5 (Pettitt burada çökerdi) |
| 1998'de eğimi 3 katına çıkan trend | kırılma ~1998 | yakalama ≥ %70, yıl ±4 içinde |
Sonuçlar bu dosyaya yazılır. Hedefler tutmazsa özellik çıkarılır.

### 3.5 Enes'in `emergence()` fonksiyonundan farkı
- `emergence`: "test hangi yıldan itibaren anlamlı çıkıyor" (kanıtın ortaya çıkışı).
- Bu özellik: "değişimin hızı hangi yıl değişti". Kartta ikisi ayrı cümle; karıştırılmaz.

### 3.6 Nerede görünür
- Sonuç kartında bir satır: "Artış ~1998'den sonra hızlandı: önce +0,1, sonra +0,5 °C/10 yıl
  (p = 0,01)."
- `Sparkline` ve büyük grafikte (`Chart.tsx`, Plotly `shapes`) dikey kesikli çizgi.
- PDF raporda (§6).
- Aylık serisi olan her yerde (gerçek veride her yer). Trend haritası özetlerinde yok.

### 3.7 Testler
- §3.4'teki üç senaryo (yavaş test, ayrı dosya).
- Kırılmanın bir yanı < 10 yıl → sonuç yok.
- Aynı tohumla aynı p (tekrarlanabilir rastgelelik).

---

## 4. Özellik 4: Sıralamalar (~2 saat)

### 4.1 Ne görünür
Sol çekmecede yeni sekme **"Sıralama"** (`DrawerTab` + `"rank"`):
- Kapsam: **dünya / kıta → ülkeler**, **seçili ülke → iller**.
- Ölçüt: ortalama eğim (varsayılan) ya da "güçlü kanıtlı alan payı".
- Yön: "en çok artan" / "en çok azalan" düğmesi.
- Satır: sıra, ad, çubuk, değer + birim, güçlü kanıt payı, düşük çözünürlük işareti.
- Satıra tıklayınca o yere gider (mevcut `pickCountry` / `pickAdmin1`).

Ayrıca sonuç kartında küçük bir rozet: **"81 il içinde 12. en hızlı ısınan"** (sıralama
sekmesine bağlantı).

### 4.2 Veri ve hesap
- **İller (bir ülke içinde):** önce **aylık seriler**. Ülkenin tek dosyası bütün illeri
  içeriyor; her il için `analyzeTrend` (81 il × 46 yıl, birkaç ms). Böylece sıralama ile o
  ilin kartındaki sayı **aynı** olur. Seri yoksa (sahte veride çoğu ülke) trend haritası:
  `provinceCells(countryId)` + `summarizeCells`.
- **Ülkeler:** trend haritası + `countryGrid` → `summarizeByGrid` (tek geçiş). 242 ülke
  dosyasını indirmek yerine. Sözleşme 1.5 gelirse (§7) oradan.
- **Küçük yerler, ölçüldü:** Türkiye'nin 81 ilinden hücre merkezi sayısına göre 3'ünde 0,
  15'inde 1, 22'sinde 2, 16'sında 3, 25'inde 4 ve üzeri hücre var. Yani "3 hücre altı
  sıralamaya girmez" kuralı illerin yarısını atardı; **kullanılmaz**. Bunun yerine:
  seriden sıralanıyorsa hiçbir il atılmaz (seri, il alanının ağırlıklı ortalaması); haritadan
  sıralanıyorsa 0 hücreli iller en yakın hücreyi alır (`cellsInside` yedeği) ve
  `low_resolution` işareti taşır.
- Rozet, sıralanan gerçek sayıyı yazar: "**N il içinde** 12." (her zaman 81 değil).
- Not satırı: seriden mi haritadan mı sıralandığını söyler.

### 4.3 Testler
- `summarizeByGrid` ↔ `summarize` eşitliği (§1.2).
- Sıralama yönü ve eşit değerlerde kararlı sıra; küçük yerlerin dışarıda kalması.

---

## 5. Özellik 5: Aylara göre değişim (~1,5 saat)

### 5.1 Ne yapar
12 ayın her biri için ayrı trend:
`Oca Şub Mar Nis May Haz Tem Ağu Eyl Eki Kas Ara` kutucukları, trend haritasıyla **aynı
renk skalasında**; opaklık = kanıt. Altında tek cümle: "En çok Temmuz–Ağustos'ta artıyor;
Ocak'ta belirgin değişim yok."

### 5.2 Yöntem
- Her ay için `analyzeTrend(series, { months: [m] })` (mevcut fonksiyon, kod değişmez).
- **12 test aynı anda yapıldığı için** etiketler Benjamini-Hochberg (q = 0,05) ile 12 ay
  içinde düzeltilir. Dünya haritasında kullandığımız yöntemin aynısı (PLAN §3.5 adım 5).
- `constant` dönen aylar (yazın kar yok gibi) gri ve "değişmiyor" yazılır, 0 sayılmaz.

### 5.3 Nerede görünür
- Sağ panelde hesap kartının altında şerit.
- Büyük grafik sekmesinde isteğe bağlı **yıl × ay ısı haritası** (46 × 12 anomali).
  Enes'in iklim şeritleri grafiğinin aylık hâli.
- Yalnız aylık serisi olan yerlerde.

### 5.4 Testler
- Yalnız yaz aylarında trend olan sentetik seri → sadece Haz–Ağu anlamlı.
- BH düzeltmesi: 12 p değerinden bilinen sonuç.

---

## 6. Özellik 6: PDF rapor (~2–3 saat)

### 6.1 Yaklaşım
**Tarayıcının yazdır → PDF olarak kaydet** özelliği, ayrı bir rapor düzeniyle.
- Yeni kütüphane yok. Yazılar seçilebilir ve net, grafikler vektör (SVG).
- jsPDF + html2canvas elendi: büyük paket, yazılar resme dönüşüyor, bulanık.

### 6.2 İçerik (A4, 1–2 sayfa)
1. Başlık: yer, değişken, dönem, mevsim, oluşturulma tarihi, veri sürümü (sahte veride
   büyük **DEMO VERİ** filigranı).
2. **Bulgu cümlesi** (sade dil) + ana sayılar tablosu (eğim, %95 aralık, p, toplam değişim).
3. Ana grafik (Plotly → `toImage` SVG).
4. Parmak izi tablosu (§2) ve yorum cümleleri.
5. Değişim başlangıcı (§3) ve aylık şerit (§5).
6. Sıralama rozeti (§4).
7. Yöntem kutusu: anomali (1991–2020 normali), Mann-Kendall, Sen, otokorelasyon düzeltmesi,
   etiket kuralları.
8. Sınırlamalar (PLAN §3.5'teki liste).
9. Kaynakça, DOI'lerle (`REFERENCES`); bağımsız kaynak rozetleri.
10. Paylaşım linki (aynı görünümü açar).

### 6.3 Uygulama
- `Report.tsx`: ekranda gizli, sadece `@media print` ile görünen bir bölüm (`@page A4`).
- Düğme: sağ panelde ve grafik çekmecesinde "Rapor (PDF)".
- Akış: rapor verisini topla → grafiği SVG'ye çevir → yazı tiplerinin yüklenmesini bekle
  (`document.fonts.ready`) → `window.print()` → `afterprint` ile temizle.
- Dil arayüz diliyle aynı (TR/EN).

### 6.4 Testler
- Rapor verisini toplayan fonksiyon için birim testi (alanların hepsi dolu, sahte veride
  filigran bayrağı açık).
- Elle: Chrome, Edge, Firefox'ta PDF çıktısı; Türkçe karakterler; sayfa taşması yok.

---

## 7. Sözleşme ve iş bölümü

| İş | Kim | Zorunlu mu |
|---|---|---|
| §1–§6 arayüz ve tarayıcı hesapları | Rumet | evet |
| Eğim değişimi kalibrasyonu (§3.4) | Rumet (JS) | **evet**, özellik yayına girecekse |
| **Sözleşme 1.5:** `regions/fingerprints.json`: her bölge (kıta, ülke, il) × 9 değişken için ortalama eğim, güçlü kanıt payı, hücre sayısı | Enes | hayır (v2) |

1.5 gelirse: parmak izi ve benzer yerler 15 MB harita yüklemeden çalışır ve benzer yerler
4.596 ilin hepsini kapsar. Gelmezse v1 (tarayıcıda hesap) tek başına yeterli.
Kural: sadece ekleme (1.x), CHANGELOG'a yazılır, `data.ts` tek giriş noktası olarak kalır.

---

## 8. Sıra, süre ve kesme çizgisi

| Aşama | İçerik | Süre | Durum |
|---|---|---|---|
| A | §1 altyapı | 1 sa | **şart** |
| D | §2 parmak izi + benzer yerler | 3–4 sa | **şart** (ana özellik, önce gelir) |
| E | §4 sıralamalar | 2 sa | **şart** |
| B | §5 aylık değişim | 1,5 sa | olsa iyi |
| F | §6 PDF rapor | 2–3 sa | olsa iyi, kısaltılabilir (grafik + bulgu + kaynakça) |
| C | §3 eğim değişimi | 3 sa | **zaman kalırsa**; kalibrasyon tutmazsa çıkarılır |

- Toplam ≈ 13–15 saat. Teslim saatine göre kesme çizgisi çekilir; proje sayfası, demo
  videosu ve sunum da Rumet'te olduğu için onlara ayrılan süre önce düşülür.
- Her aşama ayrı commit, `rumet` branch'inde; main'e PR ile.
- **Çakışma önlemi:** Enes `Panel.tsx`, `i18n.ts`, `trend.ts` üzerinde çalışıyor. Her özellik
  kendi dosyasında (`Fingerprint.tsx`, `Ranking.tsx`, `MonthStrip.tsx`, `Report.tsx`,
  `changepoint.ts`, `trendStack.ts`, `areaStats.ts`) ve kendi metin sözlüğüyle yazılır;
  `Panel.tsx`'e özellik başına sadece birkaç satırlık bağlantı eklenir. `trend.ts` değişmez.

---

## 9. Riskler

| Risk | Önlem |
|---|---|
| 15 MB haritanın yavaş yüklenmesi | Sadece ihtiyaçta yükle, yükleme göstergesi; v2'de 1.5 dosyası |
| Fazla iddia (düz trende "kırılma" demek, yanlış yorum) | Pettitt elendi; düz trend + otokorelasyon sıfır senaryosuyla kalibrasyon; sabit kural tablosu; nedensellik dili yok; BH düzeltmesi |
| Sahte verinin anlamsız desenleri | "SAHTE VERİ" etiketi, rapor filigranı; demo gerçek veriyle |
| Süre | Şart / olsa iyi / zaman kalırsa ayrımı; en riskli özellik (eğim değişimi) en sonda |
| Telefonda kalabalık | Parmak izi tek sütun, aylık şerit kaydırılabilir, sıralama çekmecede |

---

## 10. Her özellik için "bitti" tanımı
- TR ve EN metinler tamam.
- Hareket azaltma ayarı açıkken animasyon yok.
- Birim testleri yazıldı, hepsi geçiyor; typecheck, lint, build temiz.
- Serisi olan ve olmayan birer yerde tarayıcıda denendi; telefonda bakıldı.
- Yöntem ve sınırlamalar "Nasıl çalışır" penceresine eklendi.
