import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import {
  CONFIG,
  advanceTurn,
  borrow,
  buyBond,
  buyStock,
  cancelOrder,
  createGame,
  getPlayerSummary,
  getRanking,
  placeLimitOrder,
  repay,
  sellStock,
  turnDurationSeconds,
  useRandomItem,
  useSpecialItem,
} from "./engine.js";

const sourceRoot = fileURLToPath(new URL(".", import.meta.url));
const root = process.env.STATIC_ROOT ? resolve(sourceRoot, process.env.STATIC_ROOT) : sourceRoot;
const port = Number(process.env.PORT || 4173);
const rooms = new Map();
const allowedOrigins = new Set(String(process.env.ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) request.destroy();
    });
    request.on("end", () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error("요청 형식이 올바르지 않습니다.")); }
    });
    request.on("error", reject);
  });
}

function cleanNickname(value) {
  const nickname = String(value || "").trim().slice(0, 14);
  if (!nickname) throw new Error("닉네임을 입력하세요.");
  return nickname.replace(/[<>]/g, "");
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    const bytes = randomBytes(6);
    code = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  } while (rooms.has(code));
  return code;
}

function roomFor(code) {
  const room = rooms.get(String(code || "").toUpperCase());
  if (!room) throw new Error("방을 찾을 수 없습니다.");
  return room;
}

function memberFor(room, token) {
  const member = room.members.find((candidate) => candidate.token === token);
  if (!member) throw new Error("참가 세션이 만료되었습니다.");
  return member;
}

function topHolding(game, playerId) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) return null;
  const priceIndex = Math.min(game.turn - 1, CONFIG.totalTurns);
  let best = null;
  player.holdings.forEach((quantity, stockIndex) => {
    if (quantity <= 0) return;
    const stock = game.stocks[stockIndex];
    const value = quantity * stock.prices[priceIndex];
    if (!best || value > best.value) {
      best = { stockIndex, name: stock.name, ticker: stock.ticker, flag: stock.market.flag, quantity, value };
    }
  });
  return best;
}

function enrichRanking(room, ranking) {
  return ranking.map((entry) => ({
    ...entry,
    movement: room.rankMovements?.get(entry.playerId) || 0,
    assetRiseStreak: room.assetStreaks?.get(entry.playerId) || 0,
    topStock: topHolding(room.game, entry.playerId),
  }));
}

function initializeRankTracking(room) {
  const ranking = getRanking(room.game, { display: false });
  room.lastRanks = new Map(ranking.map((entry) => [entry.playerId, entry.rank]));
  room.lastAssets = new Map(ranking.map((entry) => [entry.playerId, entry.assets]));
  room.rankMovements = new Map();
  room.assetStreaks = new Map();
  room.rankAnimationTurn = 0;
}

function updateRankTracking(room) {
  const ranking = getRanking(room.game, { display: false });
  const movements = new Map();
  const streaks = new Map();
  for (const entry of ranking) {
    const previousRank = room.lastRanks.get(entry.playerId) ?? entry.rank;
    const previousAssets = room.lastAssets.get(entry.playerId) ?? entry.assets;
    movements.set(entry.playerId, previousRank - entry.rank);
    streaks.set(entry.playerId, entry.assets > previousAssets ? (room.assetStreaks.get(entry.playerId) || 0) + 1 : 0);
  }
  room.rankMovements = movements;
  room.assetStreaks = streaks;
  room.lastRanks = new Map(ranking.map((entry) => [entry.playerId, entry.rank]));
  room.lastAssets = new Map(ranking.map((entry) => [entry.playerId, entry.assets]));
  room.rankAnimationTurn = room.game.turn;
}

function publicState(room, member) {
  const base = {
    room: {
      code: room.code,
      status: room.status,
      speed: room.speed,
      createdAt: room.createdAt,
      memberCount: room.members.length,
      capacity: CONFIG.playerCount,
      deadline: room.deadline,
      durationSeconds: room.game ? turnDurationSeconds(room.game.turn, room.speed) : 0,
      members: room.members.map((entry) => ({
        playerId: entry.playerId,
        nickname: entry.nickname,
        isHost: entry.isHost,
        connected: room.clients.has(entry.token),
      })),
    },
    viewer: { playerId: member.playerId, nickname: member.nickname, isHost: member.isHost },
    game: null,
  };
  if (!room.game) return base;

  const game = room.game;
  const viewer = game.players.find((player) => player.id === member.playerId);
  if (!viewer) throw new Error("게임 참가자 정보를 찾을 수 없습니다.");
  const revealedPriceCount = Math.min(game.turn, CONFIG.totalTurns + 1);
  const rankingBlocked = game.rankBlindTurn === game.turn;
  const checkpoint = game.turn % 10 === 0 && !game.finished;
  const visibleRanking = rankingBlocked ? [] : enrichRanking(room, getRanking(game, { display: true, viewerId: member.playerId }));
  base.game = {
    version: game.version,
    turn: game.turn,
    finished: game.finished,
    stocks: game.stocks.map((stock) => ({
      ...stock,
      prices: stock.prices.map((price, index) => index < revealedPriceCount ? price : null),
      candles: stock.candles.map((candle, index) => index < revealedPriceCount ? candle : null),
    })),
    players: game.players.map((player) => player.id === member.playerId
      ? { ...player, bonds: player.bonds.map((bond) => ({ ...bond })), orders: player.orders.map((order) => ({ ...order })) }
      : { id: player.id, nickname: player.nickname, isHuman: player.isHuman }),
    viewerSummary: getPlayerSummary(game, member.playerId),
    displayRanking: visibleRanking,
    actualRanking: rankingBlocked || checkpoint ? visibleRanking : enrichRanking(room, getRanking(game, { display: false, viewerId: member.playerId })),
    rankAnimationTurn: room.rankAnimationTurn,
    finalRanking: game.finished ? game.finalRanking : [],
    rankBlindTurn: game.rankBlindTurn,
    logs: game.logs.filter((log) => !log.playerId || log.playerId === member.playerId),
    reveal: game.reveal?.playerId === member.playerId ? game.reveal : null,
  };
  return base;
}

function broadcast(room) {
  for (const [token, response] of room.clients) {
    try {
      const member = memberFor(room, token);
      response.write(`data: ${JSON.stringify(publicState(room, member))}\n\n`);
    } catch {
      response.end();
      room.clients.delete(token);
    }
  }
}

function createRoom({ nickname, speed }) {
  const code = roomCode();
  const token = randomUUID();
  const member = { token, playerId: "PLAYER-001", nickname: cleanNickname(nickname), isHost: true };
  const room = {
    code,
    speed: ["turbo", "fast", "standard", ...(process.env.NODE_ENV === "test" ? ["test"] : [])].includes(speed) ? speed : "turbo",
    status: "waiting",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deadline: null,
    members: [member],
    clients: new Map(),
    game: null,
  };
  rooms.set(code, room);
  return { room, member };
}

function joinRoom(room, nickname) {
  if (room.status !== "waiting") throw new Error("이미 시작된 방에는 새로 참가할 수 없습니다.");
  if (room.members.length >= CONFIG.playerCount) throw new Error("방이 가득 찼습니다.");
  const clean = cleanNickname(nickname);
  if (room.members.some((member) => member.nickname.toLowerCase() === clean.toLowerCase())) throw new Error("이미 사용 중인 닉네임입니다.");
  const token = randomUUID();
  const member = {
    token,
    playerId: `PLAYER-${String(room.members.length + 1).padStart(3, "0")}`,
    nickname: clean,
    isHost: false,
  };
  room.members.push(member);
  room.updatedAt = Date.now();
  broadcast(room);
  return member;
}

function leaveRoom(room, member) {
  const response = room.clients.get(member.token);
  if (response) response.end();
  room.clients.delete(member.token);
  room.members = room.members.filter((candidate) => candidate.token !== member.token);
  if (room.game) {
    const player = room.game.players.find((candidate) => candidate.id === member.playerId);
    if (player && !room.game.finished) player.isHuman = false;
  }
  if (member.isHost && room.members.length) room.members[0].isHost = true;
  room.updatedAt = Date.now();
  if (!room.members.length) rooms.delete(room.code);
  else broadcast(room);
}

function startRoom(room, member) {
  if (!member.isHost) throw new Error("방장만 게임을 시작할 수 있습니다.");
  if (room.status !== "waiting") throw new Error("이미 시작된 게임입니다.");
  const game = createGame({ nickname: room.members[0].nickname, seed: Date.now() });
  room.members.forEach((joined, index) => {
    const player = game.players[index];
    player.id = joined.playerId;
    player.nickname = joined.nickname;
    player.isHuman = true;
  });
  room.game = game;
  initializeRankTracking(room);
  room.status = "running";
  room.updatedAt = Date.now();
  room.deadline = Date.now() + turnDurationSeconds(game.turn, room.speed) * 1000;
  broadcast(room);
}

function applyAction(room, member, type, payload = {}) {
  if (room.status !== "running" || !room.game || room.game.finished) throw new Error("진행 중인 게임이 아닙니다.");
  const game = room.game;
  const playerId = member.playerId;
  switch (type) {
    case "trade":
      return payload.side === "sell"
        ? sellStock(game, Number(payload.stockIndex), Number(payload.quantity), playerId)
        : buyStock(game, Number(payload.stockIndex), Number(payload.quantity), playerId);
    case "limit-order":
      return placeLimitOrder(game, {
        stockIndex: Number(payload.stockIndex),
        quantity: Number(payload.quantity),
        limitPrice: Number(payload.limitPrice),
        side: payload.side,
      }, playerId);
    case "cancel-order": return cancelOrder(game, String(payload.orderId), playerId);
    case "borrow": return borrow(game, Number(payload.amount), playerId);
    case "repay": return repay(game, Number(payload.amount), playerId);
    case "bond": return buyBond(game, Number(payload.amount), playerId);
    case "special-item": return useSpecialItem(game, String(payload.itemId), payload.options || {}, playerId);
    case "random-item": return useRandomItem(game, String(payload.itemId), playerId);
    default: throw new Error("지원하지 않는 행동입니다.");
  }
}

async function handleApi(request, response, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const body = await readJson(request);
      const { room, member } = createRoom(body);
      sendJson(response, 201, { token: member.token, state: publicState(room, member) });
      return true;
    }
    if (request.method === "POST" && parts.length === 4 && parts[0] === "api" && parts[1] === "rooms" && parts[3] === "join") {
      const room = roomFor(parts[2]);
      const body = await readJson(request);
      const member = joinRoom(room, body.nickname);
      sendJson(response, 200, { token: member.token, state: publicState(room, member) });
      return true;
    }
    if (parts.length >= 3 && parts[0] === "api" && parts[1] === "rooms") {
      const room = roomFor(parts[2]);
      const token = url.searchParams.get("token") || request.headers["x-session-token"];
      const member = memberFor(room, token);
      if (request.method === "GET" && parts.length === 4 && parts[3] === "state") {
        sendJson(response, 200, publicState(room, member));
        return true;
      }
      if (request.method === "GET" && parts.length === 4 && parts[3] === "events") {
        response.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        room.clients.set(token, response);
        broadcast(room);
        request.on("close", () => {
          if (room.clients.get(token) === response) room.clients.delete(token);
          setTimeout(() => broadcast(room), 0);
        });
        return true;
      }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "start") {
        startRoom(room, member);
        sendJson(response, 200, publicState(room, member));
        return true;
      }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "leave") {
        leaveRoom(room, member);
        sendJson(response, 200, { ok: true });
        return true;
      }
      if (request.method === "POST" && parts.length === 4 && parts[3] === "action") {
        const body = await readJson(request);
        const result = applyAction(room, member, body.type, body.payload);
        room.updatedAt = Date.now();
        broadcast(room);
        sendJson(response, 200, { ok: true, result });
        return true;
      }
    }
  } catch (error) {
    sendJson(response, 400, { error: error.message || "요청을 처리하지 못했습니다." });
    return true;
  }
  return false;
}

function serveStatic(request, response, url) {
  const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = normalize(join(root, requested));
  if (!file.startsWith(normalize(root))) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    if (!statSync(file).isFile()) throw new Error("Not found");
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    if (request.method === "HEAD") response.end();
    else createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && (allowedOrigins.has("*") || allowedOrigins.has(origin))) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Session-Token");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  if (url.pathname.startsWith("/api/")) {
    const handled = await handleApi(request, response, url);
    if (!handled) sendJson(response, 404, { error: "API 경로를 찾을 수 없습니다." });
    return;
  }
  serveStatic(request, response, url);
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.status === "running" && room.deadline && now >= room.deadline) {
      const result = advanceTurn(room.game);
      updateRankTracking(room);
      room.updatedAt = now;
      if (result.finished) {
        room.status = "finished";
        room.deadline = null;
      } else {
        room.deadline = now + turnDurationSeconds(room.game.turn, room.speed) * 1000;
      }
      broadcast(room);
    }
    const maxAge = room.status === "finished" ? 2 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
    if (now - room.updatedAt > maxAge) {
      for (const response of room.clients.values()) response.end();
      rooms.delete(room.code);
    }
  }
}, 250).unref();

setInterval(() => {
  for (const room of rooms.values()) {
    for (const response of room.clients.values()) response.write(": heartbeat\n\n");
  }
}, 20_000).unref();

server.listen(port, "0.0.0.0", () => {
  console.log(`주식 배틀그라운드 온라인 서버: http://127.0.0.1:${port}`);
});
