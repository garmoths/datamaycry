# PLAN: Data May Cry 🌍🔍

> **NASA Space Apps Challenge 2026: _Be An Earth System Trend Detective!_**
> Bu dosya **onaylanmış kararların** kaydıdır. README'deki detaylarla çelişen bir şey olursa **bu dosya geçerlidir**.
> Son güncelleme: 2026-11-13 (hackathon öncesi, sadece planlama)

---

## 0. Kural hatırlatması ⚠️

Space Apps SSS'inde şöyle yazıyor: _"Teams are not allowed to begin working on the challenges prior to the hackathon."_
**Hackathon: 14–15 Kasım 2026.** O zamana kadar kod yazmak, veri indirmek ya da repo açmak yok. Hesap açmak gibi hazırlıklar serbest.

---

## 1. Ne yapıyoruz? (tek cümle)

Kullanıcı **3D dünyada bir ülke/il ya da herhangi bir nokta seçer** ve bir **değişken** seçer (sıcaklık, yağış, toprak nemi...). Araç, o yerin **1980'den bugüne grafiğini** çizer ve şunu söyler: **artıyor mu, azalıyor mu, ne kadar, istatistiksel olarak anlamlı mı?**

Challenge'ın 4 şartı → bizdeki karşılığı:

| Challenge şartı | Bizdeki karşılığı |
|---|---|
| Değişken seçmek | Değişken seçici + basit açıklamalar |
| Bölge için veri almak | **2 mod:** Bölge (ülke/il) + Nokta (herhangi bir hücre) |
| Zaman serisi görselleştirmek | 1980–güncel aylık grafik + trend çizgisi |
| Değişim hızı + anlamlılık testi | Sen's slope + Mann-Kendall (anomali üzerinde) → sonuç kartı |

---

## 2. Onaylanan kararlar ✅

| # | Konu | Karar | Neden |
|---|---|---|---|
| 1 | **Ana veri** | MERRA-2 aylık, 10 değişken, 1980–güncel | 45+ yıl, trend testi için ideal, tek kaynak |
| 2 | **İndirme** | earthaccess + OPeNDAP ile **sadece gereken değişkenler**, ay ay; geçici dosya silinir | Disk sınırı **≤ 10 GB** |
| 3 | **Lokal depolama** | **DuckDB** (kolon bazlı, tek dosya) | Hafif, sunucusuz, iyi sıkıştırma |
| 4 | **Hesaplama** | Worker **kendi Mac'imizde** (M2), vektörel NumPy | Ölçüldü: ~20 dk. Sunucu daha yavaş ve paralı |
| 5 | **Trend yöntemi** | Anomali → **yıllık ortalama** → Mann-Kendall (p) + Sen's slope (eğim); harita için FDR düzeltmesi (bkz. §3.5) | Düz aylık MK otokorelasyon yüzünden **%17–31 yanlış alarm** verdi (ölçüldü) |
| 6 | **Mimari** | Worker, veri deposu ve frontend **ayrı** | Bağımsız geliştirme, bakımı kolay |
| 7 | **Canlıda sunucu** | **Yok (statik).** Testler tarayıcıda JS ile yapılıyor | Bakım yok, çökmez, ücretsiz |
| 8 | **Frontend hosting** | **Vercel** (Hobby, ücretsiz) | Otomatik deploy, PR önizleme linkleri |
| 9 | **Veri hosting** | **Cloudflare R2** (ücretsiz katman) ✅ hesap açıldı | 10 GB ücretsiz, trafik ücreti yok |
| 10 | **Seçim modları** | **2 mod:** 🗺️ Bölge (ülke → il) + 📍 Nokta (hücre karosu) | İl olmayan yerler (okyanus, çöl) ve il içi farklar |
| 11 | **Arayüz** | **MapLibre GL JS globe**: döndürülebilir, yakınlaştırılabilir 3D dünya, "şamatalı" | Jüride güçlü ilk izlenim |
| 12 | **Sınırlar** | **Natural Earth** admin-0 + admin-1 | Public domain, Türkiye'nin 81 ili dahil |
| 13 | **Domain** | Şimdilik yok: `*.vercel.app` + `r2.dev` | Hackathon demosu için yeterli |
| 15 | **Programlama dilleri** | **Python** (worker, `uv` + `uv.lock`) + **TypeScript** (frontend: **Vite + React**, grafik: **Plotly.js**). 2026-11-14'te onaylandı | Python'da NASA/iklim ekosistemi hazır. TS ile dosya sözleşmesi tiplenir. İki ayrı MK uygulaması = L2 paritesi |
| 16 | **Arayüz dili** | **İngilizce (ana) + Türkçe** seçeneği. Açıklamalar ve kart şablonları baştan iki dilli yazılacak | Jüri uluslararası |
| 14 | **Öncelik** | Önce veri + test + grafik + sonuç kartı, **sonra** 3D şamata | Puan orada |

### Elenenler ❌
| Seçenek | Neden elendi |
|---|---|
| Dosyaların tamamını indirmek | ~173 GB, disk sınırını aşıyor |
| PostgreSQL / SQLite | Satır bazlı, ~10–12 GB'a şişer |
| ClickHouse / chDB | Gereksiz güç, ekosistemi DuckDB kadar rahat değil |
| Streamlit | 3D globe arayüzü için yetersiz |
| Canlıda FastAPI sunucusu | Önceden hesaplanmış veriyle gerek kalmadı (ileride eklenebilir) |
| Worker'ı sunucuda çalıştırmak | Mac M2 daha hızlı ve ücretsiz |
| GADM sınırları | Lisansı ticari kullanıma kapalı |
| Globe.gl / CesiumJS | İl seviyesinde zayıf / çok ağır |

---

## 3. Veri

### 3.1 MERRA-2 değişkenleri (1980-01 → güncel, 561 ay, 361×576 ızgara, float32, NetCDF4)

| # | Değişken | Koleksiyon | Anlamı | Birim |
|---|---|---|---|---|
| 1 | `T2M` | M2TMNXSLV | 2 m hava sıcaklığı | K |
| 2 | `QV2M` | M2TMNXSLV | Özgül nem | kg/kg |
| 3 | `SPEED` | M2TMNXFLX | Yüzey rüzgâr hızı | m/s |
| ~~4~~ | ~~`U10M` / `V10M`~~ | ~~M2TMNXSLV~~ | **Çıkarıldı:** aylık ortalama U/V'den hesaplanan hız, gerçek ortalama hızdan düşük çıkar. Yerine hazır `SPEED` var (CMR'da doğrulandı) | |
| 5 | `PRECTOT` | M2TMNXFLX | Yağış | kg m⁻² s⁻¹ |
| 6 | `EVAP` | M2TMNXFLX | Buharlaşma | kg m⁻² s⁻¹ |
| 7 | `GWETROOT` | M2TMNXLND | Kök bölgesi toprak nemi | 0–1 |
| 8 | `RUNOFF` | M2TMNXLND | Yüzey akışı | kg m⁻² s⁻¹ |
| 9 | `SNOMAS` | M2TMNXLND | Kar kütlesi | kg m⁻² |
| 10 | `TOTEXTTAU` | M2TMNXAER | Aerosol optik derinliği | birimsiz |

**Opsiyonel (zaman kalırsa):** GPM IMERG yağış (1998), GLDAS 2.1 toprak nemi (2000), MODIS NDVI / LST (2000), OMI NO₂ (2004).

### 3.2 Veri akışı
```
NASA (OPeNDAP)  ──►  Mac worker  ──►  DuckDB (lokal, ~3–5 GB)
                         │
                         ├──► Vercel   : variables.json, trend haritaları, ülke/il serileri, sınırlar  (< 100 MB)
                         └──► R2       : hücre karoları (Nokta modu)                                  (~2,3 GB)
```

### 3.3 Ürettiğimiz dosyalar
| Dosya | Nereye | İçerik | Boyut (hesaplanan) |
|---|---|---|---|
| `variables.json` | Vercel | Değişkenler, birimler, basit açıklamalar | KB'lar |
| `trend_map/{var}.bin` | Vercel | Her hücrenin eğimi + p-değeri | ~1,7 MB / değişken → ~17 MB |
| `regions/{ülke}.bin` | Vercel | Ülke + illerinin aylık serileri, int16 (~250 dosya) | ~54 MB toplam |
| `boundaries.pmtiles` | Vercel | Natural Earth ülke + il sınırları (sadeleştirilmiş) | tahmin: ~10–40 MB |
| `tiles/{var}/{tx}_{ty}.bin` | R2 | 10°×10° karo: 320 hücre × 561 ay, int16 | ~359 KB / dosya, 6.480 dosya, ~2,3 GB |

> Vercel'in deploy başına limiti **100 MB** ve **15.000 dosya**. Toplamın bu sınırın altında kalması gerekiyor. Ölçüp doğrulayacağız.

### 3.4 Lokal DuckDB şeması
```sql
CREATE TABLE merra2 (cell_id INTEGER, month DATE,
  t2m REAL, qv2m REAL, speed REAL, prectot REAL,
  evap REAL, gwetroot REAL, runoff REAL, snomas REAL, totexttau REAL);
-- ⚠️ ORDER BY cell_id, month ile yaz

CREATE TABLE cells  (cell_id INTEGER, lat REAL, lon REAL, country TEXT, admin1 TEXT);
CREATE TABLE trends (cell_id INTEGER, var TEXT, slope_per_decade REAL,
                     p_value REAL, significant BOOLEAN, period_start DATE, period_end DATE);
```
DuckDB'de tek yazar kuralı var: worker `data_new.duckdb`'ye yazar, bitince dosyayı `data.duckdb` ile değiştirir.

> Değişken sayısı artık **9** (U10M+V10M yerine SPEED). Önceki boyut ve süre hesapları 10 değişken içindi, yani üst sınır olarak geçerliliğini koruyor.

### 3.5 Veri anlamlandırma protokolü 🧪

Ham sayıdan "Diyarbakır ısınıyor mu?" sorusunun cevabına kadar **her adım sabit ve belgeli** olmalı. Worker (Python) ve tarayıcı (JS) **aynı adımları** uygular.

#### Adım 1: Temizlik
- MERRA-2 `_FillValue` = **1e15** (CMR'da doğrulandı) → `NaN`.
- Kara değişkenlerinde (`GWETROOT`, `RUNOFF`, `SNOMAS`) okyanus hücreleri `NaN` olur → bu hücreler haritada "veri yok" olarak gösterilir.
- Bir hücrede yılların **%20'sinden fazlası eksikse** o hücre için test yapılmaz.

#### Adım 2: Birim çevirisi (kullanıcı ham birim görmez)
| Değişken | Ham birim | Gösterilen birim | Çeviri |
|---|---|---|---|
| `T2M` | K | °C | − 273,15 |
| `QV2M` | kg/kg | g/kg | × 1000 |
| `SPEED` | m/s | m/s | — |
| `PRECTOT`, `EVAP`, `RUNOFF` | kg m⁻² s⁻¹ | mm/gün | × 86.400 |
| `GWETROOT` | 0–1 | % | × 100 |
| `SNOMAS` | kg m⁻² | mm su eşdeğeri | — (1 kg/m² = 1 mm) |
| `TOTEXTTAU` | birimsiz | birimsiz (AOD) | — |

#### Adım 3: Mevsimselliği kaldırma (anomali)
- **Referans dönem: 1991–2020.** Bu, WMO'nun standart iklim normali.
- Anomali = değer − o takvim ayının 1991–2020 ortalaması.
- Grafikte kullanıcıya **iki görünüm** sunulur: ham aylık değerler (mevsim dalgası görünür) ve anomali + trend çizgisi.

#### Adım 4: Trend testi
**Ölçüm (bu Mac'te, sentetik veri, trendsiz AR(1) gürültü, 300 tekrar, hedef yanlış alarm oranı %5):**

| Yöntem | φ = 0,3 | φ = 0,6 | Karar |
|---|---|---|---|
| Düz MK, aylık anomali | %17,3 ❌ | %30,7 ❌ | Kullanma |
| TFPW | %19,7 ❌ | %45,3 ❌ | Kullanma |
| Yue-Wang (pymannkendall) | %50 ❌ | %51 ❌ | Kullanma |
| Pre-whitening, aylık | %4,7 ✅ | %4,7 ✅ | Yedek yöntem |
| **Düz MK, yıllık ortalama anomali** | **%4,3 ✅** | **%6,7 ✅** | **Ana yöntem** |

**Karar:**
- **Ana test:** aylık anomaliler → **yıllık ortalama** (sadece tam yıllar: 1980–2025 = 46 nokta, bkz. §10.4) → **Mann-Kendall** (p) + **Sen's slope** (eğim) + eğim için **%95 güven aralığı**.
  - Neden: basit, öğrenciye anlatılabilir ("her yılın ortalamasına bakıyoruz"), otokorelasyon sorununu büyük ölçüde çözüyor ve hesaplaması aylık teste göre çok daha ucuz.
- **Yedek / ileri seviye:** aylık seri üzerinde pre-whitening MK (`pymannkendall.pre_whitening_modification_test`).
- **Mevsim modu (opsiyonel):** sadece yaz (Haz-Tem-Ağu) veya sadece kış ortalamaları ile aynı test. Örnek soru: "Diyarbakır'da yazlar ısınıyor mu?"
- **Asgari uzunluk:** kullanıcı **10 yıldan kısa** bir dönem seçerse test yapılmaz, uyarı gösterilir.
- Yarın gerçek verinin lag-1 otokorelasyonunu ölçüp bu kararı doğrulayacağız.

#### Adım 5: Çoklu test düzeltmesi (sadece dünya haritası için)
- 200 binden fazla hücreye ayrı ayrı p < 0,05 testi uygulanınca, **hiç trend olmasa bile ~%5'i "anlamlı" çıkar**. Bu, ~10.000 sahte "anlamlı" hücre demek.
- Harita için **Benjamini-Hochberg FDR** (q = 0,05) uygulanır. Haritada noktalı/taralı gösterilen yerler FDR'yi geçen hücreler olur.
- Tek bir bölge veya noktaya bakarken normal p-değeri gösterilir.

#### Adım 6: Bölge ortalaması
- Hücreler **alan ağırlıklı** ortalanır: ağırlık = cos(enlem) × hücrenin il içinde kalan kesri.
- Önce bölge ortalaması alınır, **sonra** anomali ve test yapılır.

#### Adım 7: int16 paketleme hassasiyeti
- Her değişken için `scale` ve `offset` değerleri `variables.json`'a yazılır: `değer = int16 × scale + offset`.
- Hedef hassasiyet: sıcaklık **0,01 °C**, yağış **0,01 mm/gün** gibi. Paketleme sonrası sapma test edilir (maks. hata < scale/2).

#### Adım 8: Sonucu kullanıcıya söyleme (dil kuralları)
| Durum | Sonuç kartı metni (şablon) |
|---|---|
| p < 0,05 ve eğim > 0 | "📈 **Anlamlı artış:** {bölge}'de {değişken} her 10 yılda ortalama **{eğim} {birim}** artmış (%95 GA: {alt}–{üst}). Bunun tesadüf olma ihtimali düşük (p = {p})." |
| p < 0,05 ve eğim < 0 | "📉 **Anlamlı azalış:** ..." |
| p ≥ 0,05 | "〰️ **Anlamlı bir trend yok.** Değişim görülüyor ({eğim}/10 yıl) ama tesadüften ayırt edilemiyor. Daha uzun bir dönem seçmeyi deneyin." |

**Kurallar:**
- **Neden-sonuç iddiası yok.** "İklim değişikliği yüzünden" denmez, sadece "değişmiş" denir.
- "Anlamlı" kelimesinin yanında her zaman "istatistiksel olarak" açıklaması (tooltip) bulunur.
- Toplam değişim de gösterilir: "1980'den bu yana toplam ≈ {eğim × on yıl sayısı} {birim}".
- Veri kaynağı her kartta yazar: "Kaynak: NASA MERRA-2 reanaliz verisi".

#### Adım 9: Doğrulama (sonuçlara güvenmeden önce)
- [ ] **Python ↔ JS:** aynı seri için iki implementasyon aynı p ve eğimi vermeli (otomatik test).
- [ ] **Giovanni karşılaştırması:** 2–3 nokta için Giovanni'den alınan zaman serisi bizimkiyle örtüşmeli.
- [ ] **Bilinen sonuç kontrolü:** küresel `T2M` trendi yaklaşık **+0,2 °C / 10 yıl** civarında çıkmalı (yaygın literatür değeri, kabaca bir sağlama). Kutup bölgelerinde daha hızlı ısınma görülmeli.
- [ ] **Sahte trend testi:** trendsiz rastgele veride yanlış alarm oranı ~%5 olmalı.

#### Bilinen sınırlamalar (Hakkında sayfasında yazacak)
- MERRA-2 bir **reanaliz**, yani doğrudan ölçüm değil, model + gözlem birleşimi. Zaman içinde gözlem sistemleri değiştiği için bazı değişkenlerde (özellikle aerosol ve yağış) **yapay sıçramalar** olabilir. Örneğin aerosolde uydu gözlemlerinin dahil edildiği yıllar. Bu genel bir uyarı, değişken bazında detayına bakmadık.
- 0,5° çözünürlük (~50 km) küçük ilçeleri ve şehir içi farkları göstermez.
- Doğrusal trend, hızlanan ya da yön değiştiren değişimleri tam yansıtmaz.

### 3.6 Güvenilirlik katmanı (hedef: %99,9) 🛡️

#### "%99,9" tam olarak ne demek? (dürüst tanım)
Bir istatistik testi "%99,9 doğru" olamaz; her zaman bir yanlış alarm ile kaçırma dengesi vardır. Hedefimizi **ölçülebilir** üç parçaya bölüyoruz:

| Hedef | Tanım | Nasıl sağlanır |
|---|---|---|
| **H1. Yazılım doğruluğu** | Aynı veriye her zaman aynı, doğru hesap | Testler (L1, L2, L6) |
| **H2. "Güçlü kanıt" etiketinin güvenilirliği** | Trend **yokken** "Güçlü kanıt" deme oranı **≤ %0,2** (≥ %99,8 özgüllük) | Katmanlı karar kuralı (L3), **ölçüldü** |
| **H3. Veri kaynaklı hatalara karşı koruma** | Reanaliz kaynaklı yapay sıçramaların fark edilmesi | Bağımsız kaynak karşılaştırması (L4) + uyarı (L5) |

> Bir kısıt: H3'ü istatistikle %100 çözmek mümkün değil. Bunu bir sonraki simülasyonda ölçtük ve aşağıda açıkça yazdık.

#### Simülasyon (bu Mac'te, 1.000 tekrar/senaryo, aylık AR(1) φ = 0,6, 47 yıl)
| Karar kuralı | Trend yokken "var" deme ❌ | Gerçek trendi yakalama ✅ | Yapay sıçramayı "trend" sanma ⚠️ |
|---|---|---|---|
| R1: yıllık MK p < 0,05 | %6,0 | %88,0 | %89,7 |
| R2: yıllık MK p < 0,01 | %1,0 | %71,7 | %71,4 |
| R3: yıllık MK p < 0,001 | **%0,1** | %43,9 | %40,0 |
| **R4: yıllık p < 0,01 + pre-whitening p < 0,01 (aynı yön) + baştan/sondan 5 yıl kırpınca da p < 0,05 (aynı yön)** | **%0,2** | **%57,3** | %60,1 |
| R5: R4 + sıçrama bayrağı yok | %0,2 | %55,9 | %46,6 |
| Sıçrama bayrağı (adım modeli, BIC farkı > 6) | %0,5 | %2,6 | **%17,7** |

**Ne öğrendik?**
- **R4, R3'ten daha iyi bir denge:** yanlış alarm neredeyse aynı (%0,2'ye karşı %0,1), ama gerçek trendleri çok daha fazla yakalıyor (%57'ye karşı %44).
- **İstatistik tek başına yapay sıçramayı ayırt edemiyor:** hiçbir kural sıçramayı güvenilir şekilde trendden ayıramadı. Sıçrama bayrağı vakaların sadece %17,7'sini yakaladı. **Gerçek savunma bağımsız ikinci bir kaynak (L4).** Büyük kurumların da birden fazla veri setini karşılaştırmasının sebebi bu.

#### Katmanlar
**L0. Kaynak bütünlüğü** (her indirmede, otomatik)
- NASA CMR, MERRA-2 için **checksum vermiyor** (kontrol edildi: `"Name": "Not provided"`). Bütünlüğü kendimiz doğrularız:
  - Koleksiyon başına **561 ay** var mı, ay sırası kesintisiz mi?
  - Her dosyanın ızgarası **361 × 576** mı?
  - `_FillValue` (1e15) → `NaN`; NaN oranı beklenen aralıkta mı? (atmosfer değişkenlerinde %0, kara değişkenlerinde ~%70)
  - **Fiziksel aralık kontrolü:** ör. `T2M` 180–340 K, `GWETROOT` 0–1, `PRECTOT` ≥ 0. Aralık dışı değer çıkarsa **worker durur**.
- `manifest.json`: her dosyanın SHA-256 değeri, koleksiyon sürümü (5.12.4), NASA üretim tarihi, indirme tarihi.

**L1. Dönüşüm doğruluğu** (birim testleri)
- Birim çevirileri, anomali hesabı (anomalilerin 1991–2020 ortalaması ≈ 0 olmalı), alan ağırlıklarının toplamı = 1.
- `cell_id ↔ lat/lon` ve karo indeksinin gidiş-dönüşü **birebir** tutmalı.
- int16 paketleme gidiş-dönüş hatası **< scale/2** olmalı.

**L2. İstatistik doğruluğu** (otomatik testler)
- Vektörel MK/Sen ile `pymannkendall` arasında 1.000 rastgele seride **birebir eşleşme** (bugün 5 seride doğrulandı).
- **Python ↔ JS paritesi:** aynı seriler için fark < 1e-6.
- **Bilinen trend geri kazanımı:** eklenen trend, güven aralığının içinde bulunmalı.
- **Kalibrasyon testi:** trendsiz veride R1 ≈ %5, R4 ≤ %0,5 olmalı. Bu test her değişiklikte tekrar çalışır.

**L3. Karar katmanı:** kullanıcıya 3 seviye gösterilir. IPCC'nin kalibre edilmiş belirsizlik dili örnek alındı.

| Etiket | Kural | Ölçülen yanlış alarm |
|---|---|---|
| 🟢 **Güçlü kanıt** | R4 sağlanıyor | %0,2 |
| 🟡 **Olası trend** | R1 sağlanıyor, R4 sağlanmıyor | — |
| ⚪ **Trend gösterilemedi** | R1 sağlanmıyor | — |

Kullanıcı her zaman eğimi, güven aralığını ve p-değerini görür. Hiçbir bilgi saklanmaz, sadece etiket temkinli seçilir. Dünya haritasında FDR (Adım 5) uygulanır ve "Güçlü" hücreler ayrıca işaretlenir.

**L4. Bağımsız kaynakla çapraz kontrol** (demo senaryoları ve küresel kontrol için, ücretsiz)
| Bizim değişken | Bağımsız kaynak | Ne kontrol edilir |
|---|---|---|
| `T2M` (küresel ortalama) | NASA GISTEMP (küçük bir CSV) | Trend yönü ve büyüklüğü uyumlu mu? |
| `PRECTOT` | GPM IMERG (2000 sonrası, Giovanni) | Demo bölgelerinde trend yönü aynı mı? |
| `GWETROOT` | GLDAS 2.1 (2000 sonrası, Giovanni) | Demo bölgelerinde trend yönü aynı mı? |
| `TOTEXTTAU` | MODIS AOD (2000 sonrası, Giovanni) | Demo bölgelerinde trend yönü aynı mı? |
- Kaynaklar uyumluysa sonuç kartına "✔ bağımsız kaynakla tutarlı" rozeti eklenir. Uyumsuzsa **o senaryo demoda kullanılmaz.**
- Bu kontrol Giovanni ile elle yapılır (birkaç bölge). Diskte ek yer kaplamaz.

**L5. Yapay sıçrama uyarısı**
- Sıçrama bayrağı (adım modeli, BIC farkı > 6) tetiklenirse sonuç kartında "⚠️ ani sıçrama şüphesi: değişim kademeli değil, tek seferlik olabilir" uyarısı çıkar. Uyarı nadiren yanlış tetikleniyor (gerçek trendde %2,6) ama sıçramaların çoğunu yakalayamıyor. Bu yüzden ana savunma L4.
- Aerosol ve yağış gibi gözlem sistemi değişiminden etkilenebilecek değişkenlere kalıcı bir dipnot eklenir.

**L6. Tekrarlanabilirlik**
- Python bağımlılıkları sürüm sabitlenmiş halde (`requirements.lock` / `uv.lock`), JS'te `package-lock.json`.
- Rastgelelik içeren her yerde sabit seed. Aynı girdi her zaman aynı çıktı byte'larını vermeli (hash karşılaştırması).
- Her sonuç kartında veri sürümü yazar: "MERRA-2 v5.12.4, işlenme: {tarih}".

**L7. İnsan kontrolü (dört göz kuralı)**
- Enes'in ürettiği demo sonuçlarını Rumet kontrol eder. Rumet'in yazdığı sonuç kartı metinlerini Enes şablona göre kontrol eder.
- **Akıl sağlığı galerisi:** yayından önce 10 bilinen yere bakılır. Örneğin Arktik hızlı ısınıyor mu, Sahra'da kar kütlesi 0 mı, Amazon'da toprak nemi makul mü?

**L8. Canlıdaki kontroller**
- Frontend her veri dosyasının şema sürümünü kontrol eder. Uyuşmazlık varsa sonuç göstermez, hata mesajı gösterir.
- `NaN` veya eksik veri olan bölgede kart "veri yok" der, asla 0 göstermez.
- Testler GitHub Actions'ta otomatik çalışır. Public repolarda ücretsiz olduğunu biliyorum ama bugün doğrulamadım.

#### Büyük kurumlarla karşılaştırma (genel bilgiye dayanıyor, bugün tek tek doğrulanmadı)
| Kurumların yaptığı (NASA GISTEMP, NOAA, Copernicus/ECMWF, Berkeley Earth, IPCC) | Bizde |
|---|---|
| Kod ve verinin açık olması, bağımsız yeniden uygulamalar | ✅ Açık repo + Python↔JS iki bağımsız uygulama (L2) |
| Birden fazla bağımsız veri setinin karşılaştırılması | ✅ L4 (sınırlı: demo bölgeleri + küresel) |
| Otokorelasyonu hesaba katan trend analizi ve güven aralıkları | ✅ Yıllık MK + pre-whitening + Sen güven aralığı |
| Kalibre edilmiş belirsizlik dili (IPCC: "likely", "very likely"...) | ✅ L3: 3 seviyeli etiket |
| Alan anlamlılığı / çoklu test düzeltmesi | ✅ FDR |
| Sürümlü veri ve kaynak takibi | ✅ manifest + sürüm damgası (L0, L6) |
| Kalite kontrol, otomatik testler, sürekli entegrasyon | ✅ L0–L2, L8 |
| **Homojenizasyon** (gözlem değişikliklerinden kaynaklı sıçramalar) | 🟡 **Kısmen (§3.7-1):** MERRA-2 − ERA5 fark serisinde göreli sıçrama testi + homojenize edilmiş istasyonlar |
| **Topluluk (ensemble) belirsizliği** | 🟡 **Kısmen (§3.7-2):** 2 bağımsız reanaliz (MERRA-2 + ERA5) + etkin örneklem düzeltmeli güven aralığı |
| **Hakemli bilimsel inceleme** | 🟡 **Kısmen (§3.7-3):** standart yöntemler + önceden kilitlenmiş kurallar + uzman geri bildirimi |
| İstasyon tabanlı yerel doğrulama | 🟢 **Var (§3.7-4):** NOAA GHCN-M v4 (homojenize), Diyarbakır ve Konya'da 46/46 yıl tam |

#### Maliyet
**Para maliyeti: 0 ₺.** Hepsi lokal hesaplama, ücretsiz araçlar ve elle Giovanni kontrolü. Ek disk ihtiyacı birkaç MB. **Zaman maliyeti** ve hackathon önceliği:

| Öncelik | Katmanlar | Tahmini süre |
|---|---|---|
| 🔴 Mutlaka | L0, L1, L2'nin kalibrasyon + parite kısmı, L3, L8'in NaN kuralı | ~3–4 saat |
| 🟡 Gerekli | L4 (3–4 demo bölgesi), L6, L7 akıl sağlığı galerisi | ~2–3 saat |
| 🟢 Zaman kalırsa | L5 sıçrama bayrağı, GitHub Actions, tam manifest | ~1–2 saat |

L3'ün hesaplama maliyeti: hücre başına ~4 test yapılıyor, ama hepsi 47 noktalık yıllık seri (aylık pre-whitening hariç). Yine de Mac'te 1 saatin altında kalması beklenir. Ölçmedik, yarın ölçeceğiz.

### 3.7 Eksik 4 konunun incelemesi (ücretsiz telafiler) 🔬

> **Kural kontrolü (Space Apps Legal sayfası, 2026-11-13):** NASA dışı veri **yasak değil**. Şartlar: veri ücretsiz ve herkese açık olmalı ya da açık lisanslı olmalı, **her kaynak atıf yapılarak listelenmeli** ve lisansı belirtilmeli. Atıf yapılmazsa ödül geri alınabilir.
> | Kaynak | Kimin | Lisans | Durum |
> |---|---|---|---|
> | MERRA-2 | NASA | NASA açık veri | ✅ ana kaynak |
> | GHCN-M v4 | NOAA (ABD hükümeti) | Kamuya açık | ✅ |
> | ERA5 | Copernicus / ECMWF (AB) | **CC-BY** (CDS sayfasında doğrulandı) | ✅ atıfla serbest |
> | Natural Earth | Gönüllü proje | Public domain | ✅ |
> ERA5 sadece **doğrulama** için kullanılıyor. Ana veri ve bütün sonuçlar NASA'dan geliyor. Teslimde tüm kaynaklar ve lisansları "References" bölümünde listelenecek.

> Hepsi 2026-11-13'te kontrol edildi ve bu Mac'te simüle edildi. İstasyon dosyası sadece **fizibilite kontrolü** için geçici bir klasöre indirildi, projeye dahil değil.

#### 1. Homojenizasyon → **Göreli homojenlik testi**
**Sorun:** Gözlem sistemleri değişince veride yapay sıçramalar oluşuyor. Kurumlar bunu istasyon çiftlerini karşılaştırarak temizliyor (ör. NOAA'nın PHA algoritması).

**Bizim ücretsiz çözümümüz:** Aynı bölge için **MERRA-2 − ERA5 fark serisini** çıkarıp sıçrama testini bu fark serisinde yapmak. Gerçek iklim sinyali iki veri setinde de ortak olduğu için farkta yok oluyor, geriye sadece veri setlerinden birine özgü yapay sıçramalar kalıyor.

**Simülasyon (1.000 tekrar, yıllık seri, 0,8 sd sıçrama):**
| | Gerçek trendi yanlışlıkla "sıçrama" sanma | Yapay sıçramayı yakalama |
|---|---|---|
| Tek veri seti (§3.6, L5) | %9,6 | %10,4 |
| **Fark serisi (MERRA-2 − ERA5)** | **%0,3** | **%57,7** |

Sıçrama yakalama **~5,5 kat** arttı, yanlış bayrak **~30 kat** azaldı.

**Karar:** Sıçrama bayrağı (L5) artık **fark serisi** üzerinde çalışacak. Bayrak varsa: "Güçlü kanıt" etiketi verilmez, kartta "⚠️ veri setleri arasında ani fark var" uyarısı çıkar.

**Sınırlama:** ERA5 ve MERRA-2 bazı gözlemleri (uydular) ortak kullanıyor. **İkisini birden etkileyen** bir değişiklik farkta görünmez. İstasyon kontrolü (madde 4) bunu kısmen yakalar.

**ERA5 (doğrulandı):** Copernicus CDS, "ERA5 monthly averaged data on single levels", **1940'tan bugüne**, 0,25° çözünürlük, ücretsiz. CDS hesabı ve lisans onayı gerekiyor (bunu siz yapacaksınız). İndirme sırasında `grid` (ör. 1°) ve `area` (bölge) parametreleriyle boyut küçültülebilir:
- Değişken başına 1° küresel aylık veri: 181 × 360 × 4 B × 561 ay ≈ **146 MB**. Sadece `T2M` + yağış ≈ 0,3 GB. **10 GB disk bütçesine sığar.**
- Değişken eşleşmesi: `T2M` ↔ `2m_temperature`, `PRECTOT` ↔ `total_precipitation`, `SPEED` ↔ `10m_wind_speed`. Diğerleri için eşleşmeyi yarın kontrol edeceğiz.

#### 2. Ensemble belirsizliği → **2 üyeli gözlem topluluğu + doğru güven aralığı**
**Kontrol edildi:** ERA5'in 10 üyeli ensemble yayılımı **aylık ortalama olarak sunulmuyor**, sadece 3 saatlik veri olarak var. Bu çok büyük bir veri, hackathon için uygun değil ❌

**Bizim ücretsiz çözümümüz, iki katmanlı:**
- **(a) Yapısal belirsizlik:** Bir bölgenin trendi hem MERRA-2 hem ERA5 ile hesaplanır, kartta iki eğim yan yana gösterilir. IPCC de birden fazla gözlem veri setinin aralığını gösteriyor.
  - Aynı yön ve ikisi de anlamlı → "✔ iki bağımsız reanaliz uyumlu" rozeti.
  - Ters yön → "Güçlü kanıt" etiketi **verilmez**.
- **(b) İstatistiksel belirsizlik:** Sen eğiminin güven aralığı otokorelasyona göre düzeltilir.

**Simülasyon (300 tekrar, hedef %95 kapsama):**
| Güven aralığı yöntemi | φ = 0,3 | φ = 0,5 |
|---|---|---|
| Klasik Sen GA | ~%79 ❌ (aralık çok dar) | %78,7 ❌ |
| Blok bootstrap (L = 5 / 8 / 12) | %80–84 ❌ | %77–83 ❌ |
| **Etkin örneklem düzeltmeli Sen GA** | **%92,7** ✅ | **%93,0** ✅ |

**Karar:** Etkin örneklem düzeltmeli GA kullanılacak. Varyans × (1 + r₁)/(1 − r₁), r₁ = trendden arındırılmış serinin lag-1 otokorelasyonu. Hem daha doğru hem bootstrap'tan çok daha ucuz. Bootstrap'a gerek yok.

**Güncellenen "Güçlü kanıt" kuralı (R4+):**
R4 (§3.6) **+** ERA5'te aynı yön ve p < 0,05 **+** fark serisinde sıçrama bayrağı yok.
ERA5 verisi olmayan değişkenlerde R4 tek başına geçerli kalır ve kartta "tek kaynak" notu çıkar.

#### 3. Hakemli inceleme → **4 ücretsiz ikame**
Hackathon süresinde gerçek bir hakem süreci mümkün değil. En yakın ücretsiz karşılıklar:

| İkame | Ne yapılır | Maliyet |
|---|---|---|
| **a. Önceden kilitlenmiş kurallar** | Karar kuralları (R4+, FDR, eşikler) **gerçek veriyi görmeden önce** bu dosyada sabitlendi. Sonuçlara bakıp kural değiştirmek (p-hacking) yasak, değişiklik gerekirse gerekçesiyle buraya yazılır. Bilimdeki "ön kayıt" (pre-registration) uygulamasının karşılığı. | 0 |
| **b. Sadece yerleşik, yayımlanmış yöntemler** | Mann (1945), Kendall (1975), Sen (1968), pre-whitening (von Storch 1995; Yue vd. 2002), etkin örneklem düzeltmesi, Benjamini-Hochberg (1995), iklim haritalarında FDR (Wilks 2016). Kaynakları METHODS.md'de listelenecek. | 0 |
| **c. Uzman geri bildirimi** | Space Apps Connect'teki konu uzmanları (SSS bu platformda uzmanlar olduğunu söylüyor) ve üniversiteden iklim/istatistik alanında bir hoca. 1 sayfalık METHODS.md'yi okutmak. | 0 |
| **d. Tekrarlanabilir yöntem sayfası** | Sitede "Yöntem" sayfası + kod: herkes aynı sonucu üretebilsin, hatayı bulabilsin. | 0 |

#### 4. İstasyon doğrulaması → **NOAA GHCN-Monthly v4** ✅
**Kontrol edildi** (dosya indirildi ve incelendi):
- `ghcnm.tavg.latest.qcf.tar.gz` (**homojenize edilmiş** ortalama sıcaklık): sıkıştırılmış **44 MB**, açılınca 210 MB. Bugün (13 Kasım 2026) güncellenmiş, v4.0.1.
- Dünyada **27.900** istasyon, Türkiye'de **257** istasyon.
- 1980–2025 arasında **≥ 40 tam yılı olan 36 Türk istasyonu** var.
- Demo şehirlerimiz: **Diyarbakır 46/46 yıl ✅**, **Konya 46/46 ✅**, Ankara 44/46 ✅. İstanbul sadece 27/46 ⚠️, demoda kullanılmamalı.

**Plan:**
- Sadece demo şehirleri ve ~36 güçlü istasyon filtrelenip saklanır (birkaç MB). Diskte kalıcı yer kaplamaz.
- İstasyon trendi ile o istasyonun düştüğü MERRA-2 hücresinin trendi karşılaştırılır. **Mutlak değerler değil, trendler karşılaştırılır**, çünkü bir nokta istasyon ile 50 km'lik hücre aynı sıcaklığı ölçmez.
- Uyumluysa kartta "✔ yer istasyonuyla tutarlı (NOAA GHCN)" rozeti çıkar.
- NOAA bu veriyi kendi PHA algoritmasıyla zaten homojenize ediyor. Sıcaklık için madde 1'deki "ortak sıçrama" sınırlamasını da kısmen kapatıyor.

**Sınırlama:** Bu sadece sıcaklık için. Yağış istasyonu verisinin (GHCN-M v4 yağış) durumunu doğrulamadım.

#### Özet: eksiklerin yeni durumu
| Konu | Önce | Şimdi | Ek maliyet |
|---|---|---|---|
| Homojenizasyon | ❌ | 🟡 Fark serisinde göreli test (sıçrama yakalama %10 → %58) | CDS hesabı, ~0,3 GB disk, ~1–2 saat |
| Ensemble belirsizliği | ❌ | 🟡 2 reanaliz + düzeltilmiş GA (kapsama %79 → %93) | ERA5 ile aynı, GA hesabı bedava |
| Hakemli inceleme | ❌ | 🟡 Ön kayıt + standart yöntemler + uzman + açık yöntem | ~1 saat (METHODS.md) |
| İstasyon doğrulaması | ❌ | 🟢 GHCN-M v4, demo şehirlerinde tam veri | ~1 saat, birkaç MB |

**Para maliyeti: 0 ₺.** Ek hesap: **Copernicus CDS** (ücretsiz). Hackathon önceliği: istasyon (4) ve düzeltilmiş GA (2b) → 🔴 mutlaka. ERA5 karşılaştırması (1, 2a) → 🟡 gerekli. Uzman geri bildirimi (3c) → zaman kalırsa.

---

## 4. Worker (Mac'te)

```
1. İndir    earthaccess.search_data → OPeNDAP ile değişken alt kümesi → Parquet (ay ay) → geçici dosyayı sil
2. Yükle    Parquet → DuckDB (ORDER BY cell_id, month)
3. Hesapla  anomali → Mann-Kendall + Sen (vektörel NumPy, 8 süreç, 200 hücrelik parçalar)
4. Bölgeler hücre → il/ülke alan ağırlıklı ortalama
5. Paketle  trend_map / regions / tiles dosyaları (int16)
6. Yükle    Vercel (frontend deploy ile) + R2 (boto3, S3 API)
```
Çalıştırma: `caffeinate -i python worker.py` (Mac uykuya geçmesin)

---

## 5. Frontend (Vercel)

- **MapLibre GL JS** (globe projeksiyonu) + grafik kütüphanesi (Plotly.js veya Chart.js, **karar verilmedi**)
- **Mod toggle:** `🗺️ Bölge | 📍 Nokta`
- **Akış:** dünya döner (arkada trend haritası) → ülkeye tıkla → `flyTo` → iller açılır → ile tıkla → sağ panel: grafik, trend çizgisi, sonuç kartı, değişken açıklaması
- **Nokta modu:** tıklanan koordinat → karo hesaplanır → R2'den ~359 KB dosya çekilir → hücre seçilir → test tarayıcıda JS ile yapılır
- **Dönem kaydırıcı:** 1980–güncel. Değişince test tarayıcıda anında tekrar hesaplanır.
- **Ekstralar:** "Ne merak ediyorsun?" soruları, demo senaryolar (Diyarbakır, Konya, Tuz Gölü...), zayıf cihazlar için hafif mod
- Ağır dokular WebP/KTX2 ile sıkıştırılacak, gerektiğinde yüklenecek (Vercel aylık 100 GB trafik)

---

## 6. Gerçeklik testi (2026-11-13'te kontrol edildi) 🔎

### ✅ Doğrulananlar
| İddia | Nasıl doğrulandı | Sonuç |
|---|---|---|
| Challenge şartları ve kaynakları | Challenge sayfası + Resources sekmesi okundu | ✅ |
| Hackathon 14–15 Kasım, önceden çalışmak yasak | Resmî Participant FAQ | ✅ |
| MERRA-2 1980'den beri, 561 granül, ~75–80 MB/dosya | NASA CMR API | ✅ |
| 10 değişkenin adı, float32 tipi, 361×576 ızgarası | NASA CMR UMM-Var | ✅ |
| Her granülün OPeNDAP linki var | NASA CMR granül linkleri | ✅ |
| Tam dosyalar ~173 GB, 10 değişken ham ~4,67 GB / int16 ~2,33 GB | Hesaplandı | ✅ |
| Mann-Kendall + Sen: 8 çekirdekte 0,57 ms/seri → **~20 dk** (2,08 M seri) | **Bu Mac'te ölçüldü** (M2, 8 çekirdek, 16 GB), `pymannkendall` ile birebir aynı sonuç | ✅ |
| `earthaccess` (0.18.0): `login`, `search_data`, `get_requests_https_session` var | pip ile kuruldu ve incelendi | ✅ |
| `duckdb` 2.0.0, `xarray`, `boto3`, `pymannkendall` kurulabiliyor | pip ile kuruldu | ✅ |
| Vercel Hobby: 100 GB trafik, 100 MB / 15.000 dosya deploy limiti, takım özelliği yok, Git org reposu desteklenmiyor | Vercel resmî dokümanları | ✅ |
| R2 ücretsiz: 10 GB, 1 M yazma, 10 M okuma, trafik ücretsiz; kart istiyor | Cloudflare dokümanı + aktivasyon ekranı | ✅ |
| r2.dev hız sınırlı, sadece geliştirme amaçlı | Cloudflare dokümanı | ✅ (demo için kabul edildi) |
| MapLibre GL JS globe desteği | npm: güncel sürüm **6.18.0**, changelog'da globe düzeltmeleri var | ✅ |
| Natural Earth admin-1: **4.596** il/eyalet, **251** ülke, **Türkiye 81 il** | GeoJSON indirildi ve sayıldı | ✅ |
| Karo: 18×36 = 648 karo, 320 hücre, ~359 KB/değişken | Hesaplandı | ✅ |
| Bölge serileri ~54 MB (4.847 bölge × 10 × 561 × 2 B) | Hesaplandı | ✅ |
| Mac'te Node v25.6.1, npm 11.9.0, Python 3.14.5, git 2.50.1 | Komutla kontrol edildi | ✅ |
| `SPEED` (M2TMNXFLX) mevcut, `_FillValue` = 1e15 | NASA CMR UMM-Var | ✅ |
| Düz aylık MK yanlış alarm %17–31; yıllık ortalama MK ve pre-whitening ~%5 | **Bu Mac'te simülasyon** (AR(1), 300 tekrar) | ✅ |
| "Güçlü kanıt" kuralı (R4) yanlış alarm %0,2, yakalama %57; sıçrama bayrağı sıçramaların sadece %17,7'sini yakalıyor | **Bu Mac'te simülasyon** (1.000 tekrar/senaryo) | ✅ |
| CMR, MERRA-2 granülleri için checksum vermiyor (sadece boyut) | NASA CMR UMM-G | ✅ |
| Fark serisinde sıçrama testi: yakalama %10,4 → %57,7, yanlış bayrak %9,6 → %0,3 | **Bu Mac'te simülasyon** (1.000 tekrar) | ✅ |
| Etkin örneklem düzeltmeli Sen GA %93 kapsama (klasik %79, bootstrap %77–84) | **Bu Mac'te simülasyon** (300 tekrar) | ✅ |
| ERA5 aylık: 1940'tan bugüne, 0,25°, ensemble yayılımı aylık olarak sunulmuyor | Copernicus CDS sayfası | ✅ |
| GHCN-M v4 qcf: 27.900 istasyon, TR 257, ≥40 yıllık 36 istasyon; Diyarbakır, Konya 46/46 | Dosya indirilip sayıldı | ✅ |

### ⚠️ Henüz doğrulanmadı (yarın ilk iş)
| Konu | Risk | Plan B |
|---|---|---|
| OPeNDAP `dap4.ce=/T2M;...` sözdizimi | Earthdata hesabı gerekiyor, test edilmedi | GES DISC Subsetter web arayüzü veya `earthaccess.open` + xarray |
| İndirme süresi (~2.244 istek) | Muhtemelen > 1 saat | 4–8 paralel indirme, yeniden başlatılabilir |
| DuckDB'nin gerçek sıkıştırılmış boyutu (tahmin 3–5 GB) | Disk sınırı | 1°'ye indirgeme, okyanus hücrelerini atma |
| NetCDF → DuckDB yükleme süresi | Bilinmiyor | Parquet'te kalıp DuckDB ile sadece sorgulamak |
| `boundaries.pmtiles` boyutu | Vercel'in 100 MB limiti | Daha agresif sadeleştirme, sınırları R2'ye taşımak |
| Vercel → R2 CORS | Tarayıcı istekleri engellenebilir | CORS politikasını düzeltmek |
| Grafik kütüphanesi seçimi | Karar verilmedi | Plotly.js (hazır) / Chart.js (hafif) |

---

## 7. Gereklilikler 📋

### 7.1 Hesaplar
| Hesap | Kim | Durum |
|---|---|---|
| Space Apps kaydı + takım (aynı Local Event) | İkimiz | ✅ |
| **NASA Earthdata** (https://urs.earthdata.nasa.gov/) | İkimiz | ⬜ **09:00'dan önce açılmalı, OPeNDAP testi buna bağlı** |
| **Copernicus CDS** (ERA5 için, ücretsiz, lisans onayı gerekli) | Enes | ⬜ (Gün 1 öğleden sonra yeterli) |
| **Cloudflare** (R2 aktif) | Enes | ✅ |
| Cloudflare bütçe uyarısı ($1) | Enes | ⬜ |
| **GitHub** reposu (**kişisel**, org değil) + collaborator | Kişi 1 + Kişi 2 | ⬜ (yarın) |
| **Vercel** (Hobby, repo sahibinin hesabıyla) | Enes | ✅ |
| Local Lead'e SI kuralı teyidi | Enes | ⬜ |

### 7.2 Yazılım
**Python (worker):**
```
earthaccess  xarray  h5netcdf  netCDF4  numpy  scipy  pandas  pyarrow
duckdb  boto3  pymannkendall  geopandas  shapely  python-dotenv
```
**Frontend:**
```
Node (mevcut: v25.6.1)  ·  Vite  ·  maplibre-gl@6  ·  pmtiles  ·  Plotly.js veya Chart.js
```
**Araçlar:** `git`, `vercel` CLI, (opsiyonel) `tippecanoe` / `pmtiles` CLI (sınırları PMTiles'a çevirmek için)

### 7.3 Donanım ve disk
- Apple M2, 8 çekirdek, 16 GB RAM ✅
- Diskte ~77 GB boş alan var, ama **proje için hedef ≤ 10 GB**

### 7.4 Gizli bilgiler (git'e **asla** girmez)
`.env` dosyasında tutulacak, `.gitignore`'a eklenecek:
```
EARTHDATA_USERNAME=...      # veya ~/.netrc
EARTHDATA_PASSWORD=...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=data-may-cry-tiles
```

---

## 8. Hackathon günü sırası (14–15 Kasım)

> ⚠️ **Sıra önemli.** Sözleşme adımları (🔒) atlanırsa ya da sırası değişirse Enes ile Rumet'in işleri birbirine uymaz. Her 🔒 adım bitmeden bir sonrakine geçilmez.

### Klasör yapısı (hedef)
```
Data_May_Cry/
├── contract/            🔒 tek doğruluk kaynağı
│   ├── types.ts         ← dosya formatlarının TypeScript tipleri
│   ├── schema/*.json    ← aynı yapının JSON Schema'sı (Python doğrulaması için)
│   └── CHANGELOG.md     ← her sözleşme değişikliği + sürüm
├── worker/              (Enes, Python)  indirme → DuckDB → test → paketleme
│   └── mock.py          ← sahte veri üreticisi (sözleşmeye göre)
├── web/                 (Rumet + Enes, TypeScript)
│   ├── src/data.ts      ← Enes: veri çekme + int16 çözme + MK (tek giriş noktası)
│   ├── src/...          ← Rumet: globe, paneller, grafik, kart
│   └── public/data/     ← sahte → gerçek dosyalar (yer değiştirir)
├── PLAN.md  README.md  METHODS.md  LICENSE
```

### Gün 1 (14 Kasım)
| # | Saat* | Kim | Adım | Bitti sayılması için |
|---|---|---|---|---|
| 1 | 09:00 | Enes | GitHub reposu (kişisel), `.gitignore` (`.env`, `*.duckdb`, `data/`), klasör iskeleti, Rumet'i collaborator yap | Rumet repoyu klonlayabiliyor |
| 2 | 09:30 | **İkisi** | 🔒 **Sözleşme v1.0:** `contract/types.ts` + JSON Schema + `data.ts` fonksiyon imzaları birlikte okunur | İkisi de onayladı, `CHANGELOG.md`'ye "1.0" yazıldı |
| 3 | 10:00 | Enes | 🔒 **Sahte veri v1.0:** `worker/mock.py` → `web/public/data/` (2–3 ülke, birkaç il, birkaç karo). `data.ts` sahte veriyi okuyacak şekilde hazır | Sahte dosyalar JSON Schema doğrulamasından geçiyor |
| 4 | 10:30 → | Rumet | Vite + MapLibre globe → sınırlar → seçim → grafik + sonuç kartı, **sadece `data.ts` üzerinden**, sahte veriyle | Sahte Diyarbakır'a tıklanınca kart çıkıyor |
| 5 | 10:30 | Enes | Earthdata girişi → **1 dosyada OPeNDAP testi** (kritik) | 1 aylık T2M diske indi, değerler 180–340 K aralığında |
| 6 | 11:30 | Enes | İndirme worker'ı (paralel, yeniden başlatılabilir) → **arka planda çalışmaya başlar** | 4 koleksiyon iniyor, ilerleme logu var |
| 7 | 12:30 | **İkisi** | 🔒 **Sözleşme dondurma:** bu saatten sonra sadece **ekleme** (1.x) yapılabilir | `CHANGELOG.md`'de "dondu" yazıyor |
| 8 | 13:00 → | Enes | R2 bucket, CORS, token · Copernicus CDS · GHCN istasyonları · MK eşitlik düzeltmesi + testler (L1, L2) | Kalibrasyon testi geçiyor |
| 9 | 18:00 | Enes | İlk Vercel deploy (sahte veriyle) | Gizli pencerede site açılıyor |
| 10 | Akşam | **İkisi** | Kontrol noktası: globe + sahte veri çalışıyor mu, indirme nerede? | — |

### Gün 2 (15 Kasım)
| # | Saat* | Kim | Adım | Bitti sayılması için |
|---|---|---|---|---|
| 11 | 09:00 | Enes | DuckDB → anomali → test (R4+) → bölge serileri → **gerçek dosyaları paketle** | Gerçek dosyalar **aynı JSON Schema doğrulamasından** geçiyor |
| 12 | 12:00 | Enes | 🔒 **Sahte → gerçek değişimi:** `public/data/` gerçek dosyalarla değiştirilir, karolar R2'ye yüklenir. **`data.ts` dışında kod değişmez** | Rumet'in koduna dokunmadan site gerçek veriyi gösteriyor |
| 13 | 12:30 | **İkisi** | Doğrulama: istasyon/ERA5/GISTEMP rozetleri, akıl sağlığı galerisi (L7), demo senaryoları seçilir | 3–4 demo senaryosu onaylandı |
| 14 | 13:00 → | Rumet | Değişken açıklamaları (EN + TR), demo butonları, şamata, hafif mod, renk körlüğü paleti | — |
| 15 | 13:00 → | Enes | Nokta modu (R2 karoları), Python ↔ JS parite testi, `METHODS.md`, `LICENSE`, References listesi | Parite testi geçiyor |
| 16 | **19:00** | **İkisi** | 🔒 **Özellik dondurma:** yeni özellik yok, sadece hata düzeltme | — |
| 17 | 19:00 → | Rumet | 30 sn demo videosu (İngilizce altyazı) + teslim sayfası metni | Video herkese açık linkte |
| 18 | 21:00 | **İkisi** | Son deploy, gizli pencerede test, SI açıklaması, References, **"Submit for Judging"** | **23:59'dan önce** teslim edildi ✅ |

\* Saatler hedeftir. Önemli olan **sıra**.

### Sözleşme değişirse (Gün 1 öğlenden sonra)
1. Sadece **ekleme** yapılabilir. Silme ya da yeniden adlandırma için ikisinin onayı gerekir (2.0).
2. Tek PR'da: `types.ts` + JSON Schema + `mock.py` + `data.ts` + `CHANGELOG.md`.
3. Sahte veri yeniden üretilir, doğrulama testi çalıştırılır.
4. Rumet'e haber verilir. TypeScript derleyicisi düzeltilecek yerleri gösterir.

---

## 9. İş bölümü: Enes & Rumet

**Mantık:** Riskli ve teknik açıdan zor işler (veri hattı, istatistik, binary formatlar, altyapı) Enes'te. Görünür, iyi dokümante edilmiş ve adım adım ilerlenebilen işler (arayüz, içerik, sunum) Rumet'te. **DB'ye tek yazan Enes.** Rumet'in DB'ye ihtiyacı yok, sadece sözleşmedeki dosyaları kullanır.

### 👑 Enes: veri, altyapı, zor JS parçaları
| # | Görev |
|---|---|
| 1 | Repo iskeleti, `.gitignore`, `.env`, **dosya formatı sözleşmesi** + sahte veri üretici (**Gün 1, ilk saat**) |
| 2 | Earthdata + OPeNDAP testi → indirme worker'ı (paralel, yeniden başlatılabilir) |
| 3 | DuckDB yükleme, anomali + Mann-Kendall + Sen (vektörel) |
| 4 | Hücre → il/ülke eşlemesi (Natural Earth, alan ağırlıklı) → bölge serileri |
| 5 | Paketleme (int16 `regions` / `trend_map` / `tiles`) → R2 (bucket, CORS, token) + Vercel kurulumu |
| 6 | **Frontend'in zor çekirdeği:** `data.js` modülü (dosya/karo çekme, int16 çözme), **JS'te Mann-Kendall + Sen** (dönem kaydırıcı için) |
| 7 | Rumet'in PR'larını gözden geçirmek, entegrasyon, son deploy |

### 🎨 Rumet: arayüz, içerik, sunum
| # | Görev |
|---|---|
| 1 | Vite + MapLibre globe kurulumu, döndürme/yakınlaştırma, Natural Earth sınırları |
| 2 | Ülkeye tıkla → `flyTo` → iller → ile tıkla; 🗺️ Bölge / 📍 Nokta toggle |
| 3 | Sağ panel: grafik (Plotly.js / Chart.js), trend çizgisi, **sonuç kartı**, dönem kaydırıcı arayüzü |
| 4 | Değişken seçici + **10 değişkenin basit Türkçe/İngilizce açıklamaları** |
| 5 | "Ne merak ediyorsun?" soru akışı, demo senaryo butonları |
| 6 | Şamata: animasyonlar, trend haritası renkleri, hafif mod, **demo cihazında test** |
| 7 | **Space Apps proje sayfası, demo videosu, sunum** |

Rumet, Enes'in `data.js` modülündeki fonksiyonları çağırır (ör. `getRegionSeries(country, admin1, var)`, `getPointSeries(lat, lon, var)`, `getTrendMap(var)`, `mannKendall(series)`). İçlerini bilmesine gerek yok. Gün 1'de bu fonksiyonlar **sahte veri** döndürür, Gün 2'de gerçeğe bağlanır.

### 📜 Sözleşme ve değişiklik yönetimi (migration yok)
- **Rumet'e DB verilmez, DB şeması da paylaşılmaz.** Paylaşılan tek şey **çıktı dosyalarının formatı** (`variables.json`, `trend_map`, `regions`, `tiles`) ve `data.ts`'teki fonksiyon imzaları.
- **DuckDB şeması Enes'e özel bir iç detaydır.** Değişirse migration yapılmaz: DB, Parquet'ten **sıfırdan yeniden üretilir** (worker idempotent). Rumet bundan etkilenmez.
- **Tek doğruluk kaynağı:** `contract/` klasöründe TypeScript tipleri (`types.ts`) + aynı yapının JSON Schema'sı. Sahte veri üreticisi de gerçek worker da **aynı şemaya göre doğrulanır** (L8 ile aynı kontrol).
- Her dosyada `schema_version` alanı bulunur. Frontend uyuşmayan sürümü reddeder.
- **Değişiklik kuralları:**
  1. **Ekleme serbest:** yeni alan eklemek eski kodu bozmaz. Versiyonun küçük kısmı artar (1.0 → 1.1).
  2. **Silme veya yeniden adlandırma yasak.** Kaçınılmazsa versiyonun büyük kısmı artar (1.x → 2.0) ve ikisi birlikte karar verir.
  3. Sözleşme değişikliği **tek PR'da** yapılır: tipler, şema, sahte veri üreticisi ve `data.ts` birlikte güncellenir. TypeScript derleyicisi Rumet'in kodunda düzeltilmesi gereken her yeri gösterir.
- **Sözleşme Gün 1 öğlen dondurulur.** O saatten sonra sadece ekleme yapılabilir.

### 🤝 Ortak kontrol noktaları
| Ne zaman | Ne |
|---|---|
| Gün 1 başlangıç (~30 dk) | Sözleşmeyi birlikte oku, `data.js` fonksiyon imzalarında anlaş |
| Gün 1 öğlen | Rumet: globe + sahte grafik çalışıyor mu? Enes: OPeNDAP testi geçti mi? |
| Gün 1 akşam | İndirme arka planda çalışıyor mu, ilk Vercel deploy yapıldı mı? |
| Gün 2 öğlen | **Gerçek veri bağlandı.** Demo senaryoları birlikte seçilir |
| Gün 2 son 3–4 saat | **Yeni özellik yok.** Hata düzeltme, video, sunum, teslim |

### Takılırsa
- Rumet bir konuda 30 dakikadan fazla takılırsa Enes'e sorar. Enes'in işi zaten arka planda (indirme, hesaplama) çalışıyor olacak.
- Zaman yetmezse **önce şamata** (animasyonlar, soru akışı) kısılır. Grafik, sonuç kartı ve bölge modu **asla** kısılmaz.

---

## 9.5 GitHub düzeni

**Repo:** Enes'in **kişisel** hesabında (Vercel Hobby org repolarını desteklemiyor), **public** (zaten açık kaynak şartı var ve branch koruma public repolarda ücretsiz). Hackathon başlayınca açılacak.

### Branch akışı
```
main  ← korumalı, her merge = Vercel production deploy
 ├── enes/worker-download     (feature branch'ler: isim/konu)
 ├── rumet/globe-panel
 └── enes/contract-v1.1       (sözleşme değişikliği her zaman ayrı branch)
```
- `main`'e **doğrudan push yok**, her şey PR ile girer. Her PR'a Vercel otomatik bir **önizleme linki** ekler, şamata canlıyı bozmadan orada test edilir.
- Birleştirme: **squash merge**, yani PR başına tek commit, temiz bir geçmiş.
- Küçük ve sık PR'lar (yarım günlük iş = 1 PR). Büyük PR çakışma demek.

### Kurallar
| Kural | Nasıl |
|---|---|
| `main` korumalı | Settings → Branches: PR zorunlu, CI geçmeli |
| `contract/` ikinizin de onayını ister | `.github/CODEOWNERS`: `contract/ @enes @rumet` (kullanıcı adları gerçek olanlarla değişecek) |
| Rumet'in PR'larını Enes inceler | Dört göz kuralı (L7). Enes'in PR'larına Rumet hızlıca bakar, en azından arayüze etkisini kontrol eder |
| Veri ve gizli bilgi asla repoya girmez | `.gitignore`: `.env`, `*.duckdb`, `*.parquet`, `data/raw/`. Sadece küçük sahte veri commit'lenir |

### CI: GitHub Actions (her PR'da otomatik)
| İş | Ne kontrol eder |
|---|---|
| `web` | `tsc --noEmit` (tipler), `vite build`, birim testleri (vitest) |
| `worker` | `pytest`: birim çevirileri, int16 gidiş-dönüş, karo indeksi, MK eşitlik düzeltmesi, **küçük kalibrasyon testi** |
| `contract` | Sahte veri JSON Schema'ya uyuyor mu? |
| `parity` | Aynı seriler için Python MK = JS MK (fark < 1e-6) |
CI'da gerçek NASA verisi kullanılmaz, sadece küçük test verisi. Veri indirme ve yükleme Enes'in Mac'inden yapılır.

### Takip
- **GitHub Projects** panosu: `Yapılacak → Yapılıyor → İncelemede → Bitti`. Kartlar §8'deki 18 adımdan oluşturulur.
- **Etiketler:** `worker`, `web`, `contract`, `bug`, `demo`, `docs`.
- **PR şablonu** (`.github/pull_request_template.md`):
  - [ ] Sözleşme değişti mi? Değiştiyse `CHANGELOG.md` + şema + mock güncellendi mi?
  - [ ] Testler geçiyor mu?
  - [ ] SI (yapay zekâ) kullanıldı mı? Kullanıldıysa nerede?

### SI şeffaflığı
- Yapay zekâ yardımıyla yazılan commit'lere `Co-Authored-By: Claude ...` satırı eklenir. Space Apps'in "kodda SI kullanımı metadata'da belirtilmeli" kuralını doğal olarak karşılar.
- README'de "SI kullanımı" bölümü (§10.1).

### Teslimde
- Teslimden hemen önce **`v1.0-submission` etiketi (tag)** atılır. Jüri, teslim anındaki kodu bu etiketle görür. Sonradan yapılan değişiklikler teslimi bozmaz.
- Repoda bulunması gerekenler: `README.md` (ne, nasıl çalıştırılır, canlı link, demo videosu), `METHODS.md`, `LICENSE` (Apache-2.0), References / üçüncü taraf lisans listesi.

## 10. Kurallar, jüri ve gözden kaçanlar (2026-11-13'te kontrol edildi)

### 10.1 Yapay zekâ ("SI", Super Intelligence) kuralı ⚠️ ÖNEMLİ
Project Submission Guide'a göre:
- SI araçları (chatbot, LLM, görsel üretimi...) **serbest**, ama yeniliği ve yaratıcılığı hızlandırmak için bir araç olarak kullanılmalı.
- **"SI should not be used to come up with your idea of how to solve the challenge."** Yani çözüm fikri takımdan gelmeli.
- SI kullanımı **açıkça belirtilmeli**:
  - Görsel ve video: **görünür filigran** (watermark) şart.
  - Kod ve veri: açıklama metninde ve metadata'da belirtilmeli.
  - Ses: açıklama metninde ve metadata'da belirtilmeli.
- SI ile üretilen içerikte **NASA logosu, bayrağı veya görev amblemleri kullanılamaz.**
- Teslim formunda "SI kullandınız mı, nasıl?" sorusu var. Bu sadece istatistik için, jüri görmüyor. Ama projedeki SI işaretlerini jüri görüyor.

**Bizim için anlamı:**
- **Fikir takımın:** 3D dünyada bölge/nokta seçerek "veri dedektifliği", iki mod, kolon bazlı hafif DB ve worker fikri Enes'ten geldi.
- **Claude'un rolü:** araştırma, kaynak/limit doğrulama, benchmark ve simülasyonlar, yöntem seçeneklerinin karşılaştırılması, kod yardımı. Bu teslim formunda ve README'de **dürüstçe** yazılacak.
- Yazılan koda dosya başında ya da README'de "SI ile birlikte yazıldı" notu eklenecek. SI ile üretilen görsel olursa filigran konacak.
- Emin olunmayan bir durum varsa **Local Lead'e sorulacak.**

### 10.2 Teslim şartları
| Şart | Detay |
|---|---|
| Takım | Herkes **aynı Local Event'e** kayıtlı olmalı ve takım sayfasında görünmeli (en fazla 6 kişi) |
| Teslim penceresi | **14 Kasım 09:00 → 15 Kasım 23:59** (Local Event'in saat dilimiyle) |
| Demo | **≤ 30 saniyelik video** VEYA **≤ 7 slayt** (başlık dahil). YouTube, Drive veya GitHub'da, **giriş gerektirmeyen** bir linkle |
| Dil | Teslim sayfası ve bütün linkler **İngilizce**. Video Türkçe olabilir ama **İngilizce altyazı şart** |
| Final proje linki | Herkese açık olmalı (Vercel sitesi + GitHub reposu). Gizli pencerede test edilmeli |
| Kaynaklar | **Her** dış kaynak (kod, veri, görsel, açık kaynak dahil) References alanında listelenmeli. Aksi halde ödül geri alınabilir |
| Lisans | Kendi kodumuz OSI uyumlu açık lisansla yayımlanmalı (belirtilmezse Apache 2.0). Repoya `LICENSE` + üçüncü taraf lisans listesi konulacak |
| Diğer | 18 yaş altı kişilerin görüntü veya sesi olmayacak. Telif hakkı olan müzik/görsel kullanılmayacak |

### 10.3 Jüri kriterleri (her biri 1–5 puan) → bizim cevabımız
| Kriter | Ne arıyorlar | Bizim güçlü noktamız |
|---|---|---|
| **Impact** | Ne kadar önemli bir problem, ne kadar kişiye ulaşıyor | Öğrencilerin herhangi bir yerin iklim trendini kendileri araştırabilmesi |
| **Creativity** | Özgünlük | 3D dünyada iki modlu dedektiflik + 3 kaynaktan çapraz doğrulama rozetleri |
| **Validity** | Bilimsel temel, çalışırlık, **kullanılabilirlik** | §3.5–3.7: ölçülmüş yanlış alarm oranları, istasyon kontrolü, çalışan canlı site |
| **Relevance** | Challenge'a tam uyum, **NASA verisinin projenin çekirdeği olması** | Ana veri ve bütün sonuçlar NASA MERRA-2. Doğrulama için **NASA GISTEMP** de öne çıkarılmalı (ERA5 ve NOAA yardımcı) |
| **Presentation** | Hikâye anlatımı, netlik | 30 sn video: "Diyarbakır ısınıyor mu?" → tıkla → cevap + 3 rozet |

### 10.4 Teknik açıdan gözden kaçanlar 🐛
| # | Sorun | Çözüm |
|---|---|---|
| 1 | **2026 yarım yıl:** veri Eylül 2026'da bitiyor, yıllık ortalamaya 9 aylık bir yıl girerse yanlı sonuç verir | Testlerde **sadece tam yıllar: 1980–2025 (46 yıl)**. Grafikte 2026 ayları gösterilir ama teste girmez |
| 2 | **Eşit değerler (ties):** çölde kar = 0, kurak bölgede yağış ≈ 0. Vektörel MK'mız eşitlik düzeltmesi yapmıyor | MK varyansına eşitlik düzeltmesi eklenecek (pymannkendall ile karşılaştırılacak). Tamamen sabit serilerde test yapılmayacak ("veri sabit") |
| 3 | **Karo kenarı:** 361 enlem satırı 20'ye tam bölünmüyor (18 × 20 = 360), kuzey kutbu satırı dışarıda kalıyor | Son karo satırı 21 satır olacak veya kutup satırı ayrı ele alınacak. Testi yazılacak |
| 4 | **Trend haritası çizimi:** 200 bin hücreyi ayrı poligon olarak çizmek globe'u kasar | Harita **raster görüntü** (PNG/WebP) olarak MapLibre'ye `image`/`raster` kaynağı şeklinde verilecek |
| 5 | **Renk körlüğü:** kırmızı-yeşil kullanılmamalı | Renk körlüğü dostu mavi-kırmızı ıraksak bir palet + "anlamlı" bölgeler için desen |
| 6 | **WebGL yoksa** ya da zayıf cihazda globe çalışmazsa | Hata mesajı + düz harita / liste ile yedek mod |
| 7 | **Mekânda internet olmazsa** | Demo videosu önceden çekilir, site lokalde de çalışabilmeli (`vite preview`) |
| 8 | **Gizli anahtarlar** | R2 yazma anahtarı **asla** frontend'e girmez. `.env` dosyası `.gitignore`'da |
| 9 | **Globe dokusu** | NASA Blue Marble kullanılabilir (NASA görselleri genelde telifsiz). **NASA logosu kullanılmaz** |
| 10 | **Kıyı hücreleri:** kara ve deniz karışık hücreler il ortalamasına girerken | Alan ağırlığı il sınırıyla kesişime göre hesaplanır (§3.5 Adım 6) |

## 11. Açık sorular

- [x] Grafik kütüphanesi → **Plotly.js**
- [x] Frontend → **React + TypeScript** (Rumet React biliyor)
- [ ] Takımda JS/3D bilen var mı? (şamatanın dozu buna bağlı)
- [ ] Domain alınacak mı? (şimdilik hayır)
- [ ] Opsiyonel veri setleri (IMERG, MODIS) eklenecek mi?
