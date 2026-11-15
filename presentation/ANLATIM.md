# Aeolus · Anlatım rehberi

İki sunum var, ikisi de aynı hikâyeyi aynı sırayla anlatıyor:

| | Mentörlere / jüriye canlı | NASA'ya yüklenecek |
|---|---|---|
| Dosya | `index.html` (localhost:5180) · yedek `pdf/aeolus-sunum.pdf` | `pdf/aeolus-nasa.pdf` |
| Dil | Türkçe | İngilizce |
| Uzunluk | 8 slayt, 3 dakika | 7 sayfa, konuşmacı yok |
| Fark | Sen anlatırsın, 3. slaytta uygulamayı canlı açarsın | Her görselin altında ne gösterdiği yazıyor, her sayfada site linki ve sayfa numarası var |

Not: NASA sürümü (`nasa.html`) henüz bu 12 slaytlık yeni sıraya göre güncellenmedi.

**Ana mesaj (tek cümle):** "Aeolus, NASA'nın 46 yıllık iklim verisini herkesin anlayacağı bir cevaba çevirir:
ne değişti, ne kadar değişti ve ne kadar eminiz."

Sunarken `S` tuşu konuşmacı ekranını açar (notlar + sonraki slayt + süre).

---

## Konuşma metni (~2:30, 30 sn boşluk)

Hikâye: soru → cevap kilitli → tek şehir (canlı) → kime yarar → neden güvenelim → dürüstlük → büyük resim → sen de bak.
Kartlar kendiliğinden gelir; tuşa sadece slayt değiştirirken basılır.

### 1 · Açılış (12 sn)
> Bir soruyla başlayayım: doğduğunuz yıldan beri şehriniz kaç derece ısındı? Bilmiyorsunuz, değil mi? Biz de bilmiyorduk.
> Biz Data May Cry'ız, bu da **Aeolus**.

### 2 · Herkesin bir sorusu var (18 sn)
> Bu sorunun cevabı aslında var. NASA 46 yıldır dünyanın her köşesini ölçüyor. Ama veri 2.244 dosyanın içinde, istatistik
> bilmeden açılmayan bir kasada. Diyarbakır yazları daha mı sıcak, Erzurum'da kar azaldı mı? Herkesin sorusu var ama kimse
> cevaba ulaşamıyor. **Biz o kasayı açtık.** Bakın:

### 3 · Canlı gösterim (35 sn)
Uygulama slaytın içinde açık (Diyarbakır, hava sıcaklığı):
> Diyarbakır: 10 yılda 0,42 derece ve bu tahmin değil, net. Ya yazlar? *(Yaz)* Daha hızlı: 0,53. Peki kışlar? *(Kış)*
> Burada çoğu uygulama bir şey uydururdu. Biz "belirgin bir değişim yok" diyoruz. **Emin değilsek, emin değiliz.**

Vakit varsa aramaya `Erzurum` yaz, kar değişkenine geç. İnternet yoksa slayt ekran görüntüsünü gösterir.

### 4 · Kim, ne için (25 sn)
> Bu ekran, Diyarbakır'da bir ziraat mühendisi için çok şey demek. **Zeynep** yazların 2,4 derece ısındığını görüyor ve çiftçiye
> "eskisi gibi ekme" diyor. Aydın'da rüzgârın zayıfladığını gören **Can**, santralini yanlış yere kurmuyor. Mersin'de **Elif**
> yazların nemlendiğini görüp sıcak hava planını buna göre yapıyor. Gazeteci **Murat** da "İstanbul 2,7 derece ısındı" diye
> yazmadan önce rakamı buradan doğruluyor.

### 5 · Sonuçlar (20 sn)
> Ama bu insanlar bu rakamlara dayanıp karar veriyorsa, rakamın doğru olması gerekir. O yüzden kendimizi test ettik.
> NOAA istasyonlarıyla **yüzde 94** aynı sonucu bulduk, NASA'nın küresel serisiyle 0,968 uyum çıktı. Trend olmayan veride
> yanlış alarm yüzde 5,5'in altında. Altı fizik testine soktuk, altısı da tuttu.

### 6 · Avantajlar, dezavantajlar (18 sn)
> Ama her şeyi yapıyor demeyeceğiz. Mahallenizi göremez, en küçük ayrıntı 55 kilometre. Her gün değişmez, yılda bir değişir.
> Ve geleceği söylemez, sadece geçmişi söyler. **Ama geçmişi çok net söyler.**

### 7 · Zaman yolculuğu (12 sn), kendiliğinden bir kez oynar, 2025'te durur
> Bir şehirle başladık. Şimdi bütün dünyaya bakalım: 46 yıl, 10 saniyede. *(sus, izlet)*
> Maviyle başladı, kırmızıyla bitti. **Dünya 0,7 derece ısındı.**

### 8 · Kapanış (8 sn)
> Baştaki soruya döneyim: sizin şehriniz kaç derece ısındı? QR'ı okutun, 10 saniyede öğrenin. Teşekkürler.

**Boşluğu doldurmak için:** 3'te Erzurum/kar; 7'de 1992 mavisi (Pinatubo patladı, dünya bir yıl ~0,25 °C soğudu).

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

## Yöntem soruları (koddan doğrulandı: `web/src/trend.ts`, `worker/`)

**En önemli cümle:** "Fizik formülüyle biz hesaplamıyoruz. Fiziği NASA yapıyor, biz istatistiği yapıyoruz."

MERRA-2 bir **reanaliz**: NASA'nın hava modeli, uydu, istasyon ve balon gözlemlerini birleştirip 1980'den bugüne
dünyanın her ~55 km'lik karesi için tutarlı bir kayıt üretiyor. Fizik (enerji, su dengesi vb.) o modelin içinde.

**Adım adım (30 saniyede anlatılır):**
1. **Birim çevirisi:** Kelvin − 273,15 → °C · kg/m²/s × 86.400 → mm/gün · kg/kg × 1.000 → g/kg · toprak nemi × 100 → %.
2. **İl ortalaması:** İlin içindeki karelerin alan ağırlıklı ortalaması (kuzeydeki kareler küçük olduğu için enlemin kosinüsüyle ağırlıklandırılır).
3. **Mevsimi çıkarma (anomali):** Her ay, 1991–2020'deki aynı ayın ortalamasından ne kadar farklı? (Temmuz'u Ocak'la değil, diğer Temmuzlarla karşılaştırırız.)
4. **Yıllık ortalama:** 46 yıl → 46 sayı. Mevsim seçilirse sadece o aylar (kış = Aralık + Ocak + Şubat).
5. **Mann-Kendall testi:** Her yılı sonraki her yılla karşılaştırır: "sonraki yıl daha mı yüksek?" Sayı artarak gidiyorsa trend var. Sonuç: p değeri (şans eseri olma ihtimali).
6. **Sen eğimi:** Her iki yıl arasındaki eğimlerin **medyanı** → "10 yılda ne kadar". Medyan olduğu için tek bir aşırı yıl sonucu bozmaz.
7. **%95 güven aralığı:** Ardışık yılların birbirine benzemesi (otokorelasyon) hesaba katılarak genişletilir.

**"Net değişim" ne zaman deriz? (hepsi birden)**
- Yıllık test p < 0,01 ve %95 aralık sıfırı içermiyor,
- aylık seride ikinci bir test (ön-beyazlatmalı Mann-Kendall) de p < 0,01, aynı yön,
- baştan ve sondan 5 yıl atınca da p < 0,05, aynı yön,
- bağımsız kaynak (NOAA istasyonları, NASA GPCP yağış) karşı çıkmıyor.
Daha zayıfsa "olası değişim" (p < 0,05), o da değilse "belirgin değişim yok".

**Olası takip soruları:**
- **Neden doğrusal regresyon değil?** Mann-Kendall veri dağılımı hakkında varsayım yapmaz ve uç değerlere dayanıklıdır; iklim trendlerinde yaygın kullanılan standart yöntemdir (Mann 1945, Kendall 1975, Sen 1968).
- **Neden aylık değil yıllık?** Aylık veride ardışık aylar birbirine benziyor; düz aylık testle yanlış alarm %17–31 çıktı. Yıllık ortalamayla ~%5'e indi (kendi simülasyonumuz).
- **Fiziksel olarak doğru olduğunu nereden biliyorsunuz?** Veriyi 6 bilinen fizik olayıyla test ettik, 6'sı da tuttu: küresel yağış = buharlaşma (fark %0,02) · ısınınca nem ~%7/°C artıyor (Clausius-Clapeyron, ölçtüğümüz %7,3) · Kuzey Kutbu dünyadan 2,7 kat hızlı ısınıyor · 1991 Pinatubo patlamasından sonra 1992'de pus zirve, sıcaklık düştü · en sıcak El Niño kışları 2015, 2023, 1997 · ısınan yerde kar azalıyor.
- **Haritada yüzlerce yeri aynı anda test etmek?** Benjamini-Hochberg (FDR) düzeltmesi var; yanlış alarm %5,5'in altında.
- **Kuralları sonuca bakıp mı seçtiniz?** Hayır, karar kuralları gerçek veriyi görmeden önce PLAN.md'de sabitlendi.

**Bilmediğin bir şey sorulursa:** "Onu kesin söyleyemem, sitede ⓘ → Yöntem bölümünde adım adım yazıyor." demek, tahmin etmekten iyidir.

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
