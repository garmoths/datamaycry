# Data May Cry · Sunum

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
- Akış: önce ne işe yaradığı (slayt 1–10), sonra teknik bölüm (11–17), en sonda QR kod.
- Sayılar `src/data.js` ve `docs/EVIDENCE.md` içinden; elle uydurulmuş sayı yok.
- PDF almak için: `http://localhost:5180/?print-pdf` → tarayıcıda Yazdır → PDF olarak kaydet.
