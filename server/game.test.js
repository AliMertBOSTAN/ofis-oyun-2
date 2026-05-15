// game.js birim testleri — node server/game.test.js ile çalıştırılır
const G = require('./game');

let passed = 0, failed = 0;
const fails = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    fails.push({ name, msg: e.message });
    console.log(`  ✗ ${name}\n     ${e.message}`);
  }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((msg || '') + ` beklenen ${JSON.stringify(b)}, gelen ${JSON.stringify(a)}`);
  }
}
function truthy(v, msg) { if (!v) throw new Error(msg || 'truthy failed'); }

// Yardımcı: pul sayısı toplamı doğrula
function totalCheckers(state, c) {
  let sum = state.bar[c] + state.off[c];
  for (let i = 1; i <= 24; i++) {
    if (state.points[i].color === c) sum += state.points[i].count;
  }
  return sum;
}

// Yardımcı: state'i çift zarla "moving" fazına getir
function asMoving(state, dice, turn) {
  const s = JSON.parse(JSON.stringify(state));
  s.turn = turn || s.turn;
  s.dice = dice.slice();
  s.used = [];
  s.phase = 'moving';
  return s;
}

console.log('\n== Başlangıç dizilimi ==');
test('Başlangıç state - beyaz 15, siyah 15', () => {
  const s = G.createInitialState();
  eq(totalCheckers(s, 'W'), 15, 'beyaz toplam');
  eq(totalCheckers(s, 'B'), 15, 'siyah toplam');
});
test('Başlangıç dizilimi doğru noktalarda', () => {
  const s = G.createInitialState();
  eq(s.points[1], { color: 'W', count: 2 });
  eq(s.points[12], { color: 'W', count: 5 });
  eq(s.points[17], { color: 'W', count: 3 });
  eq(s.points[19], { color: 'W', count: 5 });
  eq(s.points[24], { color: 'B', count: 2 });
  eq(s.points[13], { color: 'B', count: 5 });
  eq(s.points[8], { color: 'B', count: 3 });
  eq(s.points[6], { color: 'B', count: 5 });
});

console.log('\n== Zar ==');
test('rollDice: çift gelirse 4 değer döner', () => {
  let foundDouble = false, foundNormal = false;
  for (let i = 0; i < 200; i++) {
    const d = G.rollDice();
    if (d.length === 4) {
      foundDouble = true;
      eq(d[0], d[1]); eq(d[1], d[2]); eq(d[2], d[3]);
    } else {
      foundNormal = true;
      eq(d.length, 2);
    }
  }
  truthy(foundDouble, 'çift zar hiç gelmedi');
  truthy(foundNormal, 'normal zar hiç gelmedi');
});

console.log('\n== Yasal hamleler (legalMoves) ==');
test('Beyaz başlangıç [3,1] hamleleri', () => {
  const s = asMoving(G.createInitialState(), [3, 1], 'W');
  const moves = G.legalMoves(s);
  // Beyaz 1+1=2 yasal, 1+3=4 yasal, 12+1=13 dolu siyahla 5, yasaksız vs.
  // Sadece tüm hamlelerin geçerliliğini doğrula:
  for (const m of moves) {
    truthy(m.from === 1 || m.from === 12 || m.from === 17 || m.from === 19, 'kaynak beyaz pulu olmalı');
    truthy(m.die === 1 || m.die === 3, 'zar değeri');
  }
  truthy(moves.length > 0, 'hiç hamle bulunamadı');
});

test('Bar pulu varken sadece sokma yasal', () => {
  const s = G.createInitialState();
  s.bar.W = 1;
  s.points[1] = { color: null, count: 0 }; // beyaz 1 pulunu bar'a koyduk varsayalım
  const m = asMoving(s, [3, 5], 'W');
  const moves = G.legalMoves(m);
  for (const mv of moves) {
    eq(mv.from, 'bar', 'bar pulu varken sadece bar hamlesi olmalı');
  }
});

test('Bar sokma - siyah için 25-n noktası', () => {
  const s = G.createInitialState();
  s.bar.B = 1;
  s.points[24] = { color: 'B', count: 1 }; // tek pul kalsın
  const m = asMoving(s, [2, 4], 'B');
  const moves = G.legalMoves(m);
  // Siyah zar 2 → nokta 23, zar 4 → nokta 21
  const dests = moves.map(x => x.to).sort();
  truthy(dests.includes(23) || dests.includes(21), 'siyah bar sokma noktaları');
});

console.log('\n== Kırma ==');
test('Tek rakip pul olan noktaya konunca kırılır', () => {
  const s = G.createInitialState();
  // Yapay durum: beyaz pul 5'te, siyah tek pul 8'de (zaten 3 var, değiştirelim)
  s.points[8] = { color: 'B', count: 1 };
  s.points[5] = { color: 'W', count: 1 };
  const m = asMoving(s, [3, 6], 'W');
  // Beyaz 5 → 8 (zar 3) ile siyahı kırmalı
  const ns = G.applyMove(m, { from: 5, to: 8, die: 3 });
  eq(ns.bar.B, 1, 'siyah bar');
  eq(ns.points[8].color, 'W');
  eq(ns.points[8].count, 1);
});

test('İki+ rakip pul olan noktaya konulamaz', () => {
  const s = G.createInitialState();
  const m = asMoving(s, [5, 2], 'W');
  // Beyaz 1 → 6 (zar 5) - siyahta 5 pul var
  const moves = G.legalMoves(m);
  const illegal = moves.find(mv => mv.from === 1 && mv.to === 6);
  truthy(!illegal, '1→6 yasal olmamalı');
});

console.log('\n== Toplama ==');
test('Tüm pullar ana yurtta olunca toplama açılır', () => {
  const s = G.createInitialState();
  // Beyaz tüm 15 pulu 19'a yığalım
  for (let i = 1; i <= 24; i++) s.points[i] = { color: null, count: 0 };
  s.points[19] = { color: 'W', count: 15 };
  truthy(G.isAllHome(s, 'W'), 'tüm pullar ana yurtta');
  const m = asMoving(s, [6, 6], 'W');
  const moves = G.legalMoves(m);
  truthy(moves.some(mv => mv.to === 'off'), 'toplama hamlesi olmalı');
});

test('Toplama: tam zar yoksa en geri pul toplanır', () => {
  const s = G.createInitialState();
  for (let i = 1; i <= 24; i++) s.points[i] = { color: null, count: 0 };
  s.points[22] = { color: 'W', count: 1 }; // sadece 22'de bir pul
  s.off.W = 14;
  const m = asMoving(s, [6, 5], 'W');
  // Beyaz için 22 → off pip = 25-22 = 3. Zar 5 ve 6 ikisi de 3'ten büyük, en geri pul 22.
  const moves = G.legalMoves(m);
  truthy(moves.some(mv => mv.from === 22 && mv.to === 'off'), '22→off mümkün');
});

test('Toplama: zar tam değer ise direkt toplar', () => {
  const s = G.createInitialState();
  for (let i = 1; i <= 24; i++) s.points[i] = { color: null, count: 0 };
  s.points[19] = { color: 'W', count: 1 };
  s.points[20] = { color: 'B', count: 2 }; // 19→20 (zar 1) bloklu — sadece tek hamle yolu
  s.off.W = 14;
  const m = asMoving(s, [6, 1], 'W');
  // 19 → off için pip = 6, zar 6 ile tam toplanır
  const moves = G.legalMoves(m);
  truthy(moves.some(mv => mv.from === 19 && mv.to === 'off' && mv.die === 6), 'zar 6 ile topla');
});

test('Toplama: daha geride pul varken büyük zarla içerdeki toplanamaz', () => {
  const s = G.createInitialState();
  for (let i = 1; i <= 24; i++) s.points[i] = { color: null, count: 0 };
  s.points[19] = { color: 'W', count: 1 }; // en geri
  s.points[22] = { color: 'W', count: 1 };
  s.off.W = 13;
  const m = asMoving(s, [5, 1], 'W');
  // 22 için pip = 3, zar 5 = 3'ten büyük AMA 19'da pul olduğu için 22 toplanamaz
  const moves = G.legalMoves(m);
  truthy(!moves.some(mv => mv.from === 22 && mv.to === 'off' && mv.die === 5),
    '22 zar 5 ile toplanmamalı, en geri 19 değil');
});

console.log('\n== Çift zar ==');
test('Çift zar = 4 hareket', () => {
  const dice = [4, 4, 4, 4];
  const s = asMoving(G.createInitialState(), dice, 'W');
  // Bir hamle yap, hala 3 zar kalmalı
  const moves = G.legalMoves(s);
  truthy(moves.length > 0);
  const ns = G.applyMove(s, moves[0]);
  // Eğer hala kazanılmadıysa ve hamleler bittiyse sıra geçmiş olabilir
  if (ns.phase === 'moving') {
    eq(ns.dice.length, 3, 'çift sonrası 3 zar kalmalı');
  }
});

console.log('\n== Büyük zar zorunlu ==');
test('Tek zar oynanabiliyorsa büyük tercih edilir', () => {
  // Senaryo: beyazın sadece bir noktada bir pulu var, hareket alanı kısıtlı
  const s = G.createInitialState();
  for (let i = 1; i <= 24; i++) s.points[i] = { color: null, count: 0 };
  s.bar.W = 0;
  s.off.W = 14;
  s.points[20] = { color: 'W', count: 1 };
  // Rakibin 21'de tek pulu olsun (kırılabilir, 1 zarla)
  // 22, 23, 24 dolu rakip
  s.points[22] = { color: 'B', count: 2 };
  s.points[23] = { color: 'B', count: 2 };
  s.points[24] = { color: 'B', count: 2 };
  s.points[21] = { color: 'B', count: 2 }; // 21 de blok
  // Pul 20'den ileri sadece 21,22,23,24 - hepsi blok. Toplama da 5'ten az zar gerektiriyor (20→off pip=5).
  // Zar [2, 3]: 20+2=22 blok, 20+3=23 blok, toplama için pip 5 lazım — ne 2 ne 3.
  // Bu durumda hiç hamle yok. Senaryoyu değiştir:
  s.points[22] = { color: null, count: 0 };
  // Şimdi 20+2=22 boş ✓, 20+3=23 blok ✗
  const m = asMoving(s, [2, 3], 'W');
  const moves = G.legalMoves(m);
  // Sadece bir hamle mümkün ve o da 20→22 (zar 2).
  // Ama büyük zar 3 olsa da onunla hareket yok. Yine küçük oynanır.
  // Bu durumda 2 oynanması gerekir.
  truthy(moves.length === 1 && moves[0].die === 2, 'sadece küçük zar oynanabiliyorsa o oynanır');
});

test('Büyük zar mümkünken küçük seçilemez', () => {
  const s = G.createInitialState();
  for (let i = 1; i <= 24; i++) s.points[i] = { color: null, count: 0 };
  s.off.W = 14;
  s.points[20] = { color: 'W', count: 1 };
  // 21 boş (zar 1 ile), 23 boş (zar 3 ile), her ikisi de tek başına oynanabilir.
  // Ama 20→21 sonrası ne 23 ne off ile zar 3 oynanır mı?
  // 21+3=24 boş ✓, yani aslında iki zar da oynanabilir. Senaryoyu daha kısıtla:
  s.points[24] = { color: 'B', count: 2 }; // 21→24 blok
  s.points[23] = { color: 'B', count: 2 }; // 20→23 blok
  // 20→21 (zar 1) ✓, 21+3=24 blok, 21'den off için pip 4 lazım, zar 3 ≠4 ve 21 en geri değilse...
  // 20 pip = 5, 21 pip = 4. Şimdi 20 pip > 3, 21 pip > 3, ne ikisi de zar 3 ile toplanmaz.
  // Yani sadece zar 1 oynanır.
  // Test: büyük zar oynanamadığı için küçük serbest.
  const m = asMoving(s, [1, 3], 'W');
  const moves = G.legalMoves(m);
  truthy(moves.length >= 1 && moves.every(mv => mv.die === 1), 'sadece zar 1 hamleleri');
});

console.log('\n== Mars / Çift Mars ==');
test('Normal galibiyet', () => {
  const s = G.createInitialState();
  for (let i = 1; i <= 24; i++) s.points[i] = { color: null, count: 0 };
  s.off.W = 14;
  s.off.B = 5; // rakip toplamış
  s.points[24] = { color: 'W', count: 1 };
  // Çift zar [1,1,1,1] ile büyük-zar kuralından kaçınılır
  const m = asMoving(s, [1, 1, 1, 1], 'W');
  const ns = G.applyMove(m, { from: 24, to: 'off', die: 1 });
  eq(ns.phase, 'gameOver');
  eq(ns.winner, 'W');
  eq(ns.marsType, 'normal');
});

test('Mars: rakip hiç toplayamamış, bar/yurda da pulu yok', () => {
  const s = G.createInitialState();
  for (let i = 1; i <= 24; i++) s.points[i] = { color: null, count: 0 };
  s.off.W = 14;
  s.off.B = 0;
  s.points[24] = { color: 'W', count: 1 };
  s.points[10] = { color: 'B', count: 15 }; // siyah 10'da (beyaz yurdunda DEĞİL)
  const m = asMoving(s, [1, 1, 1, 1], 'W');
  const ns = G.applyMove(m, { from: 24, to: 'off', die: 1 });
  eq(ns.marsType, 'mars');
});

test('Çift Mars: rakibin pulu kazananın ana yurdunda', () => {
  const s = G.createInitialState();
  for (let i = 1; i <= 24; i++) s.points[i] = { color: null, count: 0 };
  s.off.W = 14;
  s.off.B = 0;
  s.points[24] = { color: 'W', count: 1 };
  s.points[20] = { color: 'B', count: 15 }; // siyah beyazın yurdunda (19-24)
  const m = asMoving(s, [1, 1, 1, 1], 'W');
  const ns = G.applyMove(m, { from: 24, to: 'off', die: 1 });
  eq(ns.marsType, 'cift-mars');
});

test('Çift Mars: rakip bar\'da', () => {
  const s = G.createInitialState();
  for (let i = 1; i <= 24; i++) s.points[i] = { color: null, count: 0 };
  s.off.W = 14;
  s.off.B = 0;
  s.bar.B = 1;
  s.points[24] = { color: 'W', count: 1 };
  s.points[10] = { color: 'B', count: 14 };
  const m = asMoving(s, [1, 1, 1, 1], 'W');
  const ns = G.applyMove(m, { from: 24, to: 'off', die: 1 });
  eq(ns.marsType, 'cift-mars');
});

console.log('\n== Açılış zarı ==');
test('Açılış zarı: kazananın sırası ve dice yüklenir', () => {
  const s = G.createInitialState();
  eq(s.phase, 'opening');
  const ns = G.performOpeningRoll(s);
  eq(ns.phase, 'moving');
  eq(ns.dice.length, 2);
  truthy(ns.openingRoll.white !== ns.openingRoll.black, 'eşit olmamalı');
  if (ns.openingRoll.white > ns.openingRoll.black) eq(ns.turn, 'W');
  else eq(ns.turn, 'B');
});

console.log('\n== Pul korunumu (15 pul kuralı) ==');
test('Hamleler sonrası beyaz pul toplamı 15 kalır', () => {
  let s = G.performOpeningRoll(G.createInitialState());
  for (let step = 0; step < 30; step++) {
    if (s.phase === 'gameOver') break;
    if (s.phase === 'rolling') s = G.rollAndStart(s);
    if (s.phase !== 'moving') continue;
    const moves = G.legalMoves(s);
    if (moves.length === 0) break;
    s = G.applyMove(s, moves[Math.floor(Math.random() * moves.length)]);
    eq(totalCheckers(s, 'W'), 15, 'beyaz 15');
    eq(totalCheckers(s, 'B'), 15, 'siyah 15');
  }
});

console.log('\n--- Sonuc: ' + passed + ' gecti, ' + failed + ' basarisiz ---');
if (failed > 0) {
  for (const f of fails) console.log('  - ' + f.name + ': ' + f.msg);
  process.exit(1);
}
