import { createServer } from "node:http";
import { createReadStream, statSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import {
  CONFIG,
  GAME_MODES,
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
import { createAiChatLine, createAiConversationPlan } from "./ai-chat.js";
import { calculateTurnOrder, createSurvivalMvpGame } from "./survival-mvp/game-state.js";
import { applyAction as applyMvpAction, advanceAfterResolved, autoCompletePhase as autoCompleteMvpPhase, emergencySell as emergencySellMvp, resolveDice as resolveMvpDice } from "./survival-mvp/game-logic.js";
import { getSurvivalRanking, survivalNetWorth } from "./survival-mvp/progression.js";
import { confirmSkillSelection as confirmMvpSkills, toggleSkillDraft as toggleMvpSkillDraft, useSkill as useMvpSkill } from "./survival-mvp/skills.js";

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
const defaultAllowedOrigins = new Set([
  "https://stock-survival.vercel.app",
  "https://stock-battleground.vercel.app",
]);
const configuredOriginRules = String(process.env.ALLOWED_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);
const reservedRoomPaths = new Set(["active", "matchmaking", "status"]);
const testTurnMilliseconds = process.env.NODE_ENV === "test" ? Math.max(0, Number(process.env.TEST_TURN_MS) || 0) : 0;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (defaultAllowedOrigins.has(origin)) return true;
  return configuredOriginRules.some((rule) => {
    if (rule === "*") return true;
    if (!rule.includes("*")) return rule === origin;
    const pattern = rule.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return new RegExp(`^${pattern}$`, "i").test(origin);
  });
}

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
  const priceIndex = Math.min(game.turn - 1, game.totalTurns ?? CONFIG.totalTurns);
  let best = null;
  player.holdings.forEach((quantity, stockIndex) => {
    if (quantity <= 0) return;
    const stock = game.stocks[stockIndex];
    const value = quantity * stock.prices[priceIndex];
    if (!best || value > best.value) {
      best = { stockIndex, name: stock.name, ticker: stock.ticker, quantity, value };
    }
  });
  return best;
}

function portfolioFor(game, playerId) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) return [];
  const priceIndex = Math.min(game.turn - 1, game.totalTurns ?? CONFIG.totalTurns);
  return player.holdings.map((quantity, stockIndex) => {
    if (quantity <= 0) return null;
    const stock = game.stocks[stockIndex];
    const value = quantity * stock.prices[priceIndex];
    return { stockIndex, name: stock.name, ticker: stock.ticker, quantity, value };
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

function rankingFor(room) {
  return room.game?.survivalMvp ? getSurvivalRanking(room.game) : getRanking(room.game, { display: false });
}

function initializeRankTracking(room) {
  const ranking = rankingFor(room);
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
  const ranking = rankingFor(room);
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
      capacity: room.playerCount,
      totalTurns: room.totalTurns,
      difficulty: room.difficulty,
      deadline: room.deadline,
      turnEnded: room.readyPlayers.has(member.playerId),
      durationSeconds: room.game ? turnDurationSeconds(room.game.turn, room.speed) : 0,
      readyCount: room.readyPlayers.size,
      activeMemberCount: room.game ? room.members.filter((entry) => !room.game.players.find((player) => player.id === entry.playerId)?.eliminated).length : 0,
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
  const revealedPriceCount = Math.min(game.turn, game.totalTurns + 1);
  const rankingBlocked = game.rankBlindTurn === game.turn;
  const checkpoint = game.turn % 10 === 0 && !game.finished;
  const visibleRanking = rankingBlocked ? [] : enrichRanking(room, game.survivalMvp ? getSurvivalRanking(game) : getRanking(game, { display: true, viewerId: member.playerId }));
  base.game = {
    version: game.version,
    turn: game.turn,
    totalTurns: game.totalTurns,
    playerCount: game.playerCount,
    difficulty: game.difficulty,
    finished: game.finished,
    stocks: game.stocks.map((stock) => ({
      ...stock,
      prices: stock.prices.map((price, index) => index < revealedPriceCount ? price : null),
      candles: stock.candles.map((candle, index) => index < revealedPriceCount ? candle : null),
    })),
    players: game.players.map((player) => {
      if (player.id !== member.playerId) return { id: player.id, nickname: player.nickname, avatar: player.avatar, isHuman: player.isHuman, eliminated: player.eliminated };
      const { queuedInsideInfoCard: _privateQueuedEvent, ...visiblePlayer } = player;
      return { ...visiblePlayer, bonds: player.bonds.map((bond) => ({ ...bond })), orders: player.orders.map((order) => ({ ...order })) };
    }),
    viewerSummary: game.survivalMvp ? { ...getPlayerSummary(game, member.playerId), assets: survivalNetWorth(game, viewer), alternativeAssets: { ...viewer.alternativeAssets } } : getPlayerSummary(game, member.playerId),
    displayRanking: visibleRanking,
    actualRanking: rankingBlocked || checkpoint ? visibleRanking : enrichRanking(room, game.survivalMvp ? getSurvivalRanking(game) : getRanking(game, { display: false, viewerId: member.playerId })),
    rankAnimationTurn: room.rankAnimationTurn,
    leaderNotice: room.leaderNotice,
    notices: room.notices.filter((notice) => !notice.playerId || notice.playerId === member.playerId).slice(-30),
    messages: room.messages.filter((message) => message.toId === "ALL" || message.fromId === member.playerId || message.toId === member.playerId),
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
    survivalMvp: game.survivalMvp ? {
      ...game.survivalMvp,
      shortPosition: game.survivalMvp.shortPosition?.playerId === member.playerId ? game.survivalMvp.shortPosition : null,
    } : null,
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

function createRoom({ nickname, speed, language, avatar, playerCount, difficulty }) {
  const code = roomCode();
  const token = randomUUID();
  const safeSpeed = Object.hasOwn(GAME_MODES, speed) && speed !== "test" ? speed : process.env.NODE_ENV === "test" && speed === "test" ? "test" : "standard";
  const mode = GAME_MODES[safeSpeed] || GAME_MODES.standard;
  const safePlayerCount = Math.max(CONFIG.playerMin, Math.min(CONFIG.playerMax, Math.floor(Number(playerCount) || mode.playerCount)));
  const member = { token, playerId: "PLAYER-001", nickname: cleanNickname(nickname), avatar: cleanAvatar(avatar), isHost: true };
  const room = {
    code,
    speed: safeSpeed,
    playerCount: safePlayerCount,
    totalTurns: mode.totalTurns,
    difficulty: safeSpeed === "test" && ["easy", "normal", "hard"].includes(difficulty) ? difficulty : mode.difficulty,
    language: cleanLanguage(language),
    status: "waiting",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    deadline: null,
    members: [member],
    clients: new Map(),
    readyPlayers: new Set(),
    messages: [],
    notices: [],
    game: null,
  };
  rooms.set(code, room);
  return { room, member };
}

function nextPlayerId(room) {
  const used = new Set(room.members.map((member) => member.playerId));
  for (let index = 1; index <= room.playerCount; index += 1) {
    const playerId = `PLAYER-${String(index).padStart(3, "0")}`;
    if (!used.has(playerId)) return playerId;
  }
  throw new Error("방이 가득 찼습니다.");
}

function joinRoom(room, nickname, avatar) {
  if (!["waiting", "running"].includes(room.status)) throw new Error("참가할 수 있는 게임이 아닙니다.");
  if (room.members.length >= room.playerCount) throw new Error("방이 가득 찼습니다.");
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
    if (room.game.survivalMvp) {
      seat.skills = [];
      seat.selectedSkillDraft = [];
      seat.skillSelectionComplete = false;
      room.game.survivalMvp.turnOrder = room.game.survivalMvp.turnOrder.map((id) => id === oldPlayerId ? member.playerId : id);
      if (room.game.survivalMvp.activePlayerId === oldPlayerId) room.game.survivalMvp.activePlayerId = member.playerId;
      room.game.survivalMvp.actedPlayerIds = room.game.survivalMvp.actedPlayerIds.map((id) => id === oldPlayerId ? member.playerId : id);
    }
    room.game.rankingSnapshot = [];
    room.messages = room.messages.filter((message) => message.fromId !== oldPlayerId && message.toId !== oldPlayerId);
  }
  room.members.push(member);
  if (room.status === "running") {
    initializeRankTracking(room);
    deliverRumor(room, member);
  }
  room.updatedAt = Date.now();
  broadcast(room);
  return member;
}

function leaveRoom(room, member) {
  const response = room.clients.get(member.token);
  if (response) response.end();
  room.clients.delete(member.token);
  room.readyPlayers.delete(member.playerId);
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
  const game = room.speed === "test" ? createGame({
    nickname: room.members[0].nickname, seed: randomBytes(4).readUInt32LE(0), language: room.language,
    avatar: room.members[0].avatar, playerCount: room.playerCount, totalTurns: room.totalTurns, difficulty: room.difficulty,
  }) : createSurvivalMvpGame({
    nickname: room.members[0].nickname, seed: randomBytes(4).readUInt32LE(0), language: room.language,
    avatar: room.members[0].avatar, playerCount: room.playerCount, totalTurns: room.totalTurns, requireSkillSelection: true,
  });
  room.members.forEach((joined, index) => {
    const player = game.players[index];
    player.id = joined.playerId;
    player.nickname = joined.nickname;
    player.avatar = joined.avatar;
    player.isHuman = true;
    if (game.survivalMvp) {
      player.skills = [];
      player.selectedSkillDraft = [];
      player.skillSelectionComplete = false;
    }
  });
  if (game.survivalMvp) {
    game.survivalMvp.turnOrder = calculateTurnOrder(game);
    game.survivalMvp.activePlayerId = game.survivalMvp.turnOrder[0];
  }
  room.game = game;
  initializeRankTracking(room);
  room.status = "running";
  room.notices = [];
  room.messages = [];
  room.readyPlayers.clear();
  room.members.forEach((member) => deliverRumor(room, member));
  room.updatedAt = Date.now();
  room.deadline = nextTurnDeadline(room);
  broadcast(room);
  scheduleAiConversation(room, { chance: 0.9, count: 2 });
}

function startRoom(room, member) {
  if (!member.isHost) throw new Error("방장만 게임을 시작할 수 있습니다.");
  if (room.status !== "waiting") throw new Error("이미 시작된 게임입니다.");
  launchRoom(room);
}

function deliverRumor(room, member) {
  const player = room.game.players.find((candidate) => candidate.id === member.playerId);
  if (!player || player.eliminated) return false;
  const rumor = createRumor(room.game, room.game.turn, member.playerId);
  room.messages.push({
    id: randomUUID(), fromId: rumor.senderId, fromName: rumor.senderName, toId: member.playerId,
    text: rumor.text, createdAt: Date.now(), read: false, system: "rumor", stockIndex: rumor.stockIndex,
    direction: rumor.direction, startTurn: rumor.startTurn, endTurn: rumor.endTurn,
  });
  room.messages = room.messages.slice(-300);
  return true;
}

function createAiReply(room, target, previousMessage = "", previousSpeakerName = "") {
  const recentTexts = room.messages.filter((message) => message.ai).slice(-20).map((message) => message.text);
  return createAiChatLine(room.game, target, {
    language: room.language,
    previousMessage,
    previousSpeakerName,
    phase: previousMessage ? 1 : 0,
    recentTexts,
  }).text;
}

function scheduleAiConversation(room, options = {}) {
  if (room.status !== "running" || !room.game || room.game.finished) return false;
  const aiPlayers = room.game.players.filter((player) => !player.isHuman && !player.eliminated);
  if (!aiPlayers.length || (!options.force && Math.random() > Number(options.chance ?? 0.72))) return false;
  const now = Date.now();
  if (!options.force && now - Number(room.lastAiChatAt || 0) < 3_000) return false;
  const recentTexts = room.messages
    .filter((message) => message.system === "global")
    .slice(-24)
    .map((message) => message.text);
  const plan = createAiConversationPlan(room.game, aiPlayers, {
    language: room.language,
    triggerMessage: options.triggerMessage || "",
    triggerName: options.triggerName || "",
    recentTexts,
    count: options.count || 2 + Math.floor(Math.random() * 3),
  });
  if (!plan.length) return false;
  room.lastAiChatAt = now;
  plan.forEach((entry, index) => {
    const timer = setTimeout(() => {
      if (room.status !== "running" || room.game.finished || entry.speaker.eliminated) return;
      room.messages.push({
        id: randomUUID(), fromId: entry.speaker.id, fromName: entry.speaker.nickname, toId: "ALL",
        text: entry.text, createdAt: Date.now(), read: true, system: "global", ai: true, aiConversation: true,
        stockIndex: entry.stockIndex, claimDirection: entry.claimedRise ? "up" : "down",
      });
      room.messages = room.messages.slice(-300);
      broadcast(room);
    }, 650 + index * 820 + Math.floor(Math.random() * 260));
    timer.unref?.();
  });
  return true;
}

function addRoomNotice(room, type, text, icon, playerId = null) {
  room.notices.push({ id: randomUUID(), type, text, icon, playerId, turn: room.game.turn, createdAt: Date.now() });
  room.notices = room.notices.slice(-(room.playerCount * 30));
}

function handleTurnEvents(room, result) {
  for (const event of result.holdingTaxEvents || []) {
    if (!room.members.some((member) => member.playerId === event.playerId)) continue;
    if (event.becameEligible) {
      addRoomNotice(
        room,
        "holding-tax-eligible",
        room.language === "en"
          ? "Cash reached the holding-tax threshold. A 2% tax applies from round 11."
          : "⚠️ 보유금이 2,000,000원을 넘어 11라운드부터 보유세 2%가 적용됩니다.",
        "⚠️",
        event.playerId,
      );
    }
    if (event.tax > 0) {
      addRoomNotice(
        room,
        "holding-tax",
        room.language === "en"
          ? `Holding tax applied: ${event.tax.toLocaleString("en-US")} won was deducted this round.`
          : `💸 보유세 적용: 2,000,000원 이상 보유로 이번 라운드에 ${event.tax.toLocaleString("ko-KR")}원이 차감되었습니다.`,
        "💸",
        event.playerId,
      );
    }
    if (event.becameExempt) {
      addRoomNotice(
        room,
        "holding-tax-exempt",
        room.language === "en"
          ? "Cash fell to 2,000,000 won or less, so the holding tax no longer applies."
          : "✅ 보유금이 2,000,000원 이하가 되어 보유세 대상에서 제외되었습니다.",
        "✅",
        event.playerId,
      );
    }
  }
  if (!result.finished) {
    room.members.forEach((member) => {
      const player = room.game.players.find((candidate) => candidate.id === member.playerId);
      if (player && !player.eliminated) deliverRumor(room, member);
    });
  }
  if (room.game.turn === 15) {
    addRoomNotice(room, "salary-reminder", room.language === "en" ? "Five turns until payday." : "월급날까지 5턴 남았습니다.", room.language === "en" ? "$" : "₩");
  }
  if (result.eliminated) {
    const nickname = result.eliminated.nickname;
    addRoomNotice(room, "elimination", room.language === "en" ? `${nickname} went broke and was eliminated.` : `${nickname}플레이어가 깡통을 찼습니다.`, "☠");
  }
}

function activeRooms() {
  return [...rooms.values()]
    .filter((room) => room.status === "running"
      && room.game
      && !room.game.finished
      && room.members.length < room.playerCount
      && room.game.players.some((player) => !player.isHuman && !player.eliminated))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((room) => ({
      code: room.code,
      title: room.language === "en" ? `${room.members[0]?.nickname || room.code}'s Survival` : `${room.members[0]?.nickname || room.code}의 서바이벌`,
      turn: room.game.turn,
      participantCount: room.members.length,
      capacity: room.playerCount,
      totalTurns: room.totalTurns,
      status: "running",
      updatedAt: room.updatedAt,
    }));
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
    const sender = room.game.players.find((player) => player.id === fromId);
    setTimeout(() => {
      if (room.status !== "running") return;
      room.messages.push({ id: randomUUID(), fromId: targetId, toId: fromId, text: createAiReply(room, target, text, sender?.nickname || ""), createdAt: Date.now(), read: false, ai: true });
      room.messages = room.messages.slice(-300);
      broadcast(room);
    }, 700 + Math.floor(Math.random() * 900)).unref?.();
  }
  return message;
}

function sendGlobalMessage(room, fromId, rawText) {
  const text = String(rawText || "").trim().slice(0, 180);
  if (!text) throw new Error("전체 채팅 내용을 입력하세요.");
  const sender = room.game.players.find((player) => player.id === fromId && !player.eliminated);
  if (!sender) throw new Error("전체 채팅에 참여할 플레이어를 찾을 수 없습니다.");
  const message = { id: randomUUID(), fromId, fromName: sender.nickname, toId: "ALL", text, createdAt: Date.now(), read: true, system: "global" };
  room.messages.push(message);
  room.messages = room.messages.slice(-300);
  scheduleAiConversation(room, { chance: 0.82, triggerMessage: text, triggerName: sender.nickname });
  return message;
}

function advanceRoom(room, now = Date.now()) {
  if (room.status !== "running" || !room.game || room.game.finished) return null;
  if (room.game.survivalMvp) {
    const mvp = room.game.survivalMvp;
    const playerId = mvp.activePlayerId;
    const phase = mvp.phase;
    const result = phase === "resolved" ? advanceAfterResolved(room.game, playerId) : autoCompleteMvpPhase(room.game, playerId);
    room.updatedAt = now;
    if (room.game.finished) {
      room.status = "finished";
      room.deadline = null;
      updateHallOfFame(room);
      room.messages = [];
    } else room.deadline = nextTurnDeadline(room);
    updateRankTracking(room);
    broadcast(room);
    return result;
  }
  const result = advanceTurn(room.game);
  room.readyPlayers.clear();
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
    scheduleAiConversation(room, { chance: 0.72 });
  }
  return result;
}

function applyAction(room, member, type, payload = {}) {
  if (room.status !== "running" || !room.game || room.game.finished) throw new Error("진행 중인 게임이 아닙니다.");
  const game = room.game;
  const playerId = member.playerId;
  if (room.readyPlayers.has(playerId) && !["send-message", "send-global-message", "mark-messages-read", "end-turn"].includes(type)) {
    throw new Error("이번 라운드 행동을 이미 종료했습니다.");
  }
  switch (type) {
    case "mvp-action": {
      if (!game.survivalMvp) throw new Error("서바이벌 행동을 사용할 수 없는 방입니다.");
      if (game.survivalMvp.activePlayerId !== playerId) throw new Error("현재 내 턴이 아닙니다.");
      const result = applyMvpAction(game, payload, playerId);
      room.deadline = nextTurnDeadline(room);
      return result;
    }
    case "mvp-progress": {
      if (!game.survivalMvp || game.survivalMvp.activePlayerId !== playerId) throw new Error("현재 내 턴이 아닙니다.");
      const result = game.survivalMvp.phase === "dice" ? resolveMvpDice(game, playerId) : advanceAfterResolved(game, playerId);
      if (game.finished) {
        room.status = "finished";
        room.deadline = null;
        updateHallOfFame(room);
        room.messages = [];
      } else room.deadline = nextTurnDeadline(room);
      updateRankTracking(room);
      return result;
    }
    case "mvp-asset":
      if (!game.survivalMvp || game.survivalMvp.activePlayerId !== playerId || game.survivalMvp.phase !== "action") throw new Error("현재 행동 단계가 아닙니다.");
      return applyMvpAction(game, { type: payload.side === "sell" ? "sell" : "buy", assetKey: payload.assetKey, quantity: payload.quantity }, playerId);
    case "mvp-skill":
      if (!game.survivalMvp) throw new Error("스킬을 사용할 수 없는 방입니다.");
      return useMvpSkill(game, playerId, String(payload.skillId), payload.options || {});
    case "mvp-skill-draft":
      if (!game.survivalMvp) throw new Error("스킬을 선택할 수 없는 방입니다.");
      return toggleMvpSkillDraft(game, playerId, String(payload.skillId));
    case "mvp-skill-confirm":
      if (!game.survivalMvp) throw new Error("스킬을 선택할 수 없는 방입니다.");
      return confirmMvpSkills(game, playerId);
    case "mvp-emergency-sell":
      if (!game.survivalMvp) throw new Error("긴급매도를 사용할 수 없는 방입니다.");
      return emergencySellMvp(game, playerId, Number(payload.stockIndex), Number(payload.quantity));
    case "end-turn": {
      room.readyPlayers.add(playerId);
      const activeMemberIds = room.members
        .filter((entry) => !game.players.find((player) => player.id === entry.playerId)?.eliminated)
        .map((entry) => entry.playerId);
      const allReady = activeMemberIds.length > 0 && activeMemberIds.every((id) => room.readyPlayers.has(id));
      if (allReady) advanceRoom(room, Date.now());
      return { ended: true, advanced: allReady };
    }
    case "trade":
      if (game.survivalMvp) throw new Error("서바이벌 모드에서는 하단 행동 버튼으로 거래하세요.");
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
    case "send-global-message": return sendGlobalMessage(room, playerId, payload.text);
    case "mark-messages-read":
      room.messages.forEach((message) => {
        if (message.toId === playerId && (!payload.targetId || message.fromId === payload.targetId)) message.read = true;
      });
      return { ok: true };
    default: throw new Error("지원하지 않는 행동입니다.");
  }
}

function joinMatchingRoom(room, nickname, avatar) {
  if (room.members.length >= room.playerCount) throw new Error("매칭이 가득 찼습니다.");
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
  const allowedSpeeds = ["quick", "standard", "long", ...(process.env.NODE_ENV === "test" ? ["test"] : [])];
  const speed = allowedSpeeds.includes(body.speed) ? body.speed : "standard";
  const mode = GAME_MODES[speed] || GAME_MODES.standard;
  const playerCount = Math.max(CONFIG.playerMin, Math.min(CONFIG.playerMax, Math.floor(Number(body.playerCount) || mode.playerCount)));
  const difficulty = speed === "test" && ["easy", "normal", "hard"].includes(body.difficulty) ? body.difficulty : mode.difficulty;
  let room = [...rooms.values()].find((candidate) => candidate.status === "matching"
    && candidate.language === language && candidate.speed === speed && candidate.playerCount === playerCount
    && candidate.difficulty === difficulty && candidate.members.length < candidate.playerCount && candidate.matchDeadline > Date.now());
  if (!room) {
    const created = createRoom({ ...body, language, speed, playerCount, difficulty });
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
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  try {
    // Fixed endpoints must be resolved before /api/rooms/:roomCode routes.
    if (request.method === "GET" && pathname === "/api/health") {
      sendJson(response, 200, { ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) });
      return true;
    }
    if (request.method === "GET" && pathname === "/api/hall-of-fame") {
      sendJson(response, 200, { entries: hallOfFame });
      return true;
    }
    if (request.method === "GET" && pathname === "/api/rooms/active") {
      sendJson(response, 200, { rooms: activeRooms() });
      return true;
    }
    if (request.method === "GET" && pathname === "/api/board") {
      sendJson(response, 200, { posts: boardPosts });
      return true;
    }
    if (request.method === "POST" && pathname === "/api/board") {
      const body = await readJson(request);
      sendJson(response, 201, { post: addBoardPost(request, body.text) });
      return true;
    }
    if (request.method === "GET" && pathname === "/api/matchmaking") {
      sendJson(response, 200, {
        available: true,
        modes: ["quick", "standard", "long"],
        message: "매칭은 게임 시작 버튼을 누를 때만 요청됩니다.",
      });
      return true;
    }
    if (request.method === "POST" && pathname === "/api/matchmaking") {
      const body = await readJson(request);
      if (!String(body?.nickname || "").trim()) {
        sendJson(response, 422, { error: "매칭을 시작하려면 닉네임이 필요합니다." });
        return true;
      }
      const { room, member } = enterMatchmaking(body);
      sendJson(response, 201, { token: member.token, state: publicState(room, member) });
      return true;
    }
    if (request.method === "POST" && pathname === "/api/rooms") {
      const body = await readJson(request);
      const { room, member } = createRoom(body);
      sendJson(response, 201, { token: member.token, state: publicState(room, member) });
      return true;
    }
    if (parts.length >= 3 && parts[0] === "api" && parts[1] === "rooms" && reservedRoomPaths.has(String(parts[2]).toLowerCase())) {
      sendJson(response, 404, { error: "존재하지 않는 API 경로입니다." });
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
  if (isAllowedOrigin(origin)) {
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
      advanceRoom(room, now);
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
  console.log(`주식 서바이벌 온라인 서버: http://127.0.0.1:${port}`);
});
