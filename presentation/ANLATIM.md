# Aeolus · Anlatım rehberi

İki sunum var, ikisi de aynı hikâyeyi aynı sırayla anlatıyor:

| | Mentörlere / jüriye canlı | NASA'ya yüklenecek |
|---|---|---|
| Dosya | `index.html` (localhost:5180) · yedek `pdf/aeolus-sunum.pdf` | `pdf/aeolus-nasa.pdf` |
| Dil | Türkçe | İngilizce |
| Uzunluk | 11 slayt, ~6 dakika + canlı gösterim | 7 sayfa, konuşmacı yok |
| Fark | Sen anlatırsın, 4. slaytta uygulamayı canlı açarsın | Her görselin altında ne gösterdiği yazıyor, her sayfada site linki ve sayfa numarası var |

Slayt → sayfa eşleşmesi: 1 → 1 · 2 → 2 · 3+4 → 3 · 5+6 → 4 · 7 → 5 · 8 → 6 · 9+10+11 → 7.
Jüri PDF'i okurken senin anlattığın sırayı görür; canlı gösterimin yerini ekran görüntüleri tutar.

**Ana mesaj (tek cümle):** "Aeolus, NASA'nın 46 yıllık iklim verisini herkesin anlayacağı bir cevaba çevirir:
ne değişti, ne kadar değişti ve ne kadar eminiz."

Sunarken `S` tuşu konuşmacı ekranını açar (notlar + sonraki slayt + süre).

---

## Konuşma metni (~6 dk)

Süreler yaklaşık. Kalın yerler vurgulanacak cümleler.

### 1 · Açılış (30 sn)
> Merhaba, biz Data May Cry ekibiyiz; projemizin adı **Aeolus**. Yunan mitolojisinde Aeolus rüzgârların bekçisidir:
> havayı tutar, salar ve nereye estiğini bilir. Bizim Aeolus da 46 yılın havasını izleyip iklimin ne yöne değiştiğini söylüyor.
> Arkadaki her şerit bir yıl: 1980'den 2025'e dünyanın sıcaklığı. Maviler serin, kırmızılar sıcak; sağa doğru nasıl kızardığını görüyorsunuz.

### 2 · Herkesin bir sorusu var (40 sn)
> "Dünya ısınıyor" cümlesini hepimiz biliyoruz. Ama insanların asıl merak ettiği **kendi şehri, kendi köyü**:
> Erzurum'da kar azaldı mı, Konya'da toprak kuruyor mu, Diyarbakır yazları daha mı sıcak?
> Bu soruların cevabı NASA'nın verisinde var. Ama okumak için binlerce dosya, garip birimler ve istatistik bilgisi gerekiyor.
> **Biz bu engeli kaldırmak istedik.**

### 3 · Üç adımda cevap (20 sn)
> Kullanmak için hiçbir şey bilmek gerekmiyor. Yerini seç, merak ettiğini seç, cevabı oku. Gösterelim.

### 4 · Canlı gösterim (2 dk) — en önemli kısım
Uygulama slaytın içinde açık (Diyarbakır, hava sıcaklığı). Önerilen akış:

1. **Kartı oku:** "Isınıyor, 10 yılda +0,42 °C. Toplam düğmesine basıyorum: 46 yılda +1,9 °C."
2. **Yer değiştir:** aramaya `Erzurum` yaz → solda **kar** değişkenine geç. "Kar gerçekten azalmış mı? Kart söylüyor."
3. **Dönem seç:** soldaki şeritte başlangıcı doğum yılına çek. "Ben doğduğumdan beri ne değişti? Trend anında yeniden hesaplandı."
4. **Zaman yolculuğu:** sağ üstte ▶. "Dünya yıl yıl: 1992'de Pinatubo yanardağından sonra mavi, 2024'te neredeyse her yer kırmızı."
5. (Vakit varsa) **İklim parmak izi:** "Dokuz değişken tek tabloda: hava hem ısınıyor hem daha çok nem taşıyor."

İnternet yoksa: slayt otomatik olarak ekran görüntüsünü gösterir; aynı akışı görüntü üzerinden anlat.

### 5 · Bir cevap nasıl görünür (30 sn)
> Her kart üç soruya cevap veriyor: **Ne oluyor?** Tek kelime: "Isınıyor". **Ne kadar?** 10 yılda ya da toplamda, tek düğmeyle.
> **Ne kadar eminiz?** p-değeri yerine "şans eseri olma ihtimali binde birden az" gibi günlük dil. Lise öğrencisi de anlasın istedik.

### 6 · Dürüstlük (30 sn)
> En çok önem verdiğimiz şey: **emin değilsek söylüyoruz.** Aynı Diyarbakır: 1980–2011 arasına bakınca "belirgin değişim yok",
> yön bile söylemiyoruz. Dönem uzadıkça kanıt güçleniyor: önce "muhtemel", 2025'e gelince "net değişim".
> Uydurma bir trend göstermektense "henüz bilmiyoruz" demeyi seçtik.

### 7 · Kim, ne için kullanır (30 sn)
> Hedefimiz uzmanlar değil, herkes. Çiftçi toprak nemine ve yağışa bakıp sulamasını planlar; öğretmen derste kendi ilinin
> gerçek verisini gösterir; belediye hangi ilçenin en hızlı ısındığını görür; gazeteci kaynağı belli bir cevap alır.
> Ve hepimiz şunu sorabiliriz: **doğduğum yıldan bu yana şehrimde ne değişti?**

### 8 · Neler yapabilirsin (20 sn)
> Canlıda birkaçını gördük: zaman yolculuğu, dönem seçimi, toplam düğmesi. Bunlara ek olarak iller arası sıralama,
> iklim parmak izi ve tek tıkla PDF rapor var. Başka uygulamalar için de açık bir API sunuyoruz.

### 9 · Neden güvenebilirsin (30 sn)
> Güzel görünmesi yetmez, doğru olması gerekiyor. Sonuçlarımızı bağımsız kaynaklarla karşılaştırdık:
> NOAA meteoroloji istasyonlarıyla 1.013 bölgenin 954'ünde, yani **%94'ünde** aynı sonuç. NASA'nın kendi küresel
> sıcaklık serisiyle uyum 0,968. Su dengesi, El Niño, Pinatubo gibi altı fizik testinin hepsini geçtik.

### 10 · Nasıl çalışıyor (30 sn)
> Teknik merak edenler için tek slayt: NASA'nın MERRA-2 verisi; her ay kendi 1991–2020 normaliyle karşılaştırılıyor;
> iklim biliminde standart olan Mann-Kendall testi ve Sen eğimiyle trend bulunuyor. Hesap kullanıcının cihazında,
> saniyenin binde birinde yapılıyor. Kod açık, 258 otomatik test var, her sayı belgelenmiş.

### 11 · Kapanış (15 sn)
> QR kodu okutup kendi şehrinize bakabilirsiniz: **aeolusclimate.vercel.app**. Teşekkürler, sorularınızı alalım.

---

## Olası sorular ve kısa cevaplar

- **Veri nereden?** NASA MERRA-2 (v5.12.4): 1980'den bugüne aylık, ~55 km'lik kareler, 9 değişken.
- **Neden 1991–2020 normali?** Dünya Meteoroloji Örgütü'nün güncel standart referans dönemi.
- **"Net değişim" ne demek?** p < 0,01, %95 aralık sıfırı içermiyor ve üç ayrı kontrol aynı yönü gösteriyor. Bağımsız bir kaynak (istasyon, uydu) aynı fikirde değilse "net" verilmiyor.
- **Birçok yeri aynı anda test edince yanlış alarm çıkmaz mı?** Haritada çoklu test düzeltmesi (FDR) var; trend olmayan yapay veride yanlış alarm oranı %5,5'in altında.
- **Hesap neden tarayıcıda?** Sunucu masrafı yok, binlerce kişi aynı anda kullanabilir ve dönem değiştirince cevap anında geliyor.
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
