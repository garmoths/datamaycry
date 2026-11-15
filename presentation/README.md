# Aeolus · Sunum

*Data May Cry ekibi*

reveal.js ile kodla yazılmış sunum. İnternetsiz de çalışır (yazı tipleri ve kütüphaneler yerel).

```bash
cd presentation
npm install
npm run dev        # http://localhost:5180
```

| Tuş | Ne yapar |
|---|---|
| → / Boşluk | sonraki adım |
| ← | önceki adım |
| **S** | konuşmacı görünümü (notlar + süre) |
| F | tam ekran |
| O veya Esc | tüm slaytlar |

- Slayt 4'te uygulama canlı gömülü (`aeolusclimate.vercel.app`). İnternet yoksa yerel kopyayı göster:
  `http://localhost:5180/?app=http://localhost:5174` (uygulama `web/` içinde `npm run dev` ile açık olmalı).
- Akış (13 slayt): sorular → sorun → üç adım → **canlı gösterim (slayt 5)** → bir cevap → dürüstlük →
  günlük hayatta kim kullanır → özellikler → 46 yıllık şerit → güven → tek teknik slayt → QR kod.
- Konuşmacı notlarında (S) canlı gösterim için önerilen akış var: Erzurum + kar, dönemi doğum yılına çek,
  Zaman yolculuğu, "Toplam" düğmesi.
- Efektler (Aceternity / Amicro tarzında, düz CSS/JS): aurora arka plan, kelime kelime gelen başlıklar,
  kayan soru kartları, bento ızgara, 3B eğilen kart, imleci izleyen ışık, QR etrafında dönen çerçeve.
- Animasyonsuz görünüm: `?static` (provada ekran görüntüsü için). PDF'te ve "hareketi azalt" ayarında da kapalı.
- Sayılar `src/data.js` ve `docs/EVIDENCE.md` içinden; elle uydurulmuş sayı yok.
- PDF almak için: `http://localhost:5180/?print-pdf` → tarayıcıda Yazdır → PDF olarak kaydet.

## İki sürüm ve PDF

| Dosya | Ne | Sayfa |
|---|---|---|
| `index.html` | Türkçe canlı sunum (canlı gösterim slaytı dahil) | 11 |
| `nasa.html` | NASA'ya yüklenecek İngilizce sürüm: konuşmayla aynı sıra, her görselin altında açıklama, her sayfada link ve sayfa no | 7 |
| `pdf/aeolus-nasa.pdf` | NASA'ya yüklenecek PDF | 7 |
| `ANLATIM.md` | Konuşma metni (slayt slayt, ~6 dk), canlı gösterim akışı ve olası sorular | – |
| `pdf/aeolus-sunum.pdf` | Türkçe sunumun PDF'i (yedek; canlı gösterim yerine ekran görüntüsü) | 11 |

PDF'leri yeniden üretmek için (Chrome/Brave/Edge yüklü olmalı):

```bash
npm run dev          # bir terminalde, http://localhost:5180
npm run shots        # uygulama ekran görüntüleri (uygulama http://localhost:5174'te açık olmalı)
npm run pdf          # pdf/aeolus-sunum.pdf ve pdf/aeolus-nasa.pdf
```
