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

- Akış (3 dk, 8 slayt): açılış → sorular → zaman yolculuğu (46 yıl, 10 sn, bir kez) → **canlı gösterim (slayt 4)** →
  kim ne için kullanır → sonuçlar → avantajlar ve dezavantajlar → QR kod.
- Kartlar kendiliğinden sırayla gelir (`.rise`); tuşla açılan adım yok.
- Zaman yolculuğu slaytının arkasındaki bulanık ekranlar `public/shots/z-*.jpg`, canlı siteden Diyarbakır için alındı.
- 3. slayttaki zaman yolculuğu kareleri `public/shots/tt/1980…2025.jpg` (+ `meta.json`), uygulamanın Zaman yolculuğundan yıl yıl alındı.
- Efektler (Aceternity / Amicro tarzında, düz CSS/JS): aurora arka plan, kelime kelime gelen başlıklar,
  kayan soru kartları, bento ızgara, 3B eğilen kart, imleci izleyen ışık, QR etrafında dönen çerçeve.
- Animasyonsuz görünüm: `?static` (provada ekran görüntüsü için). PDF'te ve "hareketi azalt" ayarında da kapalı.
- Slayt 4'te uygulama canlı gömülü (`aeolusclimate.vercel.app`). İnternet yoksa yerel kopya: `http://localhost:5180/?app=http://localhost:5174`.
- Sayılar `src/data.js` ve `docs/EVIDENCE.md` içinden; elle uydurulmuş sayı yok.
- PDF almak için: `http://localhost:5180/?print-pdf` → tarayıcıda Yazdır → PDF olarak kaydet.

## İki sürüm ve PDF

| Dosya | Ne | Sayfa |
|---|---|---|
| `index.html` | Türkçe canlı sunum (canlı gösterim slaytı dahil) | 8 |
| `nasa.html` | NASA'ya yüklenecek İngilizce sürüm: konuşmayla aynı sıra, her görselin altında açıklama, her sayfada link ve sayfa no | 7 |
| `pdf/aeolus-nasa.pdf` | NASA'ya yüklenecek PDF | 7 |
| `ANLATIM.md` | Konuşma metni (slayt slayt, 3 dk) ve olası sorular | – |
| `pdf/aeolus-sunum.pdf` | Türkçe sunumun PDF'i (yedek; canlı gösterim yerine ekran görüntüsü) | 11 |

PDF'leri yeniden üretmek için (Chrome/Brave/Edge yüklü olmalı):

```bash
npm run dev          # bir terminalde, http://localhost:5180
npm run shots        # uygulama ekran görüntüleri (uygulama http://localhost:5174'te açık olmalı)
npm run pdf          # pdf/aeolus-sunum.pdf ve pdf/aeolus-nasa.pdf
```
