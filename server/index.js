// Tavla WebSocket sunucusu
// - Tek odalı (basit) ve çoklu odalı mod
// - İki oyuncu eşleştir, oda kodu üret
// - Hamleyi motorda doğrula, state'i her iki istemciye broadcast et
// - Statik client/ klasörünü servisle

const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { WebSocketServer } = require('ws');
const G = require('./game');

const PORT = process.env.PORT || 3000;
const app = express();

// Statik istemci
const CLIENT_DIR = path.join(__dirname, '..', 'client');
app.use(express.static(CLIENT_DIR));
app.get('/', (req, res) => res.sendFile(path.join(CLIENT_DIR, 'index.html')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// === Oda yönetimi ===
const rooms = new Map(); // code -> { players:[{ws,color,name}], state, hostColor }

function newRoomCode() {
  // 6 haneli, çakışmasın
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(code));
  return code;
}

function send(ws, type, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, ...data }));
  }
}

function broadcastState(room) {
  for (const p of room.players) {
    // Yalnizca sirasi gelen oyuncuya yasal hamleler hesaplanir
    const movesForYou = (room.state.turn === p.color && room.state.phase === 'moving')
      ? G.legalMoves(room.state)
      : [];
    send(p.ws, 'state', {
      state: room.state,
      yourColor: p.color,
      roomCode: room.code,
      players: room.players.map(x => ({ color: x.color, name: x.name })),
      movesForYou,
    });
  }
}

function broadcastError(room, msg) {
  for (const p of room.players) send(p.ws, 'error', { message: msg });
}

function leaveRoom(ws) {
  for (const [code, room] of rooms) {
    const idx = room.players.findIndex(p => p.ws === ws);
    if (idx >= 0) {
      room.players.splice(idx, 1);
      // Diğer oyuncuya bildirim
      for (const p of room.players) send(p.ws, 'opponent_left', {});
      if (room.players.length === 0) rooms.delete(code);
      break;
    }
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
    handleMessage(ws, msg);
  });
  ws.on('close', () => leaveRoom(ws));
});

function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'create_room': {
      const code = newRoomCode();
      const room = {
        code,
        players: [{ ws, color: 'W', name: msg.name || 'Beyaz' }],
        state: G.createInitialState(),
        hostColor: 'W',
      };
      rooms.set(code, room);
      send(ws, 'room_created', { roomCode: code, yourColor: 'W' });
      broadcastState(room);
      return;
    }
    case 'join_room': {
      const room = rooms.get(msg.roomCode);
      if (!room) return send(ws, 'error', { message: 'Oda bulunamadı' });
      if (room.players.length >= 2) return send(ws, 'error', { message: 'Oda dolu' });
      const usedColors = new Set(room.players.map(p => p.color));
      const color = usedColors.has('W') ? 'B' : 'W';
      room.players.push({ ws, color, name: msg.name || (color === 'W' ? 'Beyaz' : 'Siyah') });
      send(ws, 'room_joined', { roomCode: room.code, yourColor: color });
      // İkisi de bağlıysa açılış zarını at
      if (room.players.length === 2 && room.state.phase === 'opening') {
        try { room.state = G.performOpeningRoll(room.state); } catch (e) { /* yoksay */ }
      }
      broadcastState(room);
      return;
    }
    case 'roll': {
      const room = findRoomByWs(ws);
      if (!room) return;
      const me = room.players.find(p => p.ws === ws);
      if (room.state.turn !== me.color) return send(ws, 'error', { message: 'Sıra senin değil' });
      if (room.state.phase !== 'rolling') return send(ws, 'error', { message: 'Şu an zar atılamaz' });
      try {
        room.state = G.rollAndStart(room.state);
        broadcastState(room);
      } catch (e) { send(ws, 'error', { message: e.message }); }
      return;
    }
    case 'move': {
      const room = findRoomByWs(ws);
      if (!room) return;
      const me = room.players.find(p => p.ws === ws);
      if (room.state.turn !== me.color) return send(ws, 'error', { message: 'Sıra senin değil' });
      try {
        room.state = G.applyMove(room.state, msg.move);
        broadcastState(room);
      } catch (e) { send(ws, 'error', { message: e.message }); }
      return;
    }
    case 'new_game': {
      const room = findRoomByWs(ws);
      if (!room) return;
      room.state = G.createInitialState();
      if (room.players.length === 2) {
        try { room.state = G.performOpeningRoll(room.state); } catch (_) {}
      }
      broadcastState(room);
      return;
    }
    case 'chat': {
      const room = findRoomByWs(ws);
      if (!room) return;
      const me = room.players.find(p => p.ws === ws);
      for (const p of room.players) send(p.ws, 'chat', { from: me.color, text: String(msg.text || '').slice(0, 200) });
      return;
    }
    default:
      send(ws, 'error', { message: 'Bilinmeyen mesaj' });
  }
}

function findRoomByWs(ws) {
  for (const room of rooms.values()) {
    if (room.players.some(p => p.ws === ws)) return room;
  }
  return null;
}

// IPv4 adreslerini logla (yerel ağ ipucu)
function getLocalIPs() {
  const os = require('os');
  const ifs = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifs)) {
    for (const iface of ifs[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}

server.listen(PORT, () => {
  const ips = getLocalIPs();
  console.log('=================================');
  console.log(' Tavla sunucusu çalışıyor');
  console.log('=================================');
  console.log(' Kendi bilgisayarında:  http://localhost:' + PORT);
  for (const ip of ips) {
    console.log(' Yerel ağdan:          http://' + ip + ':' + PORT);
  }
  console.log('=================================');
  console.log(' İkinci oyuncu yukarıdaki "Yerel ağ" adresini açsın.');
  console.log(' İlk oyuncu odayı oluşturur, oda kodunu rakibe verir.');
});
