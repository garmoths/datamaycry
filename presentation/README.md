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

- Slayt 4'te uygulama canlı gömülü (`datamaycry.vercel.app`). İnternet yoksa yerel kopyayı göster:
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
