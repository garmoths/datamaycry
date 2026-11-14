# Gereklilikler

Data May Cry'ı geliştirmek ve çalıştırmak için gereken her şey: hesaplar, araçlar, paketler, gizli bilgiler ve limitler.
Sürümler 2026-11-14'te kurulup doğrulandı. Kesin sürümler kilit dosyalarında: `web/package-lock.json` ve `worker/uv.lock`.

| Parça | Kim | Dil | Nerede çalışır |
|---|---|---|---|
| **Backend (worker)** | Enes | Python | Enes'in Mac'i (M2). Canlıda sunucu yok |
| **Frontend (web)** | Rumet + Enes | TypeScript | Tarayıcı, Vercel'de statik site |
| **Sözleşme (contract)** | İkisi | TS + JSON Schema | İki tarafın ortak dosya formatı |

---

## 1. Hesaplar

| Hesap | Kim | Ne için | Durum |
|---|---|---|---|
| GitHub (`garmoths/datamaycry`, public) | İkisi | Kod, PR, CI | ✅ Rumet'in daveti bekliyor |
| NASA Earthdata (https://urs.earthdata.nasa.gov) | İkisi | MERRA-2 indirme | ✅ Enes (GES DISC onaylı) · ⬜ Rumet |
| Earthdata → **NASA GESDISC DATA ARCHIVE** uygulama onayı | Enes | Onay olmadan indirme 403 verir | ✅ |
| Cloudflare R2 | Enes | Nokta modu karoları (~2,3 GB) | ✅ |
| Cloudflare bütçe uyarısı ($1) | Enes | Sürpriz fatura olmasın | ⬜ |
| Vercel (Hobby, repo sahibinin hesabı) | Enes | Frontend hosting | ✅ |
| Copernicus CDS | Enes | ERA5 doğrulama verisi (CC-BY) | ⬜ |
| Space Apps takım kaydı (aynı Local Event) | İkisi | Teslim | ✅ |

---

## 2. Backend (worker) — Python

### 2.1 Araçlar

| Araç | Sürüm | Not |
|---|---|---|
| Python | **≥ 3.12** (geliştirmede 3.13) | `uv` doğru sürümü kendisi kurar |
| [uv](https://docs.astral.sh/uv/) | ≥ 0.12 | Paket ve sanal ortam yöneticisi |
| git | ≥ 2.40 | |

### 2.2 Kurulum

```bash
cd worker
uv sync                 # .venv oluşturur, uv.lock'taki sürümleri kurar
uv run mock.py          # sahte veriyi üretir ve sözleşmeye göre doğrular
uv run validate.py ../web/public/data
```

`uv` kullanmayanlar için aynı sürümler `requirements.txt` dosyasında:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

### 2.3 Paketler

| Paket | Sürüm | Ne için |
|---|---|---|
| `earthaccess` | 0.19.0 | Earthdata girişi, MERRA-2 granül arama, kimlikli HTTP oturumu |
| `xarray` | 2026.9.0 | NetCDF dosyalarını okuma |
| `h5netcdf`, `netCDF4` | 1.8.3, 1.7.5 | xarray'in NetCDF4/HDF5 okuyucuları |
| `numpy` | 2.5.4 | Vektörel hesaplama (MK + Sen) |
| `scipy` | 1.18.1 | Normal dağılım, istatistik yardımcıları |
| `pandas` | 3.1.1 | Tablo işlemleri |
| `pyarrow` | 26.0.1 | Ara Parquet dosyaları |
| `duckdb` | 2.0.0 | Lokal kolon bazlı veritabanı |
| `pymannkendall` | 1.4.3 | Referans MK testi (parite testi, pre-whitening) |
| `geopandas`, `shapely` | 1.2.0, 2.2.0 | Hücre → il/ülke eşlemesi, alan ağırlıkları |
| `boto3` | 1.43.117 | R2'ye yükleme (S3 API) |
| `python-dotenv` | 1.2.4 | `.env` dosyasını okuma |
| `jsonschema` | 4.26.0 | Üretilen dosyaları sözleşmeye göre doğrulama |
| `pytest` (dev) | ≥ 8 | Birim testleri |

### 2.4 Opsiyonel araçlar

| Araç | Ne için |
|---|---|
| `tippecanoe` + `pmtiles` CLI | Natural Earth sınırlarını `boundaries.pmtiles` dosyasına çevirmek |
| `vercel` CLI | Elle deploy, ortam değişkenleri |
| `caffeinate` (macOS'ta hazır) | Uzun işlerde Mac uykuya geçmesin: `caffeinate -i uv run worker.py` |

### 2.5 Donanım ve disk

- Apple M2, 8 çekirdek, 16 GB RAM (MK + Sen tüm dünya için ~20 dk ölçüldü).
- **Proje için disk hedefi ≤ 10 GB.** DuckDB tahmini 3–5 GB, ERA5 ~0,3 GB, geçici dosyalar indirme sonrası silinir.

---

## 3. Frontend (web) — TypeScript

### 3.1 Araçlar

| Araç | Sürüm | Not |
|---|---|---|
| Node.js | **20.19+ veya 22.12+** (geliştirmede 25.6.1) | Vite 8'in şartı |
| npm | ≥ 10 | Node ile gelir |

### 3.2 Kurulum

```bash
cd web
npm install
npm run dev          # http://localhost:5173
npm test             # vitest: data.ts + Python↔JS parite testleri
npm run typecheck    # tsc
npm run build        # dist/ (Vercel bunu yayınlar)
npm run preview      # internet yoksa demo için lokal sunucu
```

### 3.3 Paketler

| Paket | Sürüm | Ne için |
|---|---|---|
| `react`, `react-dom` | 19.3 | Arayüz |
| `maplibre-gl` | 6.18 | 3D globe, ülke/il sınırları, seçim, `flyTo` |
| `pmtiles` | 4.5 | Sıkıştırılmış sınır dosyasını MapLibre'ye vermek |
| `plotly.js-dist-min` | 4.3 | Zaman serisi grafiği, trend çizgisi |
| `vite` (dev) | 8.3 | Geliştirme sunucusu ve build |
| `typescript` (dev) | 7.0 | Tip kontrolü (sözleşme tipleri) |
| `vitest` (dev) | 3.2 | Birim ve parite testleri |
| `@vitejs/plugin-react` (dev) | 6.1 | React desteği |
| `oxlint` (dev) | 1.90 | Lint |
| `@types/plotly.js-dist-min` (dev) | 2.3 | Plotly tipleri (sürümü kütüphaneden eski, bazı tipler eksik olabilir) |

### 3.4 Tarayıcı

- **WebGL 2** desteği şart (globe için). Yoksa hata mesajı ve düz harita/liste yedeği gösterilir.
- Hedef: güncel Chrome, Safari, Firefox, Edge. Demo cihazında önceden test edilecek.

---

## 4. Gizli bilgiler (git'e asla girmez)

| Ne | Nerede | Kim |
|---|---|---|
| Earthdata kullanıcı adı + şifre | `~/.netrc` (izin `600`) | Enes ✅ |
| R2 erişim anahtarları | `worker/.env` | Enes |
| Copernicus CDS anahtarı | `~/.cdsapirc` | Enes |

`worker/.env` şablonu:

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=data-may-cry-tiles
```

Frontend'e sadece **okuma** adresi girer: `VITE_TILES_URL` (R2'nin public `r2.dev` adresi, Vercel ortam değişkeni). R2 yazma anahtarı asla frontend'e girmez.

---

## 5. Hosting limitleri

| Servis | Limit | Bizim kullanım |
|---|---|---|
| Vercel Hobby | Deploy başına 100 MB ve 15.000 dosya, aylık 100 GB trafik | `variables.json`, trend haritaları (~17 MB), bölge serileri (~54 MB), sınırlar |
| Cloudflare R2 (ücretsiz) | 10 GB depolama, 1 M yazma, 10 M okuma, trafik ücretsiz | Karolar: 6.480 dosya, ~2,3 GB |
| `r2.dev` adresi | Hız sınırlı, geliştirme amaçlı | Demo için kabul edildi |

---

## 6. Veri kaynakları ve lisanslar

| Kaynak | Ne için | Lisans |
|---|---|---|
| NASA MERRA-2 v5.12.4 (M2TMNXSLV, M2TMNXFLX, M2TMNXLND, M2TMNXAER) | Ana veri, 1980–güncel | NASA açık veri |
| NASA GISTEMP | Küresel sıcaklık doğrulaması | NASA açık veri |
| NOAA GHCN-M v4 | İstasyon doğrulaması | Kamuya açık |
| Copernicus ERA5 | İkinci reanaliz (doğrulama) | CC-BY |
| Natural Earth | Ülke ve il sınırları | Public domain |

Teslimde hepsi References bölümünde listelenecek. Kendi kodumuz Apache-2.0 lisanslı olacak.
