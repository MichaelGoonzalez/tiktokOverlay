/**
 * TikTok Live Game Overlay - Server
 * by SurLab Studio
 * 
 * Corre en tu PC, recibe eventos de TikTok Live en tiempo real
 * y los manda al overlay via Socket.IO.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// ─── Intenta cargar tiktok-live-connector ───────────────────────────────────
let WebcastPushConnection;
try {
  const mod = require('tiktok-live-connector');
  WebcastPushConnection = mod.TikTokLiveConnection;
  console.log('[TikTok] Módulo cargado:', typeof WebcastPushConnection);
} catch (e) {
  console.warn('[TikTok] Error:', e.message);
}

// ─── Config ─────────────────────────────────────────────────────────────────
const PORT        = 3000;
const TIKTOK_USER = process.env.TIKTOK_USER || 'TU_USUARIO_AQUI'; // ← cambia esto

// ─── Express + Socket.IO ────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ─── Estado del juego ───────────────────────────────────────────────────────
const gameState = {
  likes:       0,
  comments:    0,
  coins:       0,
  viewers:     0,
  bossHp:      1000,
  bossMaxHp:   1000,
  bossName:    '1000 SEGUIDORES',
  playerXp:    0,
  playerLevel: 1,
  xpToNext:    500,
  combo:       1,
  comboTimer:  null,
};

function bumpCombo() {
  gameState.combo = Math.min(gameState.combo + 1, 10);
  clearTimeout(gameState.comboTimer);
  gameState.comboTimer = setTimeout(() => {
    gameState.combo = 1;
    io.emit('state', sanitize(gameState));
  }, 3000);
}

function dealDamage(dmg) {
  const total = Math.max(1, Math.round(dmg * gameState.combo));
  gameState.bossHp -= total;
  if (gameState.bossHp <= 0) {
    gameState.bossHp = 0;
    io.emit('boss_dead', { name: gameState.bossName });
    // Nuevo boss después de 3 segundos
    setTimeout(() => {
      gameState.bossMaxHp = Math.round(gameState.bossMaxHp * 1.8);
      gameState.bossHp    = gameState.bossMaxHp;
      const bosses = ['5000 SEGUIDORES', '10K VIEWERS', 'VIRAL x2', 'TRENDING'];
      gameState.bossName = bosses[Math.floor(Math.random() * bosses.length)];
      gameState.playerLevel++;
      io.emit('new_boss', { name: gameState.bossName, hp: gameState.bossMaxHp });
      io.emit('state', sanitize(gameState));
    }, 3000);
  }
  gainXp(Math.round(total * 0.3));
  return total;
}

function gainXp(amount) {
  gameState.playerXp += amount;
  if (gameState.playerXp >= gameState.xpToNext) {
    gameState.playerXp   = gameState.playerXp - gameState.xpToNext;
    gameState.xpToNext   = Math.round(gameState.xpToNext * 1.5);
    gameState.playerLevel++;
    io.emit('level_up', { level: gameState.playerLevel });
  }
}

function sanitize(s) {
  return {
    likes:       s.likes,
    comments:    s.comments,
    coins:       s.coins,
    viewers:     s.viewers,
    bossHp:      Math.max(0, s.bossHp),
    bossMaxHp:   s.bossMaxHp,
    bossName:    s.bossName,
    playerXp:    s.playerXp,
    xpToNext:    s.xpToNext,
    playerLevel: s.playerLevel,
    combo:       s.combo,
  };
}

// ─── Socket.IO: clientes (overlay) ─────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('[Overlay] conectado');
  socket.emit('state', sanitize(gameState));
});

// ─── TikTok Live ────────────────────────────────────────────────────────────
function connectTikTok() {
  if (!WebcastPushConnection) {
    console.log('[TikTok] Módulo no disponible. Usando modo demo.');
    startDemoMode();
    return;
  }

  if (TIKTOK_USER === 'TU_USUARIO_AQUI') {
    console.log('[TikTok] ⚠  Pon tu usuario de TikTok en server.js o con:');
    console.log('         TIKTOK_USER=@tuusuario node server.js');
    console.log('[TikTok] Iniciando modo DEMO para ver el overlay...');
    startDemoMode();
    return;
  }

  const connection = new WebcastPushConnection(TIKTOK_USER, {});

  connection.connect()
    .then(state => console.log(`[TikTok] Conectado a ${TIKTOK_USER} - roomId: ${state.roomId}`))
    .catch(err  => {
      console.error('[TikTok] Error de conexión:', err.message);
      console.log('[TikTok] Iniciando modo DEMO...');
      startDemoMode();
    });

  // ── Likes / corazones ──
  connection.on('like', (data) => {
    const n = data.likeCount || 1;
    gameState.likes += n;
    bumpCombo();
    const dmg = dealDamage(n * 1);
    io.emit('event', { type: 'like', user: data.nickname || 'alguien', count: n, damage: dmg });
    io.emit('state', sanitize(gameState));
  });

  // ── Comentarios ──
  connection.on('chat', (data) => {
    gameState.comments++;
    bumpCombo();
    const dmg = dealDamage(3);
    io.emit('event', {
      type:    'comment',
      user:    data.nickname || 'alguien',
      comment: data.comment  || '',
      damage:  dmg,
    });
    io.emit('state', sanitize(gameState));
  });

  // ── Gifts / donaciones ──
  connection.on('gift', (data) => {
    const diamonds = (data.diamondCount || 1) * (data.repeatCount || 1);
    gameState.coins += diamonds;
    bumpCombo();
    const dmg = dealDamage(diamonds * 2);
    io.emit('event', {
      type:     'gift',
      user:     data.nickname  || 'alguien',
      gift:     data.giftName  || 'regalo',
      diamonds: diamonds,
      damage:   dmg,
    });
    io.emit('state', sanitize(gameState));
  });

  // ── Seguidores ──
  connection.on('follow', (data) => {
    io.emit('event', { type: 'follow', user: data.nickname || 'alguien' });
    bumpCombo();
    dealDamage(5);
    io.emit('state', sanitize(gameState));
  });

  // ── Share ──
  connection.on('share', (data) => {
    io.emit('event', { type: 'share', user: data.nickname || 'alguien' });
    bumpCombo();
    dealDamage(8);
    io.emit('state', sanitize(gameState));
  });

  // ── Viewers ──
  connection.on('roomUser', (data) => {
    if (data.viewerCount) {
      gameState.viewers = data.viewerCount;
      io.emit('state', sanitize(gameState));
    }
  });

  connection.on('disconnected', () => {
    console.log('[TikTok] Desconectado. Reconectando en 10s...');
    setTimeout(connectTikTok, 10000);
  });
}

// ─── Modo DEMO (sin stream activo) ─────────────────────────────────────────
function startDemoMode() {
  const demoUsers = ['fan_123','gamer_pro','corazon99','pixel_girl','dark_xX','mikey_fan'];
  const demoComments = ['dale!','qué bueno','te sigo','gg','hermoso stream','ayuda al boss'];

  setInterval(() => {
    const r = Math.random();
    const user = demoUsers[Math.floor(Math.random() * demoUsers.length)];
    if (r < 0.5) {
      // like demo
      gameState.likes += 3;
      bumpCombo();
      const dmg = dealDamage(3);
      io.emit('event', { type: 'like', user, count: 3, damage: dmg });
    } else if (r < 0.78) {
      // comment demo
      gameState.comments++;
      bumpCombo();
      const dmg = dealDamage(3);
      io.emit('event', { type: 'comment', user, comment: demoComments[Math.floor(Math.random()*demoComments.length)], damage: dmg });
    } else if (r < 0.93) {
      // follow demo
      io.emit('event', { type: 'follow', user });
      bumpCombo();
      dealDamage(5);
    } else {
      // gift demo
      const diamonds = Math.floor(Math.random() * 50) + 10;
      gameState.coins += diamonds;
      bumpCombo();
      const dmg = dealDamage(diamonds * 2);
      io.emit('event', { type: 'gift', user, gift: 'Rosa', diamonds, damage: dmg });
    }
    gameState.viewers = Math.floor(Math.random() * 50) + 10;
    io.emit('state', sanitize(gameState));
  }, 1200);
}

// ─── Arranque ────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   TikTok Game Overlay  -  SurLab Studio  ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`  Servidor:  http://localhost:${PORT}`);
  console.log(`  Overlay:   http://localhost:${PORT}/overlay.html`);
  console.log('  (pega esa URL como Browser Source en Live Studio)');
  console.log('');
  connectTikTok();
});
