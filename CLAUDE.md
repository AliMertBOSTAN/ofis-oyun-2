# Tavla — Proje Rehberi (CLAUDE.md)

Bu dosya, Tavla projesi üzerinde çalışırken Claude'un takip edeceği başvuru rehberidir. Oyun kuralları, tahta modeli, teknik mimari ve geliştirme akışı burada tanımlanmıştır. Yeni bir özellik eklenirken veya bir hata düzeltilirken önce bu dosya gözden geçirilir.

---

## 1. Proje Vizyonu

Ofis ortamında, iki çalışanın yerel ağ üzerinden kendi bilgisayarlarından oynayabileceği klasik bir Türk Tavlası uygulaması. Mola havasında, hızlı kurulup hızlı oynanabilecek; kuralları doğru ve eksiksiz uygulayan; göze hoş gelen, sürüklenir hareketli bir oyun.

Temel hedefler:
- Türk Tavlası kurallarına %100 sadık olmak (hatalı hamleyi engellemek)
- İki ekran üzerinden senkron oynanış (yerel ağ multiplayer)
- Pulları sürükleyip bırakarak (drag & drop) hareket ettirme
- Üç tema seçeneği (klasik ahşap, modern minimal, renkli ofis) — oyuncu kendi cihazında istediğini seçer
- Zarın "atılma" hissini veren animasyon

---

## 2. Teknoloji Yığını

| Katman | Seçim | Not |
|---|---|---|
| Frontend | React (JSX, tek `App.jsx` köküyle) | Bileşen tabanlı; sürükle-bırak için react-dnd veya native HTML5 DnD |
| Stil | Tailwind core utility class'ları | Üç tema CSS değişkenleri (`--board-bg`, `--checker-light`, vb.) üzerinden değiştirilir |
| Realtime senkron | Node.js + `ws` (WebSocket) sunucu | Aynı yerel ağdaki bir bilgisayar sunucuyu çalıştırır, ikinci oyuncu IP ile bağlanır |
| Durum yönetimi | React `useReducer` + sunucu otoritesi | Hamleyi sunucu doğrular, istemciler sunucudan gelen state'i render eder |
| Zar | `crypto.getRandomValues` | Sunucu tarafında atılır — istemci hile yapamaz |

### Mimari kararlar
- **Otoriter sunucu modeli:** Tüm hamleler sunucuda doğrulanır, "geçerli hamleler" listesi sunucudan gelir. Bu kuralların eksiksiz uygulanmasını garantiler.
- **Tek dosya değil:** Yerel ağ multiplayer için bir backend zorunlu olduğundan proje şu yapıdadır:
  ```
  Tavla/
    CLAUDE.md
    server/
      index.js        — WebSocket sunucusu, oyun motoru, kural doğrulayıcı
      game.js         — Saf JS tavla motoru (board, moves, dice, win)
      package.json
    client/
      src/App.jsx     — React kök bileşeni
      src/Board.jsx   — Tahta görselleştirme
      src/Checker.jsx — Pul bileşeni (drag source)
      src/Point.jsx   — 24 noktadan biri (drop target)
      src/Dice.jsx    — Zar animasyonu
      src/themes.css  — Üç tema CSS değişkenleri
      src/net.js      — WebSocket istemcisi
      package.json
    README.md         — Kurulum ve başlatma talimatı
  ```
- **Lobby:** Sunucu açıldığında bir 6 haneli "oda kodu" üretir. İkinci oyuncu bu kodu girerek bağlanır. Hangi oyuncunun beyaz/siyah olduğu lobide belirlenir.

---

## 3. Tahta Modeli ve Pul Yerleşimi

### 3.1 Nokta numaralandırması
- 24 üçgen "ev" (point), 1'den 24'e numaralanır.
- **Beyaz** oyuncu 1 → 24 yönünde ilerler ve **19–24** arasını toplar (kendi ana yurdu).
- **Siyah** oyuncu 24 → 1 yönünde ilerler ve **1–6** arasını toplar (kendi ana yurdu).

Tahtanın görsel düzeni (oyuncu kendi tarafından bakar):

```
 13 14 15 16 17 18  |  19 20 21 22 23 24      ← Üst sıra (numaralar soldan sağa artar)
 ┌──┬──┬──┬──┬──┬──┐│┌──┬──┬──┬──┬──┬──┐
 │  │  │  │  │  │  ││  │  │  │  │  │  │
 │  │  │  │  │  │  ││  │  │  │  │  │  │
 │  │  │  │  │  │  ││  │  │  │  │  │  │
 │  │  │  │  │  │  ││  │  │  │  │  │  │
 └──┴──┴──┴──┴──┴──┘│└──┴──┴──┴──┴──┴──┘
                    BAR
 ┌──┬──┬──┬──┬──┬──┐│┌──┬──┬──┬──┬──┬──┐
 │  │  │  │  │  │  ││  │  │  │  │  │  │
 │  │  │  │  │  │  ││  │  │  │  │  │  │
 │  │  │  │  │  │  ││  │  │  │  │  │  │
 │  │  │  │  │  │  ││  │  │  │  │  │  │
 └──┴──┴──┴──┴──┴──┘│└──┴──┴──┴──┴──┴──┘
 12 11 10  9  8  7  |   6  5  4  3  2  1      ← Alt sıra (numaralar sağdan sola artar)
```

### 3.2 Veri yapısı

```js
const initialState = {
  // points[i] = { color: 'W' | 'B' | null, count: 0..15 }
  // index 1..24 kullanılır, 0 yer tutucu
  points: Array(25).fill(null),
  bar:   { W: 0, B: 0 },   // kırılan pullar
  off:   { W: 0, B: 0 },   // toplanmış pullar
  dice:  [],               // örn. [3, 5] veya [4,4,4,4] (çift)
  used:  [],               // bu turda harcanan zarlar
  turn:  'W',              // sıra
  phase: 'rolling' | 'moving' | 'gameOver',
  winner: null,
  marsType: null,          // 'normal' | 'mars' | 'cift-mars'
};
```

### 3.3 Başlangıç pul dağılımı (Türk Tavlası)

| Nokta | Beyaz | Siyah |
|------:|:-----:|:-----:|
|  1    | **2** |   —   |
|  6    |   —   | **5** |
|  8    |   —   | **3** |
| 12    | **5** |   —   |
| 13    |   —   | **5** |
| 17    | **3** |   —   |
| 19    | **5** |   —   |
| 24    |   —   | **2** |

Her oyuncu toplam **15 pul** ile başlar. Diğer tüm noktalar boştur.

### 3.4 Bar ve toplama alanı
- **Bar (orta çubuk):** Kırılan pullar burada bekler. Bar'da pulu olan oyuncu önce onu rakip ana yurdundan tahtaya sokmak zorundadır.
- **Toplama tepsisi (off):** Her oyuncunun kendi tarafında bir alan; toplanan pullar buraya gider. UI'da tahtanın sağ kenarında "Beyaz toplama" ve "Siyah toplama" olarak iki bölme bulunur.

---

## 4. Oyun Kuralları (Klasik Türk Tavlası)

Aşağıdaki kurallar **kural motoru** (`server/game.js`) tarafından zorunlu kılınır. İstemci yalnızca motorun "geçerli hamle" çıktısını gösterir.

### 4.1 Başlangıç
1. Her oyuncu bir zar atar. Yüksek zarı atan başlar ve **ilk hamlesini bu iki zarla** oynar. Eşitlik gelirse tekrar atılır.

### 4.2 Zar atma
1. Sıra gelen oyuncu iki zarı birlikte atar.
2. Çift gelirse (örn. 4-4) zar **dört kez** kullanılır (4,4,4,4).
3. Zarlar atıldıktan sonra geri çevrilemez; oyuncu **mümkün olan tüm hareketleri** oynamak zorundadır. Sadece bir zar oynanabiliyorsa (diğeri için yasal hamle yoksa) yalnızca o zar oynanır; **mümkünse büyük zar tercih edilir** (kuralın gerektirdiği yerlerde motor bunu zorunlu kılar).
4. Hiç yasal hamle yoksa sıra rakibe geçer.

### 4.3 Pul hareketi
1. Her zar **ayrı bir hareket** tanımlar; bir pulu iki zarın toplamı kadar tek hamlede oynayamazsınız (ama aynı pulu önce bir zarla, sonra diğer zarla iki adımda oynayabilirsiniz; her ara nokta da yasal olmalı).
2. Hareket yönü: Beyaz artan numaralara, Siyah azalan numaralara.
3. Bir noktaya konulabilir mi?
   - **Boş** noktaya konulabilir.
   - **Kendi pulu** olan noktaya konulabilir (kapı oluşur).
   - **Rakibin 1 pulu** olan noktaya konulabilir → rakip pul **kırılır**, bar'a gider.
   - **Rakibin 2+ pulu** olan noktaya **konulamaz**.

### 4.4 Kırılma ve sokma
1. Kırılan pul bar'a gider.
2. Bar'da pulu olan oyuncu, sıra kendisine geldiğinde **önce bar pullarını sokmak** zorundadır. Bar boşalmadan başka pul oynayamaz.
3. Sokma noktaları:
   - **Beyaz** zar değerini doğrudan kullanır: zar `n` ise `n` numaralı noktaya sokmaya çalışır (yani 1–6 arası — siyahın ana yurduna).
   - **Siyah** ise `25 - n` numaralı noktaya sokar (yani 19–24 arası).
4. Sokulamayan zar yanar (pas geçilir), ama yasal sokma varsa zorunludur.

### 4.5 Toplama (Bear-off)
1. Toplamaya başlamak için oyuncunun **tüm 15 pulu** kendi ana yurdunda (Beyaz: 19–24, Siyah: 1–6) olmalıdır.
2. Zar geldiğinde:
   - Tam değer karşılığı bir noktada pul varsa, oradan toplanır. (Beyaz için 19'daki pul 6 zarı ile toplanır; Siyah için 6'daki pul 6 zarı ile toplanır.)
   - O değerde pul yoksa ve **daha içeride** (kazanma yönünde daha yakın) pul yoksa, en geride duran pul o zarla toplanır.
   - O değerde veya daha yüksekte pul varsa, zar normal hamle olarak da kullanılabilir.
3. Toplama esnasında **bir pul kırılırsa** toplama hakkı askıya alınır; bar pulu yeniden ana yurda dönene kadar toplanamaz.

### 4.6 Kazanma ve skor
- **Normal galibiyet (1 puan):** Rakip en az 1 pul topladıysa.
- **Mars (2 puan):** Rakip hiç pul toplamadıysa.
- **Çift Mars / Beş Pul (3 puan):** Rakip hiç pul toplamadı **ve** bar'da veya kazananın ana yurdunda en az bir pulu duruyor.

### 4.7 Zorunlu hamle ve "büyük zar" kuralı
- Yasal hamle varsa oynamak zorunludur.
- Sadece bir zar oynanabiliyorsa: motor önce büyük zarla yasal hamle olup olmadığını kontrol eder; varsa **büyük zar oynanmalıdır**.

---

## 5. Etkileşim ve UI Akışı

### 5.1 Oyuncu hamle akışı
1. Sıra geldiğinde **Zar At** düğmesi aktifleşir.
2. Tıklanınca zar animasyonu oynar, sunucudan gelen sonuçla durur.
3. Pullardan hangileri hareket edebilir → motor hesaplar → **bu pullar parıltıyla** belirginleşir.
4. Pulu sürüklemeye başlayınca **geçerli hedef noktalar** vurgulanır (yeşil çerçeve).
5. Geçersiz noktaya bırakılırsa pul başlangıç noktasına geri snap'lenir.
6. Geçerli noktaya bırakılırsa zarlardan ilgili olanı "kullanıldı" olur (UI'da kararır).
7. Tüm zarlar bitince veya yasal hamle kalmayınca sıra otomatik geçer.
8. **Geri Al** düğmesi: oyuncu hamlesini onaylamadan önce, kullandığı zarları geri alabilir. **Sırayı bitir** ile onaylar.

### 5.2 Hata önleme
- Yasal olmayan hamle UI tarafından engellenir; istemci yine de sunucuya gönderirse sunucu reddeder ve hatayı bildirir.
- Bar'da pulu varken başka pulu kaldırmaya çalışmak engellenir (görsel uyarı).

### 5.3 Tema sistemi
Üç tema CSS değişkenleri olarak `themes.css` içinde tanımlanır. Tema seçimi her oyuncuda **bağımsızdır** ve `useState`'te tutulur (sunucuya yansımaz):
- `classic-wood`: kahverengi tahta, krem/koyu kahve pullar, üçgenler bej/koyu kahve geçiş
- `modern-minimal`: gri/beyaz arka plan, mat siyah ve mat beyaz pullar, ince çizgili üçgenler
- `office-fun`: pastel mavi/turuncu üçgenler, turuncu ve teal pullar, hafif gölgelendirme

Tema seçici ekranın sağ üst köşesinde bir açılır menüdür.

---

## 6. Geliştirme Yol Haritası

Sıralama, her adımın test edilebilirliğine göre belirlenmiştir.

1. **Oyun motoru (server/game.js)** — saf fonksiyonel, React'sız.
   - `createInitialState()`
   - `rollDice()` (çift kontrolü dahil)
   - `legalMoves(state)` → tüm yasal hamleler
   - `applyMove(state, move)` → yeni state, kırma/toplama otomatik
   - `checkWin(state)` → kazananı ve mars tipini döner
   - Unit testler: Jest ile her kural için en az 1 test (sokma, kapatma, mars, çift mars, büyük zar zorunluluğu).
2. **WebSocket sunucusu (server/index.js)** — oda yönetimi, oyun motorunu yetkili olarak çalıştırma.
3. **Tahta görselleştirme (Board, Point, Checker)** — statik başlangıç dizilimini render et.
4. **Zar bileşeni ve atış animasyonu.**
5. **Sürükle-bırak ve hamle gönderimi.**
6. **Tema sistemi ve seçici.**
7. **Lobby ekranı (oda oluştur / odaya katıl).**
8. **Skor tablosu (opsiyonel — birden fazla el).**
9. **Bağlantı kopması / yeniden bağlanma toleransı.**

---

## 7. Test Stratejisi

- **Birim testler:** `server/game.js` her kuralı tek başına test eder. Özellikle uç durumlar: bar'da iki pul varken, ana yurda son pulu sokarken kırılma, büyük zar zorunluluğu, mars/çift mars tespiti.
- **Senaryo testleri:** Önceden tanımlı tahta durumlarından başlayıp belirli hamle dizileri uygulayıp sonuç state'i doğrulama.
- **Manuel iki-ekran testi:** Aynı makinede iki tarayıcı sekmesi açıp lobby → tam el → toplama akışını her tema ile bir kez geçirme.

---

## 8. Önemli Kurallar — Hızlı Hatırlatıcı

Bu bölüm geliştirme sırasında en sık unutulan / yanlış uygulanan kuralları toplar:

1. Çift zar = **4 hareket**, 2 değil.
2. Bar'da pul varken başka hiçbir pul oynanamaz.
3. Toplamaya başlamak için **15 pulun tamamı** ana yurtta olmalı, 14 değil.
4. Toplama sırasında "tam zar" yoksa en geri pul toplanır — ama sadece o zarın işaret ettiği değerde veya **daha içeride** pul kalmamışsa.
5. Sadece bir zar oynanabiliyorsa **büyük zar tercih edilmek zorunda**.
6. Hiç yasal hamle yoksa sıra geçer; oyuncu "atlamak istiyorum" diyemez, motor karar verir.
7. Beyaz 1→24, Siyah 24→1. Sokma noktası Beyaz için `n`, Siyah için `25 - n`.
8. Çift Mars için rakibin pulu ya bar'da ya da kazananın ana yurdunda olmalı — sadece "hiç toplayamamış olmak" mars'tır, çift mars değil.

---

## 9. Bu Dosyanın Bakımı

- Yeni bir kural yorumlanırken veya bir hata düzeltilirken §4 ve §8 güncellenir.
- Mimari değişiklik §2'ye not düşülür.
- Yeni tema eklenirken §5.3'e tanımı eklenir.
- Pul yerleşimi/koordinat sistemi değişirse §3 güncellenir (motor ve UI bu bölüme göre yazılır).
