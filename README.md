# Tavla

Ofis ortamında iki çalışanın yerel ağ üzerinden kendi bilgisayarlarından oynayabileceği klasik **Türk Tavlası** uygulaması. Kuralları sunucu zorunlu kılar, pullar sürükle-bırak ile hareket ettirilir, üç farklı tema seçilebilir.

## Kurulum

Sadece bir bilgisayarda kurmak yeter (sunucu bilgisayarı).

```bash
cd Tavla
npm install
```

Gereksinim: **Node.js 18+** ve yerel ağ bağlantısı.

## Başlatma

```bash
npm start
```

Konsolda şuna benzer çıktı görürsünüz:

```
=================================
 Tavla sunucusu çalışıyor
=================================
 Kendi bilgisayarında:  http://localhost:3000
 Yerel ağdan:          http://192.168.1.42:3000
=================================
```

### Oynama akışı

1. **Sunucu bilgisayarındaki** oyuncu tarayıcıda `http://localhost:3000` adresini açar.
2. Çıkan ekranda **"Oda Oluştur"**a tıklar, adını yazar. 6 haneli oda kodu üretilir.
3. **İkinci oyuncu** kendi bilgisayarında, sunucunun konsolda yazdığı yerel ağ adresini açar (örn. `http://192.168.1.42:3000`).
4. **"Odaya Katıl"** der, oda kodunu girer, adını yazar.
5. İkinci oyuncu girince açılış zarı otomatik atılır, yüksek zarı atan başlar.
6. Sıra gelen oyuncu **"Zar At"**a basar, pulunu sürükleyip geçerli noktaya bırakır.

> İlk oyuncu beyaz pulları, ikinci oyuncu siyah pulları oynar.

### Tema seçimi

Sağ üst köşedeki menüden üç temadan birini seçebilirsiniz: **Klasik Ahşap**, **Modern Minimal**, **Renkli Ofis**. Tema seçimi her oyuncuda bağımsızdır; sadece kendi ekranınızı değiştirir.

## Testler

Saf kural motorunun (`server/game.js`) testlerini çalıştırmak için:

```bash
npm test
```

Bütüncül akış için (sunucu + iki simüle istemci):

```bash
node server/smoke.test.js
```

## Mimari

| Katman | Dosya | Sorumluluk |
|---|---|---|
| Kural motoru | `server/game.js` | Saf JS Türk Tavlası kuralları, hamle doğrulama, kazanma tespiti |
| WebSocket sunucu | `server/index.js` | Oda yönetimi, oyuncu eşleştirme, yetkili state, statik servis |
| İstemci | `client/index.html`, `client/app.jsx`, `client/themes.css` | React (CDN) + Tailwind (CDN) + sürükle-bırak |

Kurallar **sunucuda zorunlu kılınır** — istemci yalnızca sunucudan gelen "yasal hamleler" listesini görsel olarak işaretler. Bu nedenle bir oyuncu kendi yerel istemcisini değiştirse bile yasaksız hamle yapamaz.

## Kurallar

Türk Tavlası kurallarına %100 sadıktır. Detaylı kural setine `CLAUDE.md` dosyasının §4'üne bakın. Özetle:

- Çift zar = 4 hareket.
- Bar'da pul varken başka pul oynanamaz.
- Toplamaya başlamak için 15 pulun tamamı ana yurtta olmalı.
- Sadece bir zar oynanabiliyorsa büyük zar tercih edilmek zorunda.
- Mars: rakip hiç pul toplamamış. Çift mars: ayrıca rakibin pulu bar'da ya da kazananın ana yurdunda.

## Sorun giderme

- **İkinci bilgisayar adresi açamıyor:** İki bilgisayar aynı Wi-Fi/LAN'da mı? Sunucu bilgisayarının güvenlik duvarı 3000 portunu engelliyor olabilir.
- **Oda dolu hatası:** Aynı odaya üçüncü kişi bağlanmaya çalışmıştır. Yeni oda oluşturun.
- **Bağlantı koptu:** Tarayıcıyı yenileyin; oda hâlâ duruyorsa aynı kodla geri girebilirsiniz (geliştirme aşamasındaki davranış: oda boşalırsa silinir).

## Dizin yapısı

```
Tavla/
├── CLAUDE.md            # Proje rehberi (kurallar, mimari, kararlar)
├── README.md            # Bu dosya
├── package.json
├── server/
│   ├── index.js         # WebSocket sunucusu + statik servis
│   ├── game.js          # Saf kural motoru
│   ├── game.test.js     # Motor birim testleri
│   └── smoke.test.js    # Uçtan uca akış testi
└── client/
    ├── index.html       # Giriş noktası (CDN'den React + Tailwind)
    ├── app.jsx          # React kök bileşeni ve tüm UI
    └── themes.css       # Üç tema CSS değişkenleri
```
