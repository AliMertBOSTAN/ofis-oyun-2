// Iki simule istemci ile bastan sona akis testi:
// 1) Bagla, oda olustur
// 2) Ikinci istemci katil
// 3) Acilis zari atilsin, sirasi gelen oyuncu hamle yapsin
// 4) Hamle isle, state guncellensin

const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 3778;
let serverProc;

function startServer() {
  return new Promise(/** @param {(v?: void) => void} resolve */ (resolve) => {
    serverProc = spawn('node', ['server/index.js'], {
      env: { ...process.env, PORT: String(PORT) },
      cwd: __dirname + '/..',
    });
    let buf = '';
    serverProc.stdout.on('data', (d) => {
      buf += d.toString();
      if (buf.includes('Tavla sunucusu')) resolve();
    });
    serverProc.stderr.on('data', (d) => process.stderr.write(d));
  });
}

function client(label) {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const messages = [];
  let openResolve;
  const opened = new Promise((r) => { openResolve = r; });
  ws.on('open', () => openResolve());
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    messages.push(m);
    console.log(`  [${label}] <-`, m.type, m.type === 'state' ? `(turn=${m.state.turn}, phase=${m.state.phase}, dice=${JSON.stringify(m.state.dice)}, mine=${m.yourColor}, moves=${(m.movesForYou||[]).length})` : '');
  });
  return {
    ws,
    opened,
    messages,
    send: (obj) => ws.send(JSON.stringify(obj)),
    waitFor: (typeFn, timeoutMs = 2000) => new Promise((resolve, reject) => {
      const checkExisting = messages.find(typeFn);
      if (checkExisting) return resolve(checkExisting);
      const onMsg = (raw) => {
        const m = JSON.parse(raw.toString());
        if (typeFn(m)) { ws.off('message', onMsg); resolve(m); }
      };
      ws.on('message', onMsg);
      setTimeout(() => { ws.off('message', onMsg); reject(new Error('timeout: ' + typeFn.toString())); }, timeoutMs);
    }),
  };
}

(async () => {
  await startServer();
  await new Promise(r => setTimeout(r, 200));

  console.log('1) Oyuncu A baglaniyor ve oda olusturuyor...');
  const a = client('A');
  await a.opened;
  a.send({ type: 'create_room', name: 'Ali' });
  const created = await a.waitFor(m => m.type === 'room_created');
  const code = created.roomCode;
  console.log('   Oda kodu:', code);

  console.log('2) Oyuncu B katiliyor...');
  const b = client('B');
  await b.opened;
  b.send({ type: 'join_room', roomCode: code, name: 'Mert' });

  // Iki taraf da state alacak; acilis zari atilmis olmali
  const aState = await a.waitFor(m => m.type === 'state' && m.state.phase === 'moving');
  await b.waitFor(m => m.type === 'state' && m.state.phase === 'moving');
  console.log('   Acilis sonrasi sira:', aState.state.turn, ' zarlar:', aState.state.dice);

  console.log('3) Sirasi gelen oyuncu bir hamle yapiyor...');
  const turn = aState.state.turn;
  const mover = turn === 'W' ? a : b;
  const moverLabel = turn === 'W' ? 'A (W)' : 'B (B)';
  const moverState = await mover.waitFor(m => m.type === 'state' && m.state.turn === turn && (m.movesForYou || []).length > 0, 3000);
  const moves = moverState.movesForYou;
  console.log('   ' + moverLabel + ' icin ' + moves.length + ' yasal hamle var. Ilki:', moves[0]);
  mover.send({ type: 'move', move: moves[0] });

  // Sunucudan yeni state gelsin
  const after = await mover.waitFor(m => m.type === 'state' && (m.state.used.length > 0 || m.state.turn !== turn), 2000);
  console.log('   Hamle sonrasi: turn=' + after.state.turn + ', dice=' + JSON.stringify(after.state.dice) + ', used=' + JSON.stringify(after.state.used));

  console.log('4) Tek pulun konumunu dogrula (motor durumu)...');
  const move = moves[0];
  if (typeof move.from === 'number' && typeof move.to === 'number') {
    const dst = after.state.points[move.to];
    if (!dst || dst.color !== turn || dst.count === 0) throw new Error('Hedef noktada hamle yapan rengin pulu olmali');
    console.log('   Nokta ' + move.to + ' = ', dst);
  }

  console.log('\nSMOKE TEST GECTI ✓');
  a.ws.close(); b.ws.close();
  serverProc.kill();
  process.exit(0);
})().catch((e) => {
  console.error('SMOKE TEST BASARISIZ:', e.message);
  if (serverProc) serverProc.kill();
  process.exit(1);
});
