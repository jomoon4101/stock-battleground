import { createServer } from "node:http";
import { createReadStream, statSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
  createRumor,
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
const dataRoot = process.env.DATA_ROOT ? resolve(process.env.DATA_ROOT) : resolve(sourceRoot, "data");
mkdirSync(dataRoot, { recursive: true });
const hallFile = resolve(dataRoot, "hall-of-fame.json");
const boardFile = resolve(dataRoot, "anonymous-board.json");
function loadJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return fallback; }
}
function saveJson(file, value) {
  try { writeFileSync(file, JSON.stringify(value, null, 2), "utf8"); } catch { /* read-only hosts keep memory state */ }
}
let hallOfFame = loadJson(hallFile, []);
let boardPosts = loadJson(boardFile, []);
const boardRateLimits = new Map();
const allowedOrigins = new Set(String(process.env.ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean));
const testTurnMilliseconds = process.env.NODE_ENV === "test" ? Math.max(0, Number(process.env.TEST_TURN_MS) || 0) : 0;
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

function cleanLanguage(value) {
  return value === "en" ? "en" : "ko";
}

function cleanAvatar(value) {
  if (value?.kind === "upload" && typeof value.data === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(value.data) && value.data.length <= 180_000) {
    return { kind: "upload", data: value.data };
  }
  const index = Math.max(0, Math.min(9, Math.floor(Number(value?.index) || 0)));
  return { kind: "meme", index };
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

function portfolioFor(game, playerId) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) return [];
  const priceIndex = Math.min(game.turn - 1, CONFIG.totalTurns);
  return player.holdings.map((quantity, stockIndex) => {
    if (quantity <= 0) return null;
    const stock = game.stocks[stockIndex];
    const value = quantity * stock.prices[priceIndex];
    return { stockIndex, name: stock.name, ticker: stock.ticker, flag: stock.market.flag, quantity, value };
  }).filter(Boolean).sort((a, b) => b.value - a.value);
}

function enrichRanking(room, ranking) {
  return ranking.map((entry) => ({
    ...entry,
    avatar: room.game.players.find((player) => player.id === entry.playerId)?.avatar,
    performance: room.game.players.find((player) => player.id === entry.playerId)?.performance || [],
    movement: room.rankMovements?.get(entry.playerId) || 0,
    assetRiseStreak: room.assetStreaks?.get(entry.playerId) || 0,
    topStock: topHolding(room.game, entry.playerId),
    portfolio: portfolioFor(room.game, entry.playerId),
  }));
}

function initializeRankTracking(room) {
  const ranking = getRanking(room.game, { display: false });
  room.lastRanks = new Map(ranking.map((entry) => [entry.playerId, entry.rank]));
  room.lastAssets = new Map(ranking.map((entry) => [entry.playerId, entry.assets]));
  room.rankMovements = new Map();
  room.assetStreaks = new Map();
  room.rankAnimationTurn = 0;
  room.lastLeaderId = ranking[0]?.playerId || null;
  room.formerLeaders = new Set(room.lastLeaderId ? [room.lastLeaderId] : []);
  room.leaderNotice = null;
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
  const leader = ranking[0];
  if (leader && room.lastLeaderId && leader.playerId !== room.lastLeaderId) {
    const reclaimed = room.formerLeaders.has(leader.playerId);
    const rankingBlind = room.game.turn % 10 === 0 || room.game.rankBlindTurn === room.game.turn;
    room.leaderNotice = rankingBlind ? null : {
      id: randomUUID(), turn: room.game.turn, playerId: leader.playerId,
      nickname: leader.nickname, kind: reclaimed ? "reclaimed" : "changed", createdAt: Date.now(),
    };
    room.formerLeaders.add(leader.playerId);
    room.lastLeaderId = leader.playerId;
  }
}

function publicState(room, member) {
  const base = {
    room: {
      code: room.code,
      status: room.status,
      speed: room.speed,
      language: room.language,
      matchDeadline: room.matchDeadline || null,
      createdAt: room.createdAt,
      memberCount: room.members.length,
      capacity: CONFIG.playerCount,
      deadline: room.deadline,
      durationSeconds: room.game ? turnDurationSeconds(room.game.turn, room.speed) : 0,
      members: room.members.map((entry) => ({
        playerId: entry.playerId,
        nickname: entry.nickname,
        avatar: entry.avatar,
        isHost: entry.isHost,
        connected: room.clients.has(entry.token),
      })),
    },
    viewer: { playerId: member.playerId, nickname: member.nickname, avatar: member.avatar, isHost: member.isHost },
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
      : { id: player.id, nickname: player.nickname, avatar: player.avatar, isHuman: player.isHuman, eliminated: player.eliminated }),
    viewerSummary: getPlayerSummary(game, member.playerId),
    displayRanking: visibleRanking,
    actualRanking: rankingBlocked || checkpoint ? visibleRanking : enrichRanking(room, getRanking(game, { display: false, viewerId: member.playerId })),
    rankAnimationTurn: room.rankAnimationTurn,
    leaderNotice: room.leaderNotice,
    notices: room.notices.slice(-30),
    messages: room.messages.filter((message) => message.fromId === member.playerId || message.toId === member.playerId),
    unreadMessages: room.messages.filter((message) => message.toId === member.playerId && !message.read).length,
    activePlayerCount: game.players.filter((player) => !player.eliminated).length,
    elimination: viewer.eliminated ? {
      turn: viewer.eliminatedTurn, rank: viewer.eliminationRank, quote: viewer.eliminationQuote,
      stats: viewer.stats, performance: viewer.performance, assets: getPlayerSummary(game, member.playerId),
      topStock: topHolding(game, member.playerId),
    } : null,
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

function nextTurnDeadline(room) {
  return Date.now() + (testTurnMilliseconds || turnDurationSeconds(room.game.turn, room.speed) * 1000);
}

function createRoom({ nickname, speed, language, avatar }) {
  const code = roomCode();
  const token = randomUUID();
  const member = { token, playerId: "PLAYER-001", nickname: cleanNickname(nickname), avatar: cleanAvatar(avatar), isHost: true };
  const room = {
    code,
    speed: ["turbo", "fast", "standard", ...(process.env.NODE_ENV === "test" ? ["test"] : [])].includes(speed) ? speed : "standard",
    language: cleanLanguage(language),
    status: "waiting",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deadline: null,
    members: [member],
    clients: new Map(),
    messages: [],
    notices: [],
    game: null,
  };
  rooms.set(code, room);
  return { room, member };
}

function nextPlayerId(room) {
  const used = new Set(room.members.map((member) => member.playerId));
  for (let index = 1; index <= CONFIG.playerCount; index += 1) {
    const playerId = `PLAYER-${String(index).padStart(3, "0")}`;
    if (!used.has(playerId)) return playerId;
  }
  throw new Error("방이 가득 찼습니다.");
}

function joinRoom(room, nickname, avatar) {
  if (!["waiting", "running"].includes(room.status)) throw new Error("참가할 수 있는 게임이 아닙니다.");
  if (room.members.length >= CONFIG.playerCount) throw new Error("방이 가득 찼습니다.");
  const clean = cleanNickname(nickname);
  if (room.members.some((member) => member.nickname.toLowerCase() === clean.toLowerCase())) throw new Error("이미 사용 중인 닉네임입니다.");
  const token = randomUUID();
  const member = {
    token,
    playerId: nextPlayerId(room),
    nickname: clean,
    avatar: cleanAvatar(avatar),
    isHost: false,
  };
  if (room.status === "running") {
    const seat = room.game.players.find((player) => !player.isHuman && !player.eliminated);
    if (!seat) throw new Error("현재 참가할 수 있는 AI 자리가 없습니다.");
    const oldPlayerId = seat.id;
    seat.id = member.playerId;
    seat.nickname = member.nickname;
    seat.avatar = member.avatar;
    seat.isHuman = true;
    seat.joinedTurn = room.game.turn;
    room.game.rankingSnapshot = [];
    room.messages = room.messages.filter((message) => message.fromId !== oldPlayerId && message.toId !== oldPlayerId);
  }
  room.members.push(member);
  if (room.status === "running") {
    initializeRankTracking(room);
    if ([1, 11, 21, 31].includes(room.game.turn)) deliverRumor(room, member);
  }
  room.updatedAt = Date.now();
  broadcast(room);
  return member;
}

function leaveRoom(room, member) {
  const response = room.clients.get(member.token);
  if (response) response.end();
  room.clients.delete(member.token);
  room.members = room.members.filter((candidate) => candidate.token !== member.token);
  room.messages = room.messages.filter((message) => message.fromId !== member.playerId && message.toId !== member.playerId);
  if (room.game) {
    const player = room.game.players.find((candidate) => candidate.id === member.playerId);
    if (player && !room.game.finished) player.isHuman = false;
  }
  if (member.isHost && room.members.length) room.members[0].isHost = true;
  room.updatedAt = Date.now();
  if (!room.members.length) rooms.delete(room.code);
  else broadcast(room);
}

function launchRoom(room) {
  const game = createGame({ nickname: room.members[0].nickname, seed: Date.now(), language: room.language, avatar: room.members[0].avatar });
  room.members.forEach((joined, index) => {
    const player = game.players[index];
    player.id = joined.playerId;
    player.nickname = joined.nickname;
    player.avatar = joined.avatar;
    player.isHuman = true;
  });
  room.game = game;
  initializeRankTracking(room);
  room.status = "running";
  room.notices = [];
  room.messages = [];
  room.members.forEach((member) => deliverRumor(room, member));
  room.updatedAt = Date.now();
  room.deadline = nextTurnDeadline(room);
  broadcast(room);
}

function startRoom(room, member) {
  if (!member.isHost) throw new Error("방장만 게임을 시작할 수 있습니다.");
  if (room.status !== "waiting") throw new Error("이미 시작된 게임입니다.");
  launchRoom(room);
}

function deliverRumor(room, member) {
  const rumor = createRumor(room.game, room.game.turn, member.playerId);
  room.messages.push({
    id: randomUUID(), fromId: rumor.senderId, fromName: rumor.senderName, toId: member.playerId,
    text: rumor.text, createdAt: Date.now(), read: false, system: "rumor", stockIndex: rumor.stockIndex,
    direction: rumor.direction, startTurn: rumor.startTurn, endTurn: rumor.endTurn,
  });
  room.messages = room.messages.slice(-300);
}

function createAiReply(room, target) {
  const owned = target.holdings.map((quantity, stockIndex) => ({ quantity, stockIndex })).filter((entry) => entry.quantity > 0);
  const stockEntry = owned.length ? owned[Math.floor(Math.random() * owned.length)] : null;
  if (stockEntry && Math.random() < 0.72) {
    const stock = room.game.stocks[stockEntry.stockIndex];
    const ko = [
      `${stock.name}? 나도 조금 담아봤는데 아직은 손에 땀나네.`, `${stock.name}은 내가 산 것 중엔 제일 신경 쓰여. 다음 봉은 좀 보려고.`,
      `솔직히 ${stock.name} 산 건 반쯤 감이었어. 그래도 바로 던질 생각은 없어.`, `${stock.name} 물려 있는 건 비밀이야. 차트가 한번쯤 살아나지 않을까?`,
      `아까 ${stock.name} 좀 샀는데 거래량이 영 수상하더라.`, `${stock.name}은 내가 들고 있긴 한데 남한테 추천할 정도는 아니야.`,
      `${stock.market.name} 쪽에선 ${stock.name}을 보고 있어. 나도 사놓고 계속 눈치 보는 중이야.`, `${stock.name} 담고 나니 오히려 확신이 없어졌어. 원래 주식이 그렇잖아.`,
    ];
    const en = [
      `${stock.name}? I picked some up, but it still makes me nervous.`, `${stock.name} is the one position I keep checking. I want to see the next candle.`,
      `Honestly, buying ${stock.name} was half instinct. I'm not dumping it yet, though.`, `Don't tell anyone, but I'm holding ${stock.name}. Maybe the chart wakes up.`,
      `I bought a little ${stock.name} earlier. The volume looked kind of suspicious.`, `I do own ${stock.name}, but I'm not confident enough to recommend it.`,
      `I've been watching ${stock.name} over in ${stock.market.name}. Bought some and now I'm second-guessing it.`, `The moment I bought ${stock.name}, my confidence disappeared. That's trading for you.`,
    ];
    const options = room.language === "en" ? en : ko;
    return options[Math.floor(Math.random() * options.length)];
  }
  const ko = [
    "요즘 장이 사람 마음 가지고 노는 것 같지 않아?", "난 이번 턴엔 괜히 손대지 말고 좀 지켜보려고.", "수익 났을 때 팔기가 손절보다 더 어렵더라.",
    "차트 오래 본다고 답이 나오는 건 아닌데 자꾸 보게 돼.", "이번 판은 현금 들고 있는 사람도 꽤 무서울걸.", "남들 다 확신할 때가 제일 불안하지 않아?",
    "나는 목표가보다 손절가부터 정해두는 편이야.", "한 종목만 보면 꼭 다른 데서 일이 터지더라.", "오늘 감이 좋긴 한데 그게 제일 위험한 신호일 수도 있어.",
    "일단 살아남고 보자. 기회는 다음 턴에도 오니까.", "방금 주문 넣었다가 취소했어. 영 느낌이 안 와.", "뉴스보다 사람들 표정이 더 빠를 때가 있더라.",
  ];
  const en = [
    "Feels like the market is playing with everyone's head today.", "I'm thinking of doing nothing this turn and just watching.", "Taking profit is somehow harder than cutting a loss.",
    "Staring at the chart longer doesn't give me answers, but I keep doing it.", "Even the people sitting in cash look nervous this round.", "I get uneasy when everybody suddenly sounds certain.",
    "I usually decide my exit before I think about the target.", "Every time I focus on one stock, something breaks somewhere else.", "My instinct feels good today, which might be the most dangerous signal.",
    "Survive first. There will be another setup next turn.", "I just placed an order and cancelled it. Couldn't trust the feeling.", "Sometimes traders' faces move faster than the news.",
  ];
  const options = room.language === "en" ? en : ko;
  return options[Math.floor(Math.random() * options.length)];
}

function addRoomNotice(room, type, text, icon) {
  room.notices.push({ id: randomUUID(), type, text, icon, turn: room.game.turn, createdAt: Date.now() });
  room.notices = room.notices.slice(-30);
}

function handleTurnEvents(room, result) {
  if ([11, 21, 31].includes(room.game.turn)) {
    room.members.forEach((member) => {
      const player = room.game.players.find((candidate) => candidate.id === member.playerId);
      if (player && !player.eliminated) deliverRumor(room, member);
    });
  }
  if ([15, 25, 35].includes(room.game.turn)) {
    addRoomNotice(room, "salary-reminder", room.language === "en" ? "Five turns until payday." : "월급날까지 5턴 남았습니다.", room.language === "en" ? "$" : "₩");
  }
  if (result.eliminated) {
    const nickname = result.eliminated.nickname;
    addRoomNotice(room, "elimination", room.language === "en" ? `${nickname} went broke and was eliminated.` : `${nickname}플레이어가 깡통을 찼습니다.`, "☠");
  }
}

function sendMessage(room, fromId, targetId, rawText) {
  const text = String(rawText || "").trim().slice(0, 240);
  if (!text) throw new Error("쪽지 내용을 입력하세요.");
  if (fromId === targetId) throw new Error("자기 자신에게는 쪽지를 보낼 수 없습니다.");
  const target = room.game.players.find((player) => player.id === targetId && !player.eliminated);
  if (!target) throw new Error("쪽지를 받을 플레이어를 찾을 수 없습니다.");
  const message = { id: randomUUID(), fromId, toId: targetId, text, createdAt: Date.now(), read: false };
  room.messages.push(message);
  room.messages = room.messages.slice(-300);
  if (!target.isHuman) {
    setTimeout(() => {
      if (room.status !== "running") return;
      room.messages.push({ id: randomUUID(), fromId: targetId, toId: fromId, text: createAiReply(room, target), createdAt: Date.now(), read: false, ai: true });
      room.messages = room.messages.slice(-300);
      broadcast(room);
    }, 700 + Math.floor(Math.random() * 900)).unref?.();
  }
  return message;
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
    case "send-message": return sendMessage(room, playerId, String(payload.targetId), payload.text);
    case "mark-messages-read":
      room.messages.forEach((message) => {
        if (message.toId === playerId && (!payload.targetId || message.fromId === payload.targetId)) message.read = true;
      });
      return { ok: true };
    default: throw new Error("지원하지 않는 행동입니다.");
  }
}

function joinMatchingRoom(room, nickname, avatar) {
  if (room.members.length >= CONFIG.playerCount) throw new Error("매칭이 가득 찼습니다.");
  const clean = cleanNickname(nickname);
  if (room.members.some((member) => member.nickname.toLowerCase() === clean.toLowerCase())) throw new Error("이미 사용 중인 닉네임입니다.");
  const token = randomUUID();
  const member = {
    token, playerId: nextPlayerId(room),
    nickname: clean, avatar: cleanAvatar(avatar), isHost: false,
  };
  room.members.push(member);
  room.updatedAt = Date.now();
  broadcast(room);
  return member;
}

function enterMatchmaking(body) {
  const language = cleanLanguage(body.language);
  const allowedSpeeds = ["turbo", "fast", "standard", ...(process.env.NODE_ENV === "test" ? ["test"] : [])];
  const speed = allowedSpeeds.includes(body.speed) ? body.speed : "standard";
  let room = [...rooms.values()].find((candidate) => candidate.status === "matching" && candidate.language === language && candidate.speed === speed && candidate.members.length < CONFIG.playerCount && candidate.matchDeadline > Date.now());
  if (!room) {
    const created = createRoom({ ...body, language, speed });
    room = created.room;
    room.status = "matching";
    room.matchDeadline = Date.now() + 5_000;
    created.member.isHost = false;
    return { room, member: created.member };
  }
  return { room, member: joinMatchingRoom(room, body.nickname, body.avatar) };
}

function updateHallOfFame(room) {
  const oldRanks = new Map(hallOfFame.map((entry, index) => [entry.id, index + 1]));
  const completed = room.game.players.filter((player) => player.isHuman).map((player) => ({
    id: randomUUID(), nickname: player.nickname, avatar: player.avatar,
    assets: getPlayerSummary(room.game, player.id).assets, completedAt: Date.now(), movement: 0,
  }));
  hallOfFame = [...hallOfFame, ...completed].sort((a, b) => b.assets - a.assets).slice(0, 10);
  hallOfFame = hallOfFame.map((entry, index) => ({ ...entry, movement: oldRanks.has(entry.id) ? oldRanks.get(entry.id) - (index + 1) : 0 }));
  saveJson(hallFile, hallOfFame);
}

function addBoardPost(request, textValue) {
  const text = String(textValue || "").trim().slice(0, 500);
  if (!text) throw new Error("게시글 내용을 입력하세요.");
  const key = request.socket.remoteAddress || "anonymous";
  if (Date.now() - (boardRateLimits.get(key) || 0) < 3_000) throw new Error("게시글은 3초에 한 번 작성할 수 있습니다.");
  boardRateLimits.set(key, Date.now());
  const post = { id: randomUUID(), text, createdAt: Date.now() };
  boardPosts.unshift(post);
  boardPosts = boardPosts.slice(0, 100);
  saveJson(boardFile, boardPosts);
  return post;
}

async function handleApi(request, response, url) {
  const parts = url.pathname.split("/").filter(Boolean);
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) });
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/hall-of-fame") {
      sendJson(response, 200, { entries: hallOfFame });
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/board") {
      sendJson(response, 200, { posts: boardPosts });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/board") {
      const body = await readJson(request);
      sendJson(response, 201, { post: addBoardPost(request, body.text) });
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/matchmaking") {
      const body = await readJson(request);
      const { room, member } = enterMatchmaking(body);
      sendJson(response, 201, { token: member.token, state: publicState(room, member) });
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
      const member = joinRoom(room, body.nickname, body.avatar);
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
    if (room.status === "matching" && room.matchDeadline && now >= room.matchDeadline) {
      launchRoom(room);
      continue;
    }
    if (room.status === "running" && room.deadline && now >= room.deadline) {
      const result = advanceTurn(room.game);
      updateRankTracking(room);
      handleTurnEvents(room, result);
      room.updatedAt = now;
      if (result.finished) {
        room.status = "finished";
        room.deadline = null;
        updateHallOfFame(room);
        room.messages = [];
      } else {
        room.deadline = nextTurnDeadline(room);
      }
      broadcast(room);
    }
    const maxAge = room.status === "finished" ? 2 * 60 * 60 * 1000 : 6 * 60 * 60 * 1000;
    if (now - room.updatedAt > maxAge) {
      for (const response of room.clients.values()) response.end();
      rooms.delete(room.code);
    }
  }
}, testTurnMilliseconds ? Math.min(10, testTurnMilliseconds) : 250).unref();

setInterval(() => {
  for (const room of rooms.values()) {
    for (const response of room.clients.values()) response.write(": heartbeat\n\n");
  }
}, 20_000).unref();

server.listen(port, "0.0.0.0", () => {
  console.log(`주식 배틀그라운드 온라인 서버: http://127.0.0.1:${port}`);
});
