# Aeolus 🌍🔍

*Data May Cry ekibinin projesi · a project by team Data May Cry*

**NASA Space Apps Challenge 2026: _Be An Earth System Trend Detective!_**

Kullanıcının dünyadan bir bölge ve bir değişken seçtiği, bu değişkenin 1980'den bugüne nasıl değiştiğini gördüğü ve bu değişimin **istatistiksel olarak anlamlı olup olmadığını** öğrendiği bir web aracı.

> Challenge sayfası: <https://www.spaceappschallenge.org/2026/challenges/earth-system-trend-detective/>
>
> 📌 **Güncel kararlar için [PLAN.md](PLAN.md) dosyasına bakın.** Bu README'deki "FastAPI backend" planı yerine **statik yapı (Vercel + Cloudflare R2)** ve **2 seçim modu (Bölge + Nokta)** seçildi.

---

## İçindekiler
1. [Challenge ne istiyor?](#1-challenge-ne-istiyor)
2. [Veri: hangi değişkenler?](#2-veri-hangi-değişkenler)
3. [İndirme stratejisi (≤ 10 GB)](#3-i̇ndirme-stratejisi--10-gb)
4. [Depolama: DuckDB](#4-depolama-duckdb)
5. [Worker ve trend hesaplama](#5-worker-ve-trend-hesaplama)
6. [Mimari: backend ve frontend ayrı](#6-mimari-backend-ve-frontend-ayrı)
7. [Arayüz: 3D dünya](#7-arayüz-3d-dünya)
8. [Öncelikler ve iş bölümü](#8-öncelikler-ve-iş-bölümü)
9. [Açık konular / yapılacaklar](#9-açık-konular--yapılacaklar)
10. [Kaynaklar](#10-kaynaklar)

---

## 1. Challenge ne istiyor?

Tek cümleyle: **veri seç → bölge seç → grafik çiz → trend var mı, anlamlı mı söyle.**

Başarılı bir çözüm 4 şeyi yapmalı:

| # | Adım | Bizdeki karşılığı |
|---|------|-------------------|
| 1 | Trend araştırılabilecek **değişkeni seçmek** | Değişken seçici + basit açıklamalar |
| 2 | Değişkeni **belirli bir bölge** için almak (trendlerin çoğu küresel değil) | 3D dünyada ülke → il seçimi |
| 3 | İstatistik yapmaya yetecek uzunlukta bir **zaman serisi** çizmek | 1980'den bugüne aylık grafik |
| 4 | **Değişim hızı** ve **anlamlılık testi** (t-test, Mann-Kendall, güven aralığı) | Sen's slope + Mann-Kendall, sonuç kartı |

**Hedef kitle:** lise ve üniversite öğrencileri, biraz bilim altyapısı olan halk. Kullanıcı kendini bir "veri dedektifi" gibi hissetmeli.

**Artı puan getirecekler (opsiyonel):**
- Değişkenlerin basit tanımları
- Aracın nasıl çalıştığını gösteren 1–2 demo örnek (ör. Diyarbakır, Konya, Tuz Gölü)
- "Neyi / nereyi merak ediyorsun?" soru akışı ve buna göre değişken önerisi
- Yapay zekâ ile ilginç bölge/değişken önerileri

**Kapsam notları:**
- Doğrusal trend yeterli. Doğrusal olmayan, karmaşık analizler kapsam dışı.
- **Mevsimselliği çıkarmak şart:** anomali alınacak ya da Seasonal Mann-Kendall kullanılacak.
- Anlamlı çıkmayan bir trend de ilginç sayılır. Bazen sadece daha uzun bir veri dönemi gerekir.

---

## 2. Veri: hangi değişkenler?

> Aşağıdaki tüm tarih, boyut ve veri tipleri **NASA CMR kataloğundan doğrulandı** (2026-11-13).
> Not: "1983'ten beri" bilgisi yanlış. MERRA-2 **1980 Ocak'tan** beri var.

### Ana çekirdek: MERRA-2 (aylık, 0.5° × 0.625°)

- **Dönem:** 1980-01 → güncel (561 aylık dosya)
- **Izgara:** 361 × 576 = **207.936 hücre**
- **Format:** NetCDF4, tüm değişkenler **float32**

| # | Değişken | Koleksiyon | Ne anlatıyor | Birim |
|---|----------|-----------|--------------|-------|
| 1 | `T2M` | M2TMNXSLV | 2 m hava sıcaklığı | K |
| 2 | `QV2M` | M2TMNXSLV | 2 m özgül nem | kg/kg |
| 3 | `U10M` | M2TMNXSLV | 10 m rüzgâr (doğu-batı) | m/s |
| 4 | `V10M` | M2TMNXSLV | 10 m rüzgâr (kuzey-güney) | m/s |
| 5 | `PRECTOT` | M2TMNXFLX | Toplam yağış | kg m⁻² s⁻¹ |
| 6 | `EVAP` | M2TMNXFLX | Buharlaşma | kg m⁻² s⁻¹ |
| 7 | `GWETROOT` | M2TMNXLND | Kök bölgesi toprak nemi | 0–1 |
| 8 | `RUNOFF` | M2TMNXLND | Yüzey akışı | kg m⁻² s⁻¹ |
| 9 | `SNOMAS` | M2TMNXLND | Kar kütlesi | kg m⁻² |
| 10 | `TOTEXTTAU` | M2TMNXAER | Aerosol optik derinliği (hava kirliliği / toz) | birimsiz |

### Opsiyonel (yüksek çözünürlük, daha kısa dönem)

| Değişken | Veri seti | Başlangıç | Veri tipi | Izgara |
|----------|-----------|-----------|-----------|--------|
| Yağış (hassas) | GPM IMERG `precipitation` (GPM_3IMERGM v07) | 1998 | float32 | 1800 × 3600 (0.1°) |
| Toprak nemi 0–10 cm | GLDAS 2.1 `SoilMoi0_10cm_inst` | 2000 | float32 | 600 × 1440 (0.25°) |
| Bitki örtüsü (NDVI) | MODIS MOD13C2 | 2000 | int16 (ölçek katsayılı) | 3600 × 7200 (0.05°) |
| Yüzey sıcaklığı (LST) | MODIS MOD11C3 `LST_Day_CMG` | 2000 | uint16 (ölçek katsayılı) | 3600 × 7200 |
| NO₂ kirliliği | OMI OMNO2d | 2004 | float32 | 720 × 1440, **günlük** |

---

## 3. İndirme stratejisi (≤ 10 GB)

**Kural:** Dosyaların tamamını **asla** indirmiyoruz. OPeNDAP ile her dosyadan sadece ihtiyacımız olan değişkenleri kesip alıyoruz.

### Alan hesabı

| Ne | Boyut |
|----|-------|
| 4 MERRA-2 koleksiyonunun tam dosyaları | ~173 GB ❌ |
| Tüm aday veri setlerinin tam dosyaları | ~340 GB ❌ |
| 10 değişken, ham float32 (576 × 361 × 4 B × 561 ay × 10) | **~4,7 GB** |
| Parquet / DuckDB, sıkıştırılmış (tahmin, ölçülmedi) | **~2–4 GB** ✅ |

### Akış: çek → dönüştür → sil
```
her koleksiyon (SLV, FLX, LND, AER) için, her ay için:
  1. CMR'dan granülü bul (earthaccess.search_data)
  2. OPeNDAP'tan sadece gereken değişkenleri çek    (~1–3 MB)
  3. xarray ile aç → Parquet'e yaz (ay bazında dosya)
  4. geçici dosyayı sil
en sonda: Parquet → DuckDB (ORDER BY cell_id, month)
```

### Dikkat edilecekler
- **Earthdata hesabı gerekli** (ücretsiz): <https://urs.earthdata.nasa.gov/>
- **Dosya adlarını elle üretme.** Dosya önekleri döneme göre değişiyor (`MERRA2_100`, `200`, `300`, `400`...). Linkleri her zaman CMR arama sonucundan al.
- Her granülün bir Cloud OPeNDAP linki var, ör.:
  `https://opendap.earthdata.nasa.gov/collections/C1276812859-GES_DISC/granules/M2TMNXSLV.5.12.4%3AMERRA2_100.tavgM_2d_slv_Nx.198001.nc4`
- Değişken seçme sözdizimi (**henüz test edilmedi**):
  `<opendap_url>.dap.nc4?dap4.ce=/T2M;/QV2M;/U10M;/V10M;/lat;/lon;/time`
- **4–8 paralel indirme** yap. Çok fazla paralel istek NASA tarafında kısıtlanabilir.
- **Tekrar başlatılabilir olsun:** var olan Parquet dosyasını atla, internet koparsa kaldığın yerden devam et.
- Toplam istek sayısı: 4 koleksiyon × 561 ay ≈ **2.244**. Pratikte süre büyük ihtimalle **1 saati geçer**.

### Sığmazsa yedek planlar
1. **1°'ye indirgeme** (2×2 hücre ortalaması) → boyut ÷4 → ~1,2 GB
2. Kara değişkenlerinde (`GWETROOT`, `RUNOFF`, `SNOMAS`) **okyanus hücrelerini atmak**
3. Değişken sayısını 6–7'ye düşürmek

---

## 4. Depolama: DuckDB

**Neden DuckDB?** Gömülü çalışıyor (sunucu yok, tek dosya), kolon bazlı, sıkıştırması iyi, Python/pandas/Parquet ile doğrudan konuşuyor.

| Saklama şekli | Tahmini boyut |
|---------------|---------------|
| NetCDF / Zarr | ~2–5 GB |
| **DuckDB / Parquet** ✅ | **~3–5 GB** |
| PostgreSQL (hücre × ay = satır) | ~10–12 GB ❌ |

**Değerlendirilip elenenler:**
- **PostgreSQL:** satır ek yükü yüzünden şişer.
- **SQLite:** satır bazlı, bu hacimde verimsiz.
- **ClickHouse / chDB:** güçlü ama asıl avantajları (cluster, veri akışı, çok kullanıcı) bize gereksiz. `clickhouse-local` ve chDB ile sunucusuz da çalışabiliyor, ama ekosistemi DuckDB kadar rahat değil.

### Şema
```sql
-- Ham veri: ~117 milyon satır (207.936 hücre × 561 ay)
CREATE TABLE merra2 (
  cell_id   INTEGER,   -- lat_idx * 576 + lon_idx  (0..207935)
  month     DATE,      -- 1980-01-01 .. güncel
  t2m REAL, qv2m REAL, u10m REAL, v10m REAL,
  prectot REAL, evap REAL,
  gwetroot REAL, runoff REAL, snomas REAL,
  totexttau REAL
);
-- ⚠️ KRİTİK: veriyi ORDER BY cell_id, month ile yaz.
-- Böylece zonemap'ler sayesinde "bir hücrenin 45 yılı" sorgusu milisaniyeler sürer.

-- Hücre → koordinat / bölge eşlemesi
CREATE TABLE cells (
  cell_id INTEGER, lat REAL, lon REAL,
  country TEXT, admin1 TEXT
);

-- Önceden hesaplanmış trend sonuçları (~2 milyon satır, birkaç on MB)
CREATE TABLE trends (
  cell_id          INTEGER,
  var              TEXT,
  slope_per_decade REAL,     -- Sen's slope
  p_value          REAL,
  significant      BOOLEAN,  -- p < 0.05
  period_start     DATE,
  period_end       DATE
);
```

### ⚠️ Tek yazar kuralı
DuckDB'de bir dosyaya aynı anda **tek bir süreç yazabilir**. Bu yüzden:
- Worker `data_new.duckdb` dosyasına yazar, bitince `data.duckdb` ile değiştirir (atomik rename).
- Web uygulaması veriyi **sadece okuma** (`read_only=True`) modunda açar.

---

## 5. Worker ve trend hesaplama

### Akış
```
1. İndir    → NASA'dan veri (ilk sefer: 1980'den bugüne, sonra sadece yeni ay)
2. Yükle    → DuckDB merra2 tablosu
3. Hesapla  → her hücre × değişken: anomali → Mann-Kendall + Sen's slope
4. Kaydet   → trends tablosu + ülke/il bazında hazır seriler
```

- **Sürekli açık bir servis değil.** Ayda bir **cron** ile çalışan sıradan bir Python scripti (MERRA-2 ayda bir güncelleniyor).
- **Kendi Mac'imizde çalışıyor** (sunucuda değil):
  ```bash
  caffeinate -i python worker.py   # Mac uykuya geçmesin
  ```
- Kullanıcının seçtiği **özel dönem** (ör. 2000–2020) veya çok hücreli **bölge ortalaması** önceden hesaplanmaz, istek geldiğinde anında hesaplanır. 561 noktalık tek bir seride test milisaniyeler sürer.

### Bilimsel yöntem
1. **Anomali:** her değerden o takvim ayının uzun dönem ortalamasını çıkar (mevsim döngüsünü kaldır).
2. **Mann-Kendall testi** → p-değeri (p < 0.05 ise anlamlı).
3. **Sen's slope** → değişim hızı (on yıl başına ×120 ay).
4. Opsiyonel: **Seasonal Mann-Kendall**, otokorelasyon düzeltmesi.

### Benchmark (gerçekten ölçüldü)
**Makine:** Apple M2, 8 çekirdek, 16 GB RAM
**Test:** MERRA-2 boyutlarında (561 ay) sentetik veri, anomali + Mann-Kendall + Sen's slope.
Vektörel NumPy sonuçları `pymannkendall` ile **birebir aynı** (p ve eğim).

| Yöntem | ms / seri |
|--------|-----------|
| `pymannkendall`, döngüyle | 6,71 |
| Vektörel NumPy, tek çekirdek | 2,06 |
| **Vektörel NumPy, 8 çekirdek** | **0,57** |

**Tüm veri** (10 değişken × 207.936 hücre ≈ 2,08 milyon seri):

| Yöntem | Süre |
|--------|------|
| `pymannkendall` döngüsü | ~3,9 saat |
| Vektörel, tek çekirdek | ~70 dk |
| **Vektörel, 8 çekirdek** | **~15–20 dk** ✅ |

- Okyanustaki boş kara hücreleri atlanınca seri sayısı ~1,6 milyona iner.
- Bellek: parça parça (200 hücrelik chunk) işlenince 8 süreç toplam ~1 GB RAM kullanıyor.
- **Asıl darboğaz indirme**, hesaplama değil.

Vektörel yaklaşımın özü:
```python
# x: (hücre_sayısı, 561) anomali matrisi
s = 0
for k in range(1, n):
    d = x[:, k:] - x[:, :-k]          # tüm i<j çiftleri, gecikme k
    s += np.sign(d).sum(axis=1)       # Mann-Kendall S
    slopes.append(d / k)              # Sen için eğimler
var = n*(n-1)*(2n+5)/18
z = (s - sign(s)) / sqrt(var);  p = 2*(1 - Φ(|z|))
sen = median(concat(slopes), axis=1)
```

---

## 6. Mimari: backend ve frontend ayrı

```
┌──────────────────────┐      ┌───────────────────────┐      ┌──────────────────────┐
│  WORKER (Mac M2)     │      │  BACKEND (sunucu)     │      │  FRONTEND (tarayıcı) │
│                      │      │                       │      │                      │
│ earthaccess+OPeNDAP  │ ───► │ FastAPI               │ ◄──► │ MapLibre GL (globe)  │
│ → Parquet → DuckDB   │ yükle│ + DuckDB (read-only)  │ JSON │ + Plotly / Chart.js  │
│ → trend hesaplama    │      │ + hazır bölge serileri│      │                      │
└──────────────────────┘      └───────────────────────┘      └──────────────────────┘
```

### Backend: FastAPI + DuckDB
Örnek endpoint'ler:
| Endpoint | Ne döner |
|----------|----------|
| `GET /variables` | Değişken listesi + basit açıklamalar |
| `GET /trend-map?var=t2m` | Dünya trend haritası (hücre veya bölge bazında eğim, p) |
| `GET /regions/{country}` | Ülkenin illeri (admin-1) |
| `GET /timeseries?region=TR-21&var=t2m&from=1980&to=2026` | Zaman serisi + trend sonucu |

### Hosting'i kolaylaştıran fikir
İl ve ülke sınırları sabit, bu yüzden bölge serileri **önceden hesaplanabilir**:
- Her MERRA-2 hücresinin hangi ile ne kadar düştüğü bir kere hesaplanır (alan ağırlıklı).
- ~4.500 il/eyalet + ~250 ülke × 10 değişken × 561 ay ≈ 27 milyon değer → **~100 MB**.
- Böylece sunucuda 3–5 GB'lık hücre verisine bile gerek kalmayabilir.

**Hosting adayları** (ücretsiz katman limitleri henüz doğrulanmadı):
- Hugging Face Spaces (veri bir HF dataset reposunda)
- Küçük bir VPS (Hetzner vb., aylık birkaç dolar)
- B planı: lokal çalıştırıp demo videosu

> Streamlit **elendi**: 3D dünya arayüzü için yetersiz.

---

## 7. Arayüz: 3D dünya

**Teknoloji: MapLibre GL JS (v5 ve sonrası, globe projeksiyonu).** Uzaktan bakınca döndürülebilir 3D dünya, yakınlaşınca düz haritaya yumuşak geçiş, ülke ve il sınırlarını tıklatmak kolay, ücretsiz.

| Seçenek | Karar |
|---------|-------|
| **MapLibre GL JS** | ✅ Seçildi |
| Globe.gl (three.js) | Havalı ama il seviyesine yakınlaşınca zayıf |
| CesiumJS | Hackathon için fazla ağır |

### Kullanıcı akışı
```
1. Dünya dönüyor → arkada seçili değişkenin trend haritası
   (kırmızı = artıyor, mavi = azalıyor, soluk = anlamsız)
2. Ülkeye tıkla → kamera oraya uçar (flyTo), ülke sınırı vurgulanır
3. Yakınlaşınca iller açılır → ile tıkla
4. Sağ panel açılır:
   ├─ Zaman serisi grafiği + trend çizgisi
   ├─ Sonuç kartı: "Diyarbakır'da sıcaklık 10 yılda +X °C değişmiş,
   │               p = 0.00X → anlamlı ✅"
   └─ Değişkenin basit açıklaması
```
- **Sol üst:** değişken seçici + "Ne merak ediyorsun?" soruları (ör. "Kuraklık" seçilince `GWETROOT` + `PRECTOT` önerilir).
- **Demo örnekler:** hazır senaryolar ("Diyarbakır yaz sıcaklığı", "Tuz Gölü toprak nemi"...).
- **Dönem seçici:** 1980–güncel arası kaydırıcı. Değiştirilince test anında yeniden yapılır.

### Sınır verisi
- **Natural Earth** admin-0 (ülkeler) + admin-1 (iller/eyaletler). Public domain, Türkiye'nin 81 ili dahil. ✅
- GADM daha detaylı ama lisansı ticari kullanıma kapalı. ❌

---

## 8. Öncelikler ve iş bölümü

### Öncelik sırası
1. 🥇 **Veri hattı + trend testi + grafik + sonuç kartı.** Challenge'ın puanı burada.
2. 🥈 Bölge seçimi (düz harita olsa bile çalışsın)
3. 🥉 3D dünya, animasyonlar, soru akışı, yapay zekâ önerileri

> 3D dünya iki kişilik takım için zaman alır. Zaman yetmezse düz harita + tıklanabilir iller de iş görür.

### İş bölümü (2 kişi)
| Kişi | Sorumluluk |
|------|-----------|
| **Kişi 1: Veri** | earthaccess/OPeNDAP indirme → Parquet → DuckDB → trend hesaplama → bölge serileri → FastAPI |
| **Kişi 2: Arayüz** | MapLibre globe, ülke/il seçimi, grafikler, sonuç kartı, değişken açıklamaları, demo örnekler |

**Ortak sözleşme:** Kişi 1, en baştan `get_timeseries(region, var)` ve `get_trend_map(var)` fonksiyonlarını/endpoint'lerini **sahte veriyle** hazırlar. Böylece Kişi 2 gerçek veriyi beklemeden çalışmaya başlar.

---

## 9. Açık konular / yapılacaklar

- [ ] Earthdata hesabı aç (her iki kişi)
- [ ] OPeNDAP `dap4.ce` değişken seçme sözdizimini ilk dosyada test et
- [ ] Gerçek sıkıştırılmış boyutu ölç (tahmin: 2–4 GB)
- [ ] NetCDF → DuckDB yükleme süresini ölç
- [ ] Natural Earth admin-1 ile hücre → il eşlemesini (alan ağırlıklı) hazırla
- [ ] Hosting seçeneklerinin ücretsiz katman limitlerini doğrula
- [ ] Takımda JS bilen var mı? (3D globe kararı buna bağlı)
- [ ] Demo senaryolarını seç (Diyarbakır, Konya, Tuz Gölü, İstanbul aerosol...)

---

## 10. Kaynaklar

### Challenge'ın verdiği kaynaklar
**NASA**
- [Giovanni](https://giovanni.gsfc.nasa.gov/): değişken menüsü, zaman serisi üretme ve indirme
- [Hydrology Time Series](https://disc.gsfc.nasa.gov/information/tools?title=Hydrology%20Time%20Series)
- [AppEEARS](https://appeears.earthdatacloud.nasa.gov/): coğrafi veri çekme ve dönüştürme
- [Climate Data Online (NOAA)](https://www.ncei.noaa.gov/cdo-web/)
- [SeaWiFS klorofil zaman serisi makalesi (PDF)](https://ntrs.nasa.gov/api/citations/20090042747/downloads/20090042747.pdf): anlamlılık testi örneği

**Partnerler**
- [KNMI Climate Explorer](https://climexp.knmi.nl/)
- [Trend testi yöntemleri (Medium)](https://medium.com/@snp.kriss/statistical-test-methods-to-detect-trends-in-time-series-data-b361a0ec530b)
- [İstatistiksel anlamlılık rehberi](https://www.statsig.com/perspectives/a-comprehensive-guide-to-statistical-significance)
- CSA: [RCM verisi](https://donnees-data.asc-csa.gc.ca/en/dataset/rcm), [Geo.ca](http://geo.ca/), [SWOT](https://www.asc-csa.gc.ca/eng/satellites/swot/), [SAR Python tutorial](https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial)

> NASA, ABD hükümeti dışındaki siteleri onaylamaz. Bu sitelerin verileri kendi kullanım koşullarına tabidir.

### Teknik
- [earthaccess](https://earthaccess.readthedocs.io/): NASA Earthdata Python kütüphanesi
- [NASA CMR Search API](https://cmr.earthdata.nasa.gov/search/)
- [DuckDB](https://duckdb.org/)
- [MapLibre GL JS](https://maplibre.org/)
- [Natural Earth](https://www.naturalearthdata.com/)
- [pymannkendall](https://pypi.org/project/pymannkendall/)
