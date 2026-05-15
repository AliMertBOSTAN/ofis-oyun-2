// Türk Tavlası kural motoru — saf JS, React'sız
// CLAUDE.md §3 ve §4'teki kuralları zorunlu kılar.

const WHITE = 'W';
const BLACK = 'B';

function emptyPoint() { return { color: null, count: 0 }; }

function createInitialState() {
  const points = Array(25).fill(null).map(emptyPoint);
  // Beyaz: 1(2), 12(5), 17(3), 19(5) = 15
  points[1]  = { color: WHITE, count: 2 };
  points[12] = { color: WHITE, count: 5 };
  points[17] = { color: WHITE, count: 3 };
  points[19] = { color: WHITE, count: 5 };
  // Siyah: 24(2), 13(5), 8(3), 6(5) = 15
  points[24] = { color: BLACK, count: 2 };
  points[13] = { color: BLACK, count: 5 };
  points[8]  = { color: BLACK, count: 3 };
  points[6]  = { color: BLACK, count: 5 };
  return {
    points,
    bar:    { W: 0, B: 0 },
    off:    { W: 0, B: 0 },
    dice:   [],
    used:   [],
    turn:   WHITE,
    phase:  'opening',   // 'opening' | 'rolling' | 'moving' | 'gameOver'
    winner: null,
    marsType: null,
    openingRoll: null,
  };
}

function clone(state) { return JSON.parse(JSON.stringify(state)); }
function opponent(c) { return c === WHITE ? BLACK : WHITE; }
function direction(c) { return c === WHITE ? 1 : -1; }
function homeRange(c) { return c === WHITE ? [19, 24] : [1, 6]; }

function rollOneDie() { return 1 + Math.floor(Math.random() * 6); }

function rollDice() {
  const d1 = rollOneDie();
  const d2 = rollOneDie();
  return d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
}

// Açılış zarı: her oyuncu 1 zar atar, yüksek olan başlar.
// Eşitse tekrar atılır. State 'moving' fazına geçer ve dice = [d1, d2].
function performOpeningRoll(state) {
  const s = clone(state);
  if (s.phase !== 'opening') throw new Error('Açılış fazında değil');
  let w, b;
  do {
    w = rollOneDie();
    b = rollOneDie();
  } while (w === b);
  s.turn = w > b ? WHITE : BLACK;
  s.openingRoll = { white: w, black: b };
  s.dice = [w, b];
  s.used = [];
  s.phase = 'moving';
  // Açılış sonrası ilk oyuncuya yasal hamle yoksa sıra geçer
  if (computeLegalMoves(s).length === 0) {
    s.turn = opponent(s.turn);
    s.dice = [];
    s.used = [];
    s.phase = 'rolling';
  }
  return s;
}

// Normal turla zar atma
function rollAndStart(state) {
  if (state.phase !== 'rolling') throw new Error('Zar atılacak fazda değil');
  const s = clone(state);
  s.dice = rollDice();
  s.used = [];
  s.phase = 'moving';
  if (computeLegalMoves(s).length === 0) {
    s.turn = opponent(s.turn);
    s.dice = [];
    s.used = [];
    s.phase = 'rolling';
  }
  return s;
}

function isAllHome(state, c) {
  const [lo, hi] = homeRange(c);
  if (state.bar[c] > 0) return false;
  for (let i = 1; i <= 24; i++) {
    const p = state.points[i];
    if (p.color === c && p.count > 0 && (i < lo || i > hi)) return false;
  }
  return true;
}

// Ana yurttaki en geri pul: Beyaz için en küçük (19'a en yakın), Siyah için en büyük (6'ya en yakın)
function farthestInHome(state, c) {
  const [lo, hi] = homeRange(c);
  if (c === WHITE) {
    for (let i = lo; i <= hi; i++) {
      if (state.points[i].color === c && state.points[i].count > 0) return i;
    }
  } else {
    for (let i = hi; i >= lo; i--) {
      if (state.points[i].color === c && state.points[i].count > 0) return i;
    }
  }
  return null;
}

function pipNeededToBearOff(c, point) {
  // Beyaz: 19 → 6, 24 → 1; Siyah: 6 → 6, 1 → 1
  return c === WHITE ? 25 - point : point;
}

function canPlaceAt(state, target, c) {
  if (target < 1 || target > 24) return false;
  const p = state.points[target];
  if (p.count === 0) return true;
  if (p.color === c) return true;
  if (p.count === 1) return true; // kırma
  return false;
}

function legalMovesForDie(state, die) {
  const c = state.turn;
  const moves = [];
  // Bar'da pul varsa önce onu sokmak zorunlu
  if (state.bar[c] > 0) {
    const target = c === WHITE ? die : 25 - die;
    if (canPlaceAt(state, target, c)) {
      moves.push({ from: 'bar', to: target, die });
    }
    return moves;
  }
  for (let i = 1; i <= 24; i++) {
    const p = state.points[i];
    if (p.color !== c || p.count === 0) continue;
    const target = i + direction(c) * die;
    if (target >= 1 && target <= 24) {
      if (canPlaceAt(state, target, c)) {
        moves.push({ from: i, to: target, die });
      }
    } else if (isAllHome(state, c)) {
      // Toplama
      const needed = pipNeededToBearOff(c, i);
      if (die === needed) {
        moves.push({ from: i, to: 'off', die });
      } else if (die > needed && farthestInHome(state, c) === i) {
        moves.push({ from: i, to: 'off', die });
      }
    }
  }
  return moves;
}

function applyMoveRaw(state, move) {
  const c = state.turn;
  const s = clone(state);
  // Kaynak
  if (move.from === 'bar') {
    s.bar[c] -= 1;
  } else {
    s.points[move.from].count -= 1;
    if (s.points[move.from].count === 0) s.points[move.from].color = null;
  }
  // Hedef
  if (move.to === 'off') {
    s.off[c] += 1;
  } else {
    const tp = s.points[move.to];
    if (tp.color && tp.color !== c && tp.count === 1) {
      // Kırma
      s.bar[opponent(c)] += 1;
      tp.color = c;
      tp.count = 1;
    } else {
      tp.color = c;
      tp.count += 1;
    }
  }
  // Zarı tüket
  const idx = s.dice.indexOf(move.die);
  if (idx >= 0) {
    s.dice.splice(idx, 1);
    s.used.push(move.die);
  }
  return s;
}

// Maksimum uzunlukta hamle dizisi enumerasyonu
function enumerateMaxSequences(state) {
  let maxLen = 0;
  const best = [];
  function dfs(st, path) {
    if (st.dice.length === 0) {
      if (path.length > maxLen) { maxLen = path.length; best.length = 0; best.push(path.slice()); }
      else if (path.length === maxLen) best.push(path.slice());
      return;
    }
    const tried = new Set();
    let extended = false;
    const dieSet = [...new Set(st.dice)];
    for (const die of dieSet) {
      const moves = legalMovesForDie(st, die);
      for (const m of moves) {
        const key = m.from + '-' + m.to + '-' + m.die;
        if (tried.has(key)) continue;
        tried.add(key);
        extended = true;
        path.push(m);
        dfs(applyMoveRaw(st, m), path);
        path.pop();
      }
    }
    if (!extended) {
      if (path.length > maxLen) { maxLen = path.length; best.length = 0; best.push(path.slice()); }
      else if (path.length === maxLen) best.push(path.slice());
    }
  }
  dfs(state, []);
  return { sequences: best, maxLen };
}

function computeLegalMoves(state) {
  if (state.phase !== 'moving' || state.dice.length === 0) return [];
  const { sequences, maxLen } = enumerateMaxSequences(state);
  if (maxLen === 0) return [];
  const map = new Map();
  for (const seq of sequences) {
    if (seq.length === 0) continue;
    const m = seq[0];
    map.set(m.from + '-' + m.to + '-' + m.die, m);
  }
  // "Büyük zar zorunlu" kuralı: sadece tek zar oynanabiliyorsa ve iki farklı zar varsa,
  // büyük zarla oynanabilecek bir hamle varsa o tercih edilir.
  const distinct = new Set(state.dice);
  if (maxLen === 1 && distinct.size === 2) {
    const larger = Math.max(...state.dice);
    const largerMoves = [...map.values()].filter(m => m.die === larger);
    if (largerMoves.length > 0) return largerMoves;
  }
  return [...map.values()];
}

function applyMove(state, move) {
  const legal = computeLegalMoves(state);
  const match = legal.find(m => m.from === move.from && m.to === move.to && m.die === move.die);
  if (!match) throw new Error('Yasal olmayan hamle');
  let s = applyMoveRaw(state, match);
  // Kazanma kontrolü
  if (s.off[s.turn] === 15) {
    const winner = s.turn;
    const loser = opponent(winner);
    let marsType = 'normal';
    if (s.off[loser] === 0) {
      // Mars veya çift mars?
      const [lo, hi] = homeRange(winner);
      let inWinnerHome = false;
      for (let i = lo; i <= hi; i++) {
        if (s.points[i].color === loser && s.points[i].count > 0) { inWinnerHome = true; break; }
      }
      marsType = (s.bar[loser] > 0 || inWinnerHome) ? 'cift-mars' : 'mars';
    }
    s.phase = 'gameOver';
    s.winner = winner;
    s.marsType = marsType;
    return s;
  }
  // Sıra geçişi
  if (s.dice.length === 0 || computeLegalMoves(s).length === 0) {
    s.turn = opponent(s.turn);
    s.dice = [];
    s.used = [];
    s.phase = 'rolling';
  }
  return s;
}

function checkWin(state) {
  return state.phase === 'gameOver'
    ? { winner: state.winner, marsType: state.marsType }
    : null;
}

module.exports = {
  WHITE, BLACK,
  createInitialState,
  rollDice,
  performOpeningRoll,
  rollAndStart,
  legalMoves: computeLegalMoves,
  applyMove,
  applyMoveRaw,
  checkWin,
  isAllHome,
  opponent,
};
