# Aeolus · Anlatım rehberi

İki sunum var, ikisi de aynı hikâyeyi aynı sırayla anlatıyor:

| | Mentörlere / jüriye canlı | NASA'ya yüklenecek |
|---|---|---|
| Dosya | `index.html` (localhost:5180) · yedek `pdf/aeolus-sunum.pdf` | `pdf/aeolus-nasa.pdf` |
| Dil | Türkçe | İngilizce |
| Uzunluk | 8 slayt, 3 dakika | 7 sayfa, konuşmacı yok |
| Fark | Sen anlatırsın, 4. slaytta uygulamayı canlı açarsın | Her görselin altında ne gösterdiği yazıyor, her sayfada site linki ve sayfa numarası var |

Not: NASA sürümü (`nasa.html`) henüz bu 12 slaytlık yeni sıraya göre güncellenmedi.

**Ana mesaj (tek cümle):** "Aeolus, NASA'nın 46 yıllık iklim verisini herkesin anlayacağı bir cevaba çevirir:
ne değişti, ne kadar değişti ve ne kadar eminiz."

Sunarken `S` tuşu konuşmacı ekranını açar (notlar + sonraki slayt + süre).

---

## Konuşma metni (3 dk)

8 slayt, toplam ~165 sn. Kartlar kendiliğinden gelir; tuşa sadece slayt değiştirirken basılır.

### 1 · Açılış (15 sn)
> Merhaba, biz Data May Cry ekibiyiz; projemizin adı **Aeolus**. Arkadaki her şerit bir yıl: 1980'den bugüne dünyanın sıcaklığı,
> NASA verisinden. Maviler serin, kırmızılar sıcak. Aeolus, yaşadığınız yerin ikliminin 46 yılda nasıl değiştiğini bir tıkla söylüyor.

### 2 · Herkesin bir sorusu var (20 sn)
> "Dünya ısınıyor" cümlesini hepimiz biliyoruz. Ama insanların asıl merak ettiği **kendi şehri**: Diyarbakır yazları daha mı sıcak,
> Konya'da toprak kuruyor mu? Cevap NASA'nın verisinde var, ama 2.244 dosya ve istatistik bilgisi istiyor. **Biz bu engeli kaldırdık.**

### 3 · Zaman yolculuğu (15 sn) — kendiliğinden bir kez oynar, 2025'te durur
> Bu, uygulamamızdaki zaman yolculuğu: 1980'den 2025'e her yıl, 10 saniyede. Mavi yıllar normalden serin, son yıllar kırmızı.
> **46 yılda dünya yaklaşık 0,7 °C ısındı.**

### 4 · Canlı gösterim (40 sn)
Uygulama slaytın içinde açık (Diyarbakır, hava sıcaklığı):
1. **Kartı oku:** "Diyarbakır 10 yılda 0,42 °C ısınıyor ve bu net bir değişim."
2. **"Yaz" sekmesi:** "Yazlar daha hızlı ısınıyor: 0,53."
3. **"Kış" sekmesi:** "Kışta belirgin bir değişim yok. **Emin değilsek bunu söylüyoruz.**"
4. **Grafik, parmak izi, sıralama:** paneldeki satırları ve üstteki Sıralama düğmesini aç.
5. Vakit varsa aramaya `Erzurum` yaz, kar değişkenine geç.

İnternet yoksa slayt ekran görüntüsünü gösterir; aynı cümleleri görüntü üzerinden söyle.

### 5 · Kim, ne için (20 sn)
> **Tarım:** Konya'da yazlar 46 yılda 2,4 °C ısındı; bu ürün ve sulama planını değiştirir.
> **Enerji:** Türkiye'de rüzgâr 46 yılda 0,19 m/s zayıfladı; rüzgâr santrali ve baraj yatırımı için önemli.
> Ayrıca bölgesel planlama, bilimsel çalışmalar ve toplum.

### 6 · Sonuçlar (20 sn)
> Sonuçlarımızı bağımsız kaynaklarla kontrol ettik. NOAA istasyonlarıyla **%94** aynı sonuç, NASA'nın küresel sıcaklık serisiyle
> 0,968 uyum. Trend olmayan veride yanlış alarm %5,5'in altında ve altı fizik testinin altısını geçtik.

### 7 · Avantajlar, dezavantajlar (25 sn)
> Avantajlarımız: yanlış alarm vermiyor, kendini kontrol ediyor, anında ve ücretsiz.
> Dezavantajlarımız: en fazla 55 km'lik bir karo kadar ayrıntı görüyoruz, sonuç yılda bir değişiyor ve sadece geçmişi söylüyoruz, tahmin yapmıyoruz.

### 8 · Kapanış (10 sn)
> QR kodu okutup kendi şehrinize bakabilirsiniz: **aeolusclimate.vercel.app**. Teşekkürler.

---

## Olası sorular ve kısa cevaplar

- **Veri nereden?** NASA MERRA-2 (v5.12.4): 1980'den bugüne aylık, ~55 km'lik kareler, 9 değişken.
- **Neden 1991–2020 normali?** Dünya Meteoroloji Örgütü'nün güncel standart referans dönemi.
- **"Net değişim" ne demek?** p < 0,01, %95 aralık sıfırı içermiyor ve üç ayrı kontrol aynı yönü gösteriyor. Bağımsız bir kaynak (istasyon, uydu) aynı fikirde değilse "net" verilmiyor.
- **Birçok yeri aynı anda test edince yanlış alarm çıkmaz mı?** Haritada çoklu test düzeltmesi (FDR) var; trend olmayan yapay veride yanlış alarm oranı %5,5'in altında.
- **Hesap neden tarayıcıda?** Dönem değiştirince cevap anında geliyor ve binlerce kişi aynı anda kullanabiliyor. API için aynı kod Vercel sunucusunda çalışıyor.
- **Yerel ölçekte ne kadar doğru?** 55 km'lik ızgara; tek bir köyü değil bölgeyi temsil eder. Bunu sitede açıkça yazıyoruz.
- **Başka uygulamalar kullanabilir mi?** Evet, açık API: `/api/v1/trend?place=TR-21&var=T2M` (sitede ⓘ → API).

---

## PDF'leri yeniden üretmek

Uygulama `localhost:5174`'te (gerçek veriyle), sunum `localhost:5180`'de açıkken `presentation` klasöründe:

```bash
npm run shots
```

```bash
npm run pdf
```

`shots` uygulamanın güncel ekran görüntülerini alır (dünya, Diyarbakır kartı, zaman yolculuğu 1992 ve 2024),
`pdf` iki PDF'i üretir. Uygulamada bir şey değişirse ikisini sırayla çalıştırmak yeter.
