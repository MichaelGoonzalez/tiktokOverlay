const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

let WebcastPushConnection;

const PORT = 3000;
const TIKTOK_USER = process.env.TIKTOK_USER || "TU_USUARIO_AQUI";
const DISPLAY_USER = TIKTOK_USER.replace(/^@/, "");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));

const EMOJIS = ["🧙", "🗡️", "🏹", "⚔️", "🛡️", "🧝", "🧛", "🧟", "🐉", "🦸", "🦹", "🤺", "🧞", "🧜", "🐺", "🦅"];

function getRandomEmoji() {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
}

function getXpToNext(level) {
  return level * 100;
}

function baseHp(level, donations) {
  return 100 + (level - 1) * 15 + (donations || 0);
}

function calcDamage(attackerLevel) {
  return Math.max(1, attackerLevel * 4 + Math.floor(Math.random() * 12));
}

const gameState = {
  likes: 0,
  coins: 0,
  viewers: 0,
  username: DISPLAY_USER,
  arenaLevel: 1,
  arenaXp: 0,
  arenaXpNext: 500,
  fighters: {},
  rankings: [],
  battleLog: null,
};

function ensureFighter(username) {
  if (!gameState.fighters[username]) {
    gameState.fighters[username] = {
      xp: 0,
      level: 1,
      xpToNext: getXpToNext(1),
      hp: baseHp(1, 0),
      maxHp: baseHp(1, 0),
      donations: 0,
      wins: 0,
      losses: 0,
      emoji: getRandomEmoji(),
    };
  }
  return gameState.fighters[username];
}

function addFighterXp(username, amount) {
  const f = gameState.fighters[username];
  if (!f) return false;
  f.xp += amount;
  let leveledUp = false;
  while (f.xp >= f.xpToNext) {
    f.xp -= f.xpToNext;
    f.level++;
    f.xpToNext = getXpToNext(f.level);
    f.maxHp = baseHp(f.level, f.donations);
    f.hp = Math.min(f.hp + 25, f.maxHp);
    leveledUp = true;
  }
  if (leveledUp) {
    io.emit("fighter_levelup", { username, level: f.level, emoji: f.emoji });
  }
  updateRankings();
  return leveledUp;
}

function updateRankings() {
  gameState.rankings = Object.entries(gameState.fighters)
    .sort((a, b) => b[1].level - a[1].level || b[1].hp - a[1].hp)
    .map(([name]) => name);
}

function runBattleTick() {
  if (gameState.rankings.length < 2) return;
  const challengerName = gameState.rankings[1];
  const championName = gameState.rankings[0];
  const challenger = gameState.fighters[challengerName];
  const champion = gameState.fighters[championName];
  if (!challenger || !champion) return;

  const damage = calcDamage(challenger.level);
  champion.hp = Math.max(0, champion.hp - damage);

  const result = {
    champion: championName,
    challenger: challengerName,
    cEmoji: champion.emoji,
    chEmoji: challenger.emoji,
    cLevel: champion.level,
    chLevel: challenger.level,
    cHp: champion.hp,
    cMaxHp: champion.maxHp,
    chHp: challenger.hp,
    chMaxHp: challenger.maxHp,
    damage,
    attacker: challengerName,
  };

  if (champion.hp <= 0) {
    champion.losses++;
    challenger.wins++;
    gameState.rankings[0] = challengerName;
    gameState.rankings[1] = championName;
    updateRankings();

    champion.hp = Math.round(champion.maxHp * 0.6);
    challenger.hp = Math.min(challenger.maxHp, challenger.hp + 30);

    result.swapped = true;
    result.winner = challengerName;
    result.loser = championName;
    io.emit("battle_swap", {
      winner: challengerName,
      loser: championName,
      wEmoji: challenger.emoji,
      lEmoji: champion.emoji,
      wLevel: challenger.level,
      lLevel: champion.level,
    });
  }

  gameState.battleLog = result;
  io.emit("battle_tick", result);
  io.emit("state", sanitizeState());
}

function sanitizeState() {
  const fightersClean = {};
  for (const [name, f] of Object.entries(gameState.fighters)) {
    fightersClean[name] = {
      level: f.level,
      xp: f.xp,
      xpToNext: f.xpToNext,
      hp: f.hp,
      maxHp: f.maxHp,
      wins: f.wins,
      losses: f.losses,
      emoji: f.emoji,
      donations: f.donations,
    };
  }
  return {
    likes: gameState.likes,
    coins: gameState.coins,
    viewers: gameState.viewers,
    username: gameState.username,
    arenaLevel: gameState.arenaLevel,
    arenaXp: gameState.arenaXp,
    arenaXpNext: gameState.arenaXpNext,
    fighters: fightersClean,
    rankings: gameState.rankings,
    battleLog: gameState.battleLog,
  };
}

function addArenaXp(amount) {
  gameState.arenaXp += amount;
  if (gameState.arenaXp >= gameState.arenaXpNext) {
    gameState.arenaXp -= gameState.arenaXpNext;
    gameState.arenaLevel++;
    gameState.arenaXpNext = Math.round(gameState.arenaXpNext * 1.4);
    io.emit("arena_levelup", { level: gameState.arenaLevel });
  }
}

io.on("connection", (socket) => {
  socket.emit("state", sanitizeState());
});

function connectTikTok() {
  if (!WebcastPushConnection) { startDemoMode(); return; }
  if (TIKTOK_USER === "TU_USUARIO_AQUI") { startDemoMode(); return; }

  const connection = new WebcastPushConnection(TIKTOK_USER, {});
  connection.connect()
    .then(() => console.log(`[TikTok] Conectado a ${TIKTOK_USER}`))
    .catch(() => { startDemoMode(); });

  connection.on("like", (data) => {
    const n = data.count || 1;
    gameState.likes = parseInt(data.total) || gameState.likes + n;
    const user = data.user?.nickname || "alguien";
    addArenaXp(n);
    ensureFighter(user);
    const f = gameState.fighters[user];
    f.maxHp = baseHp(f.level, f.donations) + Math.floor(gameState.likes / 10);
    f.hp = Math.min(f.hp + n * 2, f.maxHp);
    addFighterXp(user, 5 * n);
    io.emit("event", { type: "like", user, count: n });
    io.emit("state", sanitizeState());
  });

  connection.on("gift", (data) => {
    const diamonds = (data.diamondCount || 1) * (data.repeatCount || 1);
    gameState.coins += diamonds;
    const user = data.user.nickname || "alguien";
    addArenaXp(diamonds);
    ensureFighter(user);
    const f = gameState.fighters[user];
    f.donations = (f.donations || 0) + diamonds;
    f.maxHp = baseHp(f.level, f.donations);
    f.hp = Math.min(f.hp + diamonds * 3, f.maxHp);
    addFighterXp(user, 20 + diamonds * 2);
    io.emit("event", { type: "gift", user, gift: data.giftName || "regalo", diamonds });
    io.emit("state", sanitizeState());
  });

  connection.on("follow", (data) => {
    const user = data.nickname || "alguien";
    ensureFighter(user);
    addFighterXp(user, 10);
    io.emit("event", { type: "follow", user });
    io.emit("state", sanitizeState());
  });

  connection.on("share", (data) => {
    const user = data.nickname || "alguien";
    ensureFighter(user);
    addFighterXp(user, 8);
    io.emit("event", { type: "share", user });
    io.emit("state", sanitizeState());
  });

  connection.on("chat", (data) => {
    const user = data.user.nickname || "alguien";
    ensureFighter(user);
    addFighterXp(user, 2);
    io.emit("event", { type: "comment", user, comment: data.content || "" });
    io.emit("state", sanitizeState());
  });

  connection.on("roomUser", (data) => {
    if (data.total) {
      gameState.viewers = data.total;
      io.emit("state", sanitizeState());
    }
  });

  connection.on("disconnected", () => {
    setTimeout(connectTikTok, 10000);
  });
}

function startDemoMode() {
  const demoUsers = ["fan_123", "gamer_pro", "corazon99", "pixel_girl", "dark_xX", "mikey_fan", "luna_star", "boss_king"];
  for (const u of demoUsers) {
    ensureFighter(u);
    const f = gameState.fighters[u];
    f.level = 1 + Math.floor(Math.random() * 4);
    f.xp = Math.floor(Math.random() * f.xpToNext);
    f.donations = Math.floor(Math.random() * 50);
    f.maxHp = baseHp(f.level, f.donations);
    f.hp = Math.floor(f.maxHp * (0.3 + Math.random() * 0.7));
  }
  updateRankings();
  io.emit("state", sanitizeState());

  setInterval(() => {
    const user = demoUsers[Math.floor(Math.random() * demoUsers.length)];
    const r = Math.random();
    if (r < 0.4) {
      gameState.likes += 3;
      addArenaXp(3);
      ensureFighter(user);
      const f = gameState.fighters[user];
      f.maxHp = baseHp(f.level, f.donations);
      f.hp = Math.min(f.hp + 6, f.maxHp);
      addFighterXp(user, 10);
      io.emit("event", { type: "like", user, count: 3 });
    } else if (r < 0.65) {
      const diamonds = Math.floor(Math.random() * 20) + 3;
      gameState.coins += diamonds;
      addArenaXp(diamonds);
      ensureFighter(user);
      const f = gameState.fighters[user];
      f.donations = (f.donations || 0) + diamonds;
      f.maxHp = baseHp(f.level, f.donations);
      f.hp = Math.min(f.hp + diamonds * 3, f.maxHp);
      addFighterXp(user, 20 + diamonds * 2);
      io.emit("event", { type: "gift", user, gift: "Rosa", diamonds });
    } else {
      ensureFighter(user);
      addFighterXp(user, 8);
      io.emit("event", { type: "follow", user });
    }
    gameState.viewers = Math.floor(Math.random() * 30) + 8;
    io.emit("state", sanitizeState());
  }, 2200);
}

async function start() {
  try {
    const mod = await import("tiktok-live-connector");
    WebcastPushConnection = mod.TikTokLiveConnection;
  } catch (e) {
    console.warn("[TikTok] Modo demo (sin conexion TikTok)");
  }

  server.listen(PORT, () => {
    console.log("");
    console.log("╔══════════════════════════════════════════╗");
    console.log("║    TikTok Arena RPG  -  SurLab Studio    ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log(`  Servidor:  http://localhost:${PORT}`);
    console.log(`  Overlay:   http://localhost:${PORT}/overlay.html`);
    console.log("");
    connectTikTok();
    setInterval(runBattleTick, 3000);
  });
}

start();
