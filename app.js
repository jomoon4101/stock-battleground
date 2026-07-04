import {
  CONFIG,
  GAME_MODES,
  RANDOM_ITEMS,
  SPECIAL_ITEMS,
  advanceTurn,
  borrow,
  buyBond,
  buyStock,
  cancelOrder,
  createGame,
  createRumor,
  currentPrice,
  getPlayerSummary,
  getRanking,
  nextPrice,
  placeLimitOrder,
  repay,
  sellStock,
  turnDurationSeconds,
  useRandomItem,
  useSpecialItem,
} from "./engine.js";
import { API_BASE_URL, DEFAULT_RENDER_API_BASE_URL } from "./config.js";
import { getLanguage, localizeDocument, phrase, setLanguage, translateText } from "./i18n.js";
import { createAiChatLine, createAiConversationPlan } from "./ai-chat.js?v=20260701-23";
import { mountAppShell } from "./ui-shell.js";
import { closeSheet, openSheet, setActiveAppTab } from "./ui-state.js";

mountAppShell();
setActiveAppTab("home");

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const USD_KRW_RATE = 1_500;
const money = (value, compact = false) => {
  const number = Math.round(Number(value) || 0);
  if (getLanguage() === "en") {
    const dollars = number / USD_KRW_RATE;
    const absolute = Math.abs(dollars);
    const sign = dollars < 0 ? "-" : "";
    if (compact && absolute >= 1_000_000) return `${sign}$${(absolute / 1_000_000).toFixed(2)}M`;
    if (compact && absolute >= 1_000) return `${sign}$${(absolute / 1_000).toFixed(1)}K`;
    const digits = absolute < 10_000 ? 2 : 0;
    return `${sign}$${absolute.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  }
  if (compact && Math.abs(number) >= 100_000_000) return `${number < 0 ? "-" : ""}₩${(Math.abs(number) / 100_000_000).toFixed(2)}억`;
  if (compact && Math.abs(number) >= 10_000) return `${number < 0 ? "-" : ""}₩${(Math.abs(number) / 10_000).toFixed(0)}만`;
  return `${number < 0 ? "-" : ""}₩${Math.abs(number).toLocaleString("ko-KR")}`;
};
const currencyInputValue = (won) => getLanguage() === "en" ? (Number(won) / USD_KRW_RATE).toFixed(2) : String(Math.round(Number(won)));
const wonFromCurrencyInput = (value) => Math.round((Number(value) || 0) * (getLanguage() === "en" ? USD_KRW_RATE : 1));
const displayText = (value) => {
  const translated = translateText(String(value));
  if (getLanguage() !== "en") return translated;
  return translated.replace(/₩([\d,]+)/g, (_, amount) => money(Number(amount.replaceAll(",", ""))));
};
const percent = (value) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const deployedOnVercel = globalThis.location?.hostname?.endsWith(".vercel.app") === true;
const resolvedApiBaseUrl = String(API_BASE_URL || (deployedOnVercel ? DEFAULT_RENDER_API_BASE_URL : "")).replace(/\/$/, "");
const apiUrl = (path) => `${resolvedApiBaseUrl}${path}`;
const NICKNAME_WORDS = ["존버", "상한가", "떡상", "물타기", "풀매수", "단타", "급등", "반등", "배당", "차트", "몰빵", "손절", "매집", "불타기", "저점"];
const NICKNAME_CREATURES = ["개미", "황소", "곰", "여우", "고래", "사마귀", "잠자리", "딱정벌레", "부엉이", "거북이", "매", "늑대", "토끼", "하이에나", "꿀벌"];
// Synthetic game disclosures inspired by official Form 8-K material-event categories.
const DISCLOSURE_TEMPLATES = Object.freeze([
  { impact: "up", tagKo: "주요 계약", tagEn: "MATERIAL CONTRACT", ko: (stock) => `${stock.name}, 핵심 고객과 중장기 공급 계약 협상을 진행 중이라고 밝혔습니다.`, en: (stock) => `${stock.name} disclosed talks for a long-term supply agreement with a key customer.` },
  { impact: "up", tagKo: "자산 취득", tagEn: "ASSET ACQUISITION", ko: (stock) => `${stock.name}, 생산 효율 확대를 위한 신규 설비와 핵심 자산 취득을 완료했습니다.`, en: (stock) => `${stock.name} completed an acquisition of equipment and strategic assets to expand capacity.` },
  { impact: "neutral", tagKo: "실적 발표", tagEn: "OPERATING RESULTS", ko: (stock) => `${stock.name}, 잠정 실적과 다음 분기 영업 전망을 이사회에 보고했습니다.`, en: (stock) => `${stock.name} reported preliminary results and its operating outlook for the next quarter.` },
  { impact: "down", tagKo: "재무 의무", tagEn: "FINANCIAL OBLIGATION", ko: (stock) => `${stock.name}, 운영자금 확보를 위한 신규 차입 및 기존 부채 재조정 계획을 공시했습니다.`, en: (stock) => `${stock.name} disclosed new financing and a restructuring plan for existing obligations.` },
  { impact: "down", tagKo: "손상 검토", tagEn: "IMPAIRMENT REVIEW", ko: (stock) => `${stock.name}, 일부 사업 자산의 가치 하락 여부를 검토하고 있다고 밝혔습니다.`, en: (stock) => `${stock.name} is reviewing whether certain business assets require an impairment charge.` },
  { impact: "neutral", tagKo: "경영진 변경", tagEn: "LEADERSHIP CHANGE", ko: (stock) => `${stock.name}, 신사업 강화를 위해 최고운영책임자 선임 안건을 승인했습니다.`, en: (stock) => `${stock.name} approved a new chief operating officer appointment to support expansion.` },
  { impact: "down", tagKo: "구조조정", tagEn: "RESTRUCTURING", ko: (stock) => `${stock.name}, 비핵심 사업 정리와 일회성 재편 비용 발생 가능성을 공시했습니다.`, en: (stock) => `${stock.name} disclosed a non-core business exit and possible one-time restructuring costs.` },
  { impact: "up", tagKo: "주주 환원", tagEn: "CAPITAL RETURN", ko: (stock) => `${stock.name}, 잉여현금 범위에서 자사주 취득 검토에 착수했습니다.`, en: (stock) => `${stock.name} began reviewing a share repurchase within available free cash flow.` },
  { impact: "neutral", tagKo: "자본 변경", tagEn: "CAPITAL CHANGE", ko: (stock) => `${stock.name}, 성장 투자 재원 마련을 위한 자본 구조 변경안을 검토합니다.`, en: (stock) => `${stock.name} is reviewing a capital-structure change to fund future investment.` },
  { impact: "up", tagKo: "사업 승인", tagEn: "BUSINESS APPROVAL", ko: (stock) => `${stock.name}, 신규 서비스의 주요 인허가 절차가 예정대로 진행 중이라고 안내했습니다.`, en: (stock) => `${stock.name} said key approval steps for a new service are progressing on schedule.` },
  { impact: "down", tagKo: "운영 리스크", tagEn: "OPERATING RISK", ko: (stock) => `${stock.name}, 일부 공급망 지연이 단기 생산 일정에 영향을 줄 수 있다고 공시했습니다.`, en: (stock) => `${stock.name} disclosed that supply-chain delays may affect its near-term production schedule.` },
  { impact: "neutral", tagKo: "기타 중요사항", tagEn: "OTHER MATERIAL EVENT", ko: (stock) => `${stock.name}, 전략적 사업 검토를 시작했으나 구체적인 결정은 없다고 밝혔습니다.`, en: (stock) => `${stock.name} began a strategic business review but said no specific decision has been made.` },
]);
const randomItem = (items) => items[Math.floor(Math.random() * items.length)];
const randomNickname = () => `${randomItem(NICKNAME_WORDS)}${randomItem(NICKNAME_CREATURES)}`;
const selectedSetup = () => {
  const mode = GAME_MODES[$("#game-speed").value] || GAME_MODES.standard;
  return { playerCount: mode.playerCount, difficulty: mode.difficulty, totalTurns: mode.totalTurns };
};

function updateCurrencySymbols() {
  document.documentElement.dataset.currency = getLanguage() === "en" ? "usd" : "krw";
}

let game = null;
let speed = "standard";
let online = false;
let roomState = null;
let viewerId = "PLAYER-001";
let eventStream = null;
let selectedStock = 0;
let tradeSide = "buy";
let chartType = "line";
let stockSort = { key: "name", direction: "asc" };
let paused = false;
let remainingSeconds = 0;
let totalTurnSeconds = 0;
let timerHandle = null;
let lastFrame = 0;
let activeItem = null;
let previousAssets = null;
let resultShown = false;
let lastCountdownNumber = null;
let rankAnimationTurnSeen = 0;
let activeRankEffects = new Map();
let soloRankMovements = new Map();
let soloAssetStreaks = new Map();
let soloLastAssets = new Map();
let selectedAvatar = { kind: "meme", index: 0 };
let currentMessageTarget = null;
let lastLeaderNoticeId = null;
let notificationHistory = [];
let eliminationShown = false;
let matchingTimer = null;
let activeRoomsTimer = null;
let activeRoomsRequestId = 0;
let matchmakingPending = false;
let currencyInputsLanguage = null;
let seenNoticeIds = new Set();
let noticesInitialized = false;
let sectorRailClickSuppressed = false;
let seenRumorMessageIds = new Set();
let seenGlobalChatIds = new Set();
let globalChatCollapsed = false;
let localAiConversationGeneration = 0;
const stockDetailPanelOrigins = new Map();
const myPlayer = () => game?.players.find((player) => player.id === viewerId);
const playerSummary = () => online ? game.viewerSummary : getPlayerSummary(game, viewerId);

function topStockFor(playerId) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player?.holdings) return null;
  let best = null;
  player.holdings.forEach((quantity, stockIndex) => {
    if (quantity <= 0) return;
    const value = quantity * currentPrice(game, stockIndex);
    const stock = game.stocks[stockIndex];
    if (!best || value > best.value) best = { stockIndex, name: stock.name, ticker: stock.ticker, quantity, value };
  });
  return best;
}

function portfolioFor(playerId) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player?.holdings) return [];
  return player.holdings.map((quantity, stockIndex) => {
    if (quantity <= 0) return null;
    const stock = game.stocks[stockIndex];
    return { stockIndex, name: stock.name, ticker: stock.ticker, quantity, value: quantity * currentPrice(game, stockIndex) };
  }).filter(Boolean).sort((a, b) => b.value - a.value);
}

function decorateLocalRanking(ranking) {
  return ranking.map((entry) => ({
    ...entry,
    avatar: game.players.find((player) => player.id === entry.playerId)?.avatar,
    performance: game.players.find((player) => player.id === entry.playerId)?.performance || [],
    movement: soloRankMovements.get(entry.playerId) || 0,
    assetRiseStreak: soloAssetStreaks.get(entry.playerId) || 0,
    topStock: topStockFor(entry.playerId),
    portfolio: portfolioFor(entry.playerId),
  }));
}

const displayRanking = () => online ? game.displayRanking : decorateLocalRanking(getRanking(game, { display: true, viewerId }));
const actualRanking = () => online ? game.actualRanking : decorateLocalRanking(getRanking(game, { display: false, viewerId }));

function initializeCurrencyInputs() {
  if (!game || currencyInputsLanguage === getLanguage()) return;
  currencyInputsLanguage = getLanguage();
  const english = getLanguage() === "en";
  for (const [selector, won] of [["#loan-amount", 1_000_000], ["#bond-amount", 500_000]]) {
    const input = $(selector);
    input.value = currencyInputValue(won);
    input.min = english ? "0.01" : "100000";
    input.step = english ? "0.01" : "100000";
  }
  $("#limit-price").value = currencyInputValue(currentPrice(game, selectedStock));
  $("#limit-price").min = english ? "0.01" : "1";
  $("#limit-price").step = english ? "0.01" : "1";
}

function deliverLocalRumor() {
  const player = myPlayer();
  if (!player || player.eliminated) return false;
  game.messages ??= [];
  const rumor = createRumor(game, game.turn, viewerId);
  game.messages.push({ id: crypto.randomUUID(), fromId: rumor.senderId, fromName: rumor.senderName, toId: viewerId, text: rumor.text, createdAt: Date.now(), read: false, system: "rumor", stockIndex: rumor.stockIndex, direction: rumor.direction, startTurn: rumor.startTurn, endTurn: rumor.endTurn });
  return true;
}

function announceNewRumorMessages() {
  const fresh = (game?.messages || []).filter((message) => message.system === "rumor" && message.toId === viewerId && !seenRumorMessageIds.has(message.id));
  fresh.forEach((message, index) => {
    seenRumorMessageIds.add(message.id);
    receiveGameNotice({
      id: `rumor-arrival-${message.id}`,
      type: "rumor-arrival",
      icon: "📩",
      text: getLanguage() === "en" ? "A new market whisper has arrived. Check your mailbox." : "새 찌라시가 도착했습니다. 쪽지함에서 확인하세요.",
      turn: game.turn,
      createdAt: message.createdAt || Date.now(),
    }, index * 400);
  });
}

async function requestJson(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body != null && !Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
  const response = await fetch(apiUrl(path), {
    ...options,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "서버 요청을 처리하지 못했습니다.");
  return payload;
}

function saveSession(code, token) {
  localStorage.setItem("stock-bg-session", JSON.stringify({ code, token }));
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem("stock-bg-session")); }
  catch { return null; }
}

function clearSession() {
  localStorage.removeItem("stock-bg-session");
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  toast.textContent = displayText(message);
  $("#toast-region").append(toast);
  setTimeout(() => toast.remove(), 3200);
}

function avatarPosition(index) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return `${(col / 3) * 100}% ${(row / 2) * 100}%`;
}

function applyAvatar(element, avatar) {
  if (!element) return;
  element.classList.add("profile-image");
  element.style.backgroundImage = "";
  element.style.backgroundPosition = "center";
  if (avatar?.kind === "upload") {
    element.classList.remove("meme");
    element.style.backgroundImage = `url(${avatar.data})`;
    element.style.backgroundSize = "cover";
  } else {
    element.classList.add("meme");
    element.style.backgroundSize = "400% 300%";
    element.style.backgroundPosition = avatarPosition(avatar?.index || 0);
  }
}

function avatarMarkup(avatar, className = "") {
  if (avatar?.kind === "upload") return `<span class="profile-image ${className}" style="background-image:url('${avatar.data}');background-size:cover"></span>`;
  return `<span class="profile-image meme ${className}" style="background-position:${avatarPosition(avatar?.index || 0)}"></span>`;
}

function renderProfilePicker() {
  const uploaded = selectedAvatar.kind === "upload"
    ? `<button class="profile-option uploaded is-active" style="background-image:url('${selectedAvatar.data}')" aria-label="Uploaded profile"></button>`
    : "";
  $("#profile-picker").innerHTML = uploaded + Array.from({ length: 10 }, (_, index) => `<button class="profile-option ${selectedAvatar.kind === "meme" && selectedAvatar.index === index ? "is-active" : ""}" data-profile-index="${index}" style="background-position:${avatarPosition(index)}" aria-label="Profile ${index + 1}"></button>`).join("");
  applyAvatar($("#profile-preview"), selectedAvatar);
}

function initializeIntegratedLayout() {
  const rankingPanel = $(".ranking-panel");
  const rankingBody = $("#ranking-modal-body");
  if (rankingPanel && rankingBody) rankingBody.append(rankingPanel);
}

function resizeUploadedAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error("PNG, JPG 또는 WebP 이미지를 선택하세요."));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 96;
      const ctx = canvas.getContext("2d");
      const side = Math.min(image.width, image.height); const sx = (image.width - side) / 2; const sy = (image.height - side) / 2;
      ctx.drawImage(image, sx, sy, side, side, 0, 0, 96, 96);
      resolve({ kind: "upload", data: canvas.toDataURL("image/jpeg", 0.78) });
    };
    image.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    image.src = URL.createObjectURL(file);
  });
}

function safeAction(action, successMessage) {
  try {
    const result = action();
    if (successMessage) showToast(typeof successMessage === "function" ? successMessage(result) : successMessage);
    renderAll();
    return result;
  } catch (error) {
    showToast(error.message || "작업을 완료하지 못했습니다.", "error");
    return null;
  }
}

function beginSoloGame() {
  const nickname = $("#nickname").value.trim() || (getLanguage() === "en" ? "Player" : "플레이어");
  speed = $("#game-speed").value;
  online = false;
  roomState = null;
  viewerId = "PLAYER-001";
  const setup = selectedSetup();
  game = createGame({ nickname, seed: Date.now(), language: getLanguage(), avatar: selectedAvatar, ...setup });
  game.messages = [];
  deliverLocalRumor();
  selectedStock = 0;
  tradeSide = "buy";
  paused = false;
  previousAssets = null;
  rankAnimationTurnSeen = 0;
  activeRankEffects = new Map();
  soloRankMovements = new Map();
  soloAssetStreaks = new Map();
  soloLastAssets = new Map(getRanking(game, { display: false }).map((entry) => [entry.playerId, entry.assets]));
  currencyInputsLanguage = null;
  seenNoticeIds = new Set();
  $("#start-screen").classList.add("is-hidden");
  $("#app-shell").classList.remove("is-hidden");
  initializeCurrencyInputs();
  setupTurnClock();
  renderAll();
  requestAnimationFrame(drawChart);
  scheduleLocalAiConversation({ chance: 0.9, count: 2 });
}

async function createOnlineRoom() {
  try {
    const payload = await requestJson("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ nickname: $("#nickname").value, speed: $("#game-speed").value, language: getLanguage(), avatar: selectedAvatar, ...selectedSetup() }),
    });
    online = true;
    saveSession(payload.state.room.code, payload.token);
    applyServerState(payload.state);
    connectToRoom(payload.state.room.code, payload.token);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function joinOnlineRoom(roomCode = null) {
  const code = (typeof roomCode === "string" ? roomCode : $("#room-code-input").value).trim().toUpperCase();
  if (code.length !== 6) {
    showToast("6자리 방 코드를 입력하세요.", "error");
    return;
  }
  try {
    const payload = await requestJson(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify({ nickname: $("#nickname").value, avatar: selectedAvatar }),
    });
    online = true;
    saveSession(code, payload.token);
    applyServerState(payload.state);
    connectToRoom(code, payload.token);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function loadActiveRooms() {
  const list = $("#active-survival-list");
  if (!list) return;
  const requestId = ++activeRoomsRequestId;
  list.innerHTML = `<p class="active-survival-empty is-loading">${getLanguage() === "en" ? "Checking available survival games..." : "참여 가능한 서바이벌을 확인하고 있습니다."}</p>`;
  try {
    const data = await requestJson("/api/rooms/active");
    if (requestId !== activeRoomsRequestId) return;
    const receivedRooms = Array.isArray(data) ? data : Array.isArray(data?.rooms) ? data.rooms : [];
    const rooms = receivedRooms.filter((room) => room && room.code && room.status === "running" && Number(room.participantCount) < Number(room.capacity));
    list.innerHTML = rooms.length
      ? rooms.map((room) => `<article class="active-survival-card">
          <div><strong>${escapeHtml(room.title || room.code)}</strong><code>${escapeHtml(room.code)}</code></div>
          <p>${getLanguage() === "en" ? `Round ${room.turn} in progress · ${room.participantCount} / ${room.capacity} players` : `${room.turn}라운드 진행중 · ${room.participantCount} / ${room.capacity}명 참여중`}</p>
          <span>${getLanguage() === "en" ? "IN PROGRESS" : "진행중"}</span>
          <button class="button button-secondary" data-active-room-code="${escapeHtml(room.code)}">${getLanguage() === "en" ? "JOIN NOW" : "바로 참여"}</button>
        </article>`).join("")
      : `<p class="active-survival-empty">${getLanguage() === "en" ? "There are no survival games available to join." : "현재 참여 가능한 서바이벌이 없습니다."}</p>`;
  } catch {
    if (requestId !== activeRoomsRequestId) return;
    list.innerHTML = `<p class="active-survival-empty is-error">${getLanguage() === "en" ? "Could not load the room list. Refresh and try again." : "방 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요."}</p>`;
  }
}

async function startMatchmaking() {
  if (matchmakingPending) return;
  const nickname = $("#nickname").value.trim();
  if (!nickname) {
    showToast(getLanguage() === "en" ? "Enter a trader nickname first." : "매칭을 시작하려면 트레이더 닉네임을 입력하세요.", "error");
    return;
  }
  matchmakingPending = true;
  $("#start-button").disabled = true;
  try {
    const payload = await requestJson("/api/matchmaking", {
      method: "POST",
      body: JSON.stringify({ nickname, speed: $("#game-speed").value, language: getLanguage(), avatar: selectedAvatar, ...selectedSetup() }),
    });
    if (!payload?.token || !payload?.state?.room?.code) throw new Error(getLanguage() === "en" ? "The matchmaking response was incomplete." : "매칭 서버 응답이 올바르지 않습니다.");
    online = true;
    saveSession(payload.state.room.code, payload.token);
    applyServerState(payload.state);
    connectToRoom(payload.state.room.code, payload.token);
  } catch (error) { showToast(error.message, "error"); }
  finally {
    matchmakingPending = false;
    $("#start-button").disabled = false;
  }
}

function connectToRoom(code, token) {
  eventStream?.close();
  eventStream = new EventSource(apiUrl(`/api/rooms/${encodeURIComponent(code)}/events?token=${encodeURIComponent(token)}`));
  eventStream.onmessage = (event) => {
    try { applyServerState(JSON.parse(event.data)); }
    catch { showToast("게임 상태를 읽지 못했습니다.", "error"); }
  };
  eventStream.onerror = () => {
    const status = $(".connection");
    if (status) status.innerHTML = "<i></i> RECONNECTING";
  };
}

function applyServerState(state) {
  online = true;
  roomState = state.room;
  setLanguage(state.room.language || "ko");
  updateCurrencySymbols();
  viewerId = state.viewer.playerId;
  speed = state.room.speed;
  if (state.room.status === "matching") {
    game = null;
    $("#start-screen").classList.add("is-hidden");
    $("#lobby-screen").classList.add("is-hidden");
    $("#app-shell").classList.add("is-hidden");
    $("#matchmaking-screen").classList.remove("is-hidden");
    renderMatching(state);
    return;
  }
  if (state.room.status === "waiting") {
    game = null;
    $("#start-screen").classList.add("is-hidden");
    $("#app-shell").classList.add("is-hidden");
    $("#lobby-screen").classList.remove("is-hidden");
    renderLobby(state);
    return;
  }
  const incomingGame = state.game;
  if (incomingGame?.rankAnimationTurn && incomingGame.rankAnimationTurn !== rankAnimationTurnSeen && incomingGame.actualRanking.length) {
    rankAnimationTurnSeen = incomingGame.rankAnimationTurn;
    activeRankEffects = new Map(incomingGame.actualRanking.filter((entry) => entry.movement).map((entry) => [entry.playerId, entry.movement > 0 ? "up" : "down"]));
    const effectTurn = rankAnimationTurnSeen;
    setTimeout(() => {
      if (rankAnimationTurnSeen === effectTurn) {
        activeRankEffects.clear();
        if (game) renderRanking();
      }
    }, 2400);
  }
  game = incomingGame;
  initializeCurrencyInputs();
  clearInterval(matchingTimer); matchingTimer = null;
  $("#matchmaking-screen").classList.add("is-hidden");
  $("#start-screen").classList.add("is-hidden");
  $("#lobby-screen").classList.add("is-hidden");
  $("#app-shell").classList.remove("is-hidden");
  totalTurnSeconds = state.room.durationSeconds;
  remainingSeconds = state.room.deadline ? Math.max(0, (state.room.deadline - Date.now()) / 1000) : 0;
  if (!timerHandle) {
    lastFrame = performance.now();
    timerHandle = setInterval(tickClock, 100);
  }
  paused = false;
  renderAll();
  handleLeaderNotice();
  handleGameNotices();
  if (game.elimination && !eliminationShown) showElimination();
  if (game.finished && !resultShown) {
    resultShown = true;
    showResults();
  }
}

function renderMatching(state) {
  const seconds = Math.max(0, Math.ceil((state.room.matchDeadline - Date.now()) / 1000));
  $("#matching-countdown").textContent = seconds;
  $("#matching-player-count").textContent = phrase("matchingCount", { count: state.room.memberCount, capacity: state.room.capacity });
  localizeDocument($("#matchmaking-screen"));
  if (!matchingTimer) matchingTimer = setInterval(() => {
    if (!roomState?.matchDeadline) return;
    $("#matching-countdown").textContent = Math.max(0, Math.ceil((roomState.matchDeadline - Date.now()) / 1000));
  }, 200);
}

function renderLobby(state) {
  $("#room-code").textContent = state.room.code;
  $("#lobby-count").textContent = `${state.room.memberCount} / ${state.room.capacity}명`;
  $("#lobby-members").innerHTML = state.room.members.map((member) => `
    <div class="lobby-member">${avatarMarkup(member.avatar, "member-avatar")}<span><b>${escapeHtml(member.nickname)}${member.isHost ? " · 방장" : ""}</b><small>${member.playerId}</small></span><em class="${member.connected ? "" : "offline"}">${member.connected ? "ONLINE" : "RECONNECTING"}</em></div>`).join("");
  $("#start-match-button").classList.toggle("is-hidden", !state.viewer.isHost);
  $("#lobby-note").textContent = state.viewer.isHost ? "준비되면 시작하세요. 빈자리는 즉시 AI가 채웁니다." : "방장이 게임을 시작할 때까지 기다려주세요.";
  localizeDocument($("#lobby-screen"));
}

async function startOnlineMatch() {
  const session = loadSession();
  if (!session) return;
  try {
    const state = await requestJson(`/api/rooms/${session.code}/start?token=${encodeURIComponent(session.token)}`, { method: "POST", body: "{}" });
    applyServerState(state);
  } catch (error) { showToast(error.message, "error"); }
}

async function sendAction(type, payload, successMessage) {
  const session = loadSession();
  if (!session) throw new Error("온라인 세션이 없습니다.");
  const response = await requestJson(`/api/rooms/${session.code}/action?token=${encodeURIComponent(session.token)}`, {
    method: "POST",
    body: JSON.stringify({ type, payload }),
  });
  if (successMessage) showToast(successMessage);
  return response.result;
}

async function leaveOnlineRoom() {
  const session = loadSession();
  if (online && session) {
    try { await requestJson(`/api/rooms/${session.code}/leave?token=${encodeURIComponent(session.token)}`, { method: "POST", body: "{}" }); }
    catch { /* Always clear the local session when the user leaves. */ }
  }
  resetToStart();
}

async function resumeOnlineSession() {
  const session = loadSession();
  if (!session) return;
  try {
    const state = await requestJson(`/api/rooms/${session.code}/state?token=${encodeURIComponent(session.token)}`);
    applyServerState(state);
    connectToRoom(session.code, session.token);
  } catch {
    clearSession();
  }
}

function setupTurnClock() {
  clearInterval(timerHandle);
  totalTurnSeconds = turnDurationSeconds(game.turn, speed);
  remainingSeconds = totalTurnSeconds;
  lastFrame = performance.now();
  timerHandle = setInterval(tickClock, 100);
  renderClock();
}

function tickClock() {
  if (!game || game.finished) {
    lastFrame = performance.now();
    return;
  }
  if (online) {
    remainingSeconds = roomState?.deadline ? Math.max(0, (roomState.deadline - Date.now()) / 1000) : 0;
    renderClock();
    return;
  }
  if (paused) {
    lastFrame = performance.now();
    return;
  }
  const now = performance.now();
  remainingSeconds -= (now - lastFrame) / 1000;
  lastFrame = now;
  if (remainingSeconds <= 0) endCurrentTurn();
  else renderClock();
}

function renderClock() {
  const seconds = Math.max(0, Math.ceil(remainingSeconds));
  const clockText = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  $("#timer").textContent = clockText;
  $("#survival-time").textContent = clockText;
  $("#turn-progress").style.width = `${totalTurnSeconds ? Math.max(0, (remainingSeconds / totalTurnSeconds) * 100) : 0}%`;
  const countdown = $("#final-countdown");
  const showCountdown = !game?.finished && !paused && game?.turn % 10 === 0 && seconds > 0 && seconds <= 10;
  countdown.classList.toggle("is-hidden", !showCountdown);
  if (showCountdown && seconds !== lastCountdownNumber) {
    lastCountdownNumber = seconds;
    $("#countdown-number").textContent = seconds;
    countdown.classList.remove("tick");
    requestAnimationFrame(() => countdown.classList.add("tick"));
  }
  if (!showCountdown) lastCountdownNumber = null;
}

function endCurrentTurn() {
  if (online) return;
  const beforeRanking = getRanking(game, { display: false, viewerId });
  const beforeRanks = new Map(beforeRanking.map((entry) => [entry.playerId, entry.rank]));
  const result = safeAction(() => advanceTurn(game));
  if (!result) return;
  const afterRanking = getRanking(game, { display: false, viewerId });
  const rankingBlind = game.turn % 10 === 0 || game.rankBlindTurn === game.turn;
  if (!rankingBlind && beforeRanking[0] && afterRanking[0] && beforeRanking[0].playerId !== afterRanking[0].playerId) {
    game.leaderNotice = { id: crypto.randomUUID(), nickname: afterRanking[0].nickname, kind: "changed", createdAt: Date.now() };
    handleLeaderNotice();
  }
  soloRankMovements = new Map(afterRanking.map((entry) => [entry.playerId, (beforeRanks.get(entry.playerId) || entry.rank) - entry.rank]));
  soloAssetStreaks = new Map(afterRanking.map((entry) => {
    const previous = soloLastAssets.get(entry.playerId) ?? entry.assets;
    return [entry.playerId, entry.assets > previous ? (soloAssetStreaks.get(entry.playerId) || 0) + 1 : 0];
  }));
  soloLastAssets = new Map(afterRanking.map((entry) => [entry.playerId, entry.assets]));
  activeRankEffects = new Map([...soloRankMovements].filter(([, movement]) => movement).map(([id, movement]) => [id, movement > 0 ? "up" : "down"]));
  setTimeout(() => { activeRankEffects.clear(); if (game) renderRanking(); }, 2400);
  if (result.finished) {
    clearInterval(timerHandle);
    renderAll();
    showResults();
  } else {
    handleSoloTurnEvents(result);
    setupTurnClock();
    renderAll();
    scheduleLocalAiConversation({ chance: 0.72 });
    if (myPlayer()?.eliminated && !eliminationShown) showElimination();
  }
}

function renderAll() {
  if (!game) return;
  renderHeader();
  renderMarket();
  renderSelectedStock();
  renderAssets();
  renderRanking();
  renderTradePanel();
  renderPortfolioPanel();
  renderIntelCards();
  renderSurvivalStatus();
  renderClock();
  renderOrders();
  renderFinance();
  renderItems();
  renderLogs();
  renderMessageBadges();
  renderGlobalChat();
  announceNewRumorMessages();
  if (!$("#message-modal").classList.contains("is-hidden")) renderMessages();
  localizeDocument($("#app-shell"));
  requestAnimationFrame(drawChart);
}

function renderHeader() {
  $("#turn-number").textContent = String(game.turn).padStart(2, "0");
  $("#turn-total").textContent = `/ ${game.totalTurns ?? CONFIG.totalTurns}`;
  const checkpoint = game.turn % 10 === 0;
  $("#round-label").textContent = checkpoint
    ? (getLanguage() === "en" ? "BLIND ROUND · BONUS TIME" : "블라인드 라운드 · 추가 시간")
    : (getLanguage() === "en" ? "LIVE ROUND · TIME LIMIT" : "일반 라운드 · 제한시간");
  const showBlindBanner = checkpoint || game.rankBlindTurn === game.turn;
  $("#blind-banner").classList.toggle("is-hidden", !showBlindBanner);
  const bannerText = game.rankBlindTurn === game.turn
    ? "아이템으로 모든 플레이어의 실시간 순위가 차단되었습니다."
    : "이 라운드에는 직전 턴의 순위와 자산만 표시됩니다.";
  $("#blind-banner small").textContent = bannerText;
  $("#pause-button").textContent = paused ? "▶" : "Ⅱ";
  $("#pause-button").title = paused ? (getLanguage() === "en" ? "Resume" : "계속") : (getLanguage() === "en" ? "Pause" : "일시정지");
  $("#pause-button").classList.toggle("is-hidden", online);
  $(".connection").innerHTML = `<i></i> ${online ? `ROOM ${roomState.code}` : "SOLO"}`;
  $("#game-room-code b").textContent = online ? roomState.code : "SOLO";
  $("#game-room-code small").textContent = online ? "OPEN · ROOM" : "OFFLINE";
}

function renderSurvivalStatus() {
  const summary = playerSummary();
  const ranking = actualRanking();
  const rank = ranking.find((entry) => entry.playerId === viewerId)?.rank ?? myPlayer()?.eliminationRank ?? "-";
  const playerCount = game.playerCount ?? game.players.length;
  const numericRank = Number(rank);
  const danger = numericRank === playerCount ? "danger" : numericRank >= Math.max(3, playerCount - 1) ? "warning" : "safe";
  const labels = getLanguage() === "en"
    ? { safe: "SAFE", warning: "CAUTION", danger: "DANGER" }
    : { safe: "안전", warning: "주의", danger: "위험" };
  $("#survival-round").textContent = `${game.turn} / ${game.totalTurns ?? CONFIG.totalTurns}`;
  $("#survival-rank").textContent = rank === "-" ? "-" : getLanguage() === "en" ? `#${rank}` : `${rank}위`;
  $("#survival-assets").textContent = money(summary.assets, true);
  $("#survival-cash").textContent = money(summary.cash, true);
  $("#survival-risk").textContent = labels[danger];
  $("#survival-risk").className = danger;
  const ended = online && Boolean(roomState?.turnEnded);
  $("#end-turn-button").disabled = game.finished || myPlayer()?.eliminated || ended;
  $("#end-turn-button b").textContent = ended ? (getLanguage() === "en" ? "WAITING" : "종료 완료") : (getLanguage() === "en" ? "END TURN" : "턴 종료");
}

function stockChange(index) {
  if (game.turn <= 1) return 0;
  const stock = game.stocks[index];
  const current = currentPrice(game, index);
  const previous = stock.prices[game.turn - 2];
  return current / previous - 1;
}

function stockStreak(index) {
  const prices = game.stocks[index].prices.slice(0, game.turn);
  if (prices.length < 4) return { direction: null, count: 0 };
  let direction = null; let count = 0;
  for (let cursor = prices.length - 1; cursor > 0; cursor -= 1) {
    const nextDirection = prices[cursor] > prices[cursor - 1] ? "up" : prices[cursor] < prices[cursor - 1] ? "down" : null;
    if (!nextDirection || (direction && nextDirection !== direction)) break;
    direction ??= nextDirection;
    count += 1;
  }
  return { direction: count >= 3 ? direction : null, count };
}

function volumeSignal(candles, index) {
  if (!candles?.[index] || index < 3) return null;
  const previous = candles.slice(Math.max(0, index - 5), index).map((candle) => candle.volume).filter(Number.isFinite);
  if (previous.length < 3) return null;
  const average = previous.reduce((sum, volume) => sum + volume, 0) / previous.length;
  const ratio = candles[index].volume / Math.max(1, average);
  if (ratio >= 1.65) return { type: "surge", ratio };
  if (ratio <= 0.62) return { type: "drop", ratio };
  return null;
}

function ceoPresentation(stock, change) {
  const mood = change > 0.0005 ? "up" : change < -0.0005 ? "down" : "neutral";
  const column = { neutral: "0%", up: "50%", down: "100%" }[mood];
  const vertical = stock.sectorKey === "technology" ? "32%" : "center";
  return { mood, className: `ceo-${stock.sectorKey}`, style: `background-position:${column} ${vertical}` };
}

function sectorLevelLabel(value) {
  if (getLanguage() !== "en") return value || "-";
  return { "높음": "HIGH", "중간": "MID", "낮음": "LOW" }[value] || value || "-";
}

function sectorLevelClass(value) {
  return value === "높음" ? "level-high" : value === "중간" ? "level-mid" : value === "낮음" ? "level-low" : "";
}

function sectorMiniChart(stock, change) {
  const values = [...(stock.history || []).slice(-5), ...stock.prices.slice(0, game.turn)].slice(-14);
  if (values.length < 2) values.push(values[0] || stock.startPrice || 100);
  const width = 260;
  const height = 76;
  const padX = 8;
  const padY = 8;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(1, maximum - minimum);
  const points = values.map((value, index) => {
    const x = padX + (index / Math.max(1, values.length - 1)) * (width - padX * 2);
    const y = height - padY - ((value - minimum) / spread) * (height - padY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const trend = change < 0 ? "down" : change > 0 ? "up" : "neutral";
  return `<svg class="sector-mini-chart ${trend}" viewBox="0 0 ${width} ${height}" aria-hidden="true" preserveAspectRatio="none">
    <line x1="8" y1="68" x2="252" y2="68"></line>
    <line x1="8" y1="38" x2="252" y2="38"></line>
    <polyline points="${points}"></polyline>
  </svg>`;
}

function renderMarket() {
  const search = $("#stock-search").value.trim().toLowerCase();
  $("#stock-count-title").textContent = getLanguage() === "en" ? `STOCK SECTORS · ${game.stocks.length}` : `주식 섹터 · ${game.stocks.length}개`;
  const rows = game.stocks.map((stock, index) => ({ stock, index, change: stockChange(index), streak: stockStreak(index) }))
    .filter(({ stock }) => !search || stock.name.toLowerCase().includes(search) || stock.ticker.toLowerCase().includes(search) || stock.sector.toLowerCase().includes(search))
    .sort((a, b) => {
      let comparison = 0;
      if (stockSort.key === "name") comparison = a.stock.sector.localeCompare(b.stock.sector, getLanguage() === "en" ? "en" : "ko");
      if (stockSort.key === "price") comparison = currentPrice(game, a.index) - currentPrice(game, b.index);
      if (stockSort.key === "change") comparison = a.change - b.change;
      return stockSort.direction === "asc" ? comparison : -comparison;
    });
  $$(".stock-table-head button").forEach((button) => {
    const active = button.dataset.sortKey === stockSort.key;
    button.classList.toggle("is-active", active);
    const icon = $("i", button);
    if (icon) icon.textContent = active ? (stockSort.direction === "asc" ? "↑" : "↓") : "↕";
  });
  const stockList = $("#stock-list");
  const previousScroll = stockList.scrollLeft;
  stockList.innerHTML = rows.map(({ stock, index, change, streak }) => {
    const quantity = myPlayer().holdings[index] || 0;
    const average = myPlayer().averagePrices?.[index] || 0;
    const pnl = quantity ? quantity * (currentPrice(game, index) - average) : 0;
    const owned = quantity > 0;
    const risk = Math.abs(change) >= 0.05 ? (getLanguage() === "en" ? "HIGH RISK" : "위험 구역") : Math.abs(change) >= 0.025 ? (getLanguage() === "en" ? "WATCH" : "관심 구역") : (getLanguage() === "en" ? "STABLE" : "안정 구역");
    const ceo = ceoPresentation(stock, change);
    const stats = stock.sectorStats || {};
    return `
    <article class="stock-row sector-card sector-${stock.sectorKey} mood-${ceo.mood} ${index === selectedStock ? "is-active" : ""}" data-stock-index="${index}" data-open-stock-detail="${index}" role="listitem" tabindex="0" aria-label="${escapeHtml(stock.sector)} · ${escapeHtml(stock.name)} · ${percent(change)} · ${getLanguage() === "en" ? "open trading window" : "거래창 열기"}">
      <button class="sector-open-button" type="button" data-open-stock-detail="${index}" aria-label="${escapeHtml(stock.sector)} 거래창 열기">${getLanguage() === "en" ? "OPEN TRADE" : "거래창 열기"} ›</button>
      <span class="sector-card-heading"><em>${stock.icon || "◆"} ${escapeHtml(stock.sector)}</em>${owned ? `<i class="owned-badge">${getLanguage() === "en" ? "OWNED" : "보유중"}</i>` : ""}</span>
      <span class="sector-ceo ${ceo.className}" style="${ceo.style}" role="img" aria-label="${ceo.mood === "up" ? (getLanguage() === "en" ? "CEO cheering" : "CEO 환호") : ceo.mood === "down" ? (getLanguage() === "en" ? "CEO disappointed" : "CEO 우울") : (getLanguage() === "en" ? "CEO neutral" : "CEO 기본 표정")}"></span>
      <span class="sector-company"><b class="${streak.direction ? `streak-${streak.direction}` : ""}">${escapeHtml(stock.name)}</b><small>${stock.ticker} · ${escapeHtml(stock.sectorDescription || "")}</small></span>
      <span class="sector-stats"><small class="${sectorLevelClass(stats.profitability)}">${getLanguage() === "en" ? "RETURN" : "수익성"} <b>${sectorLevelLabel(stats.profitability)}</b></small><small class="${sectorLevelClass(stats.stability)}">${getLanguage() === "en" ? "STABILITY" : "안정성"} <b>${sectorLevelLabel(stats.stability)}</b></small><small class="${sectorLevelClass(stats.volatility)}">${getLanguage() === "en" ? "VOLATILITY" : "변동성"} <b>${sectorLevelLabel(stats.volatility)}</b></small></span>
      <span class="sector-quote"><strong>${money(currentPrice(game, index), true)}</strong><b class="stock-change ${change >= 0 ? "up" : "down"}">${percent(change)}</b><small>${risk}${streak.direction ? ` · ${streak.count}${getLanguage() === "en" ? "-turn streak" : "턴 연속"}` : ""}</small></span>
      <span class="sector-position">
        <small>${getLanguage() === "en" ? "MY SHARES" : "내 보유수량"}<b>${quantity.toLocaleString()}${getLanguage() === "en" ? " sh" : "주"}</b></small>
        <small>${getLanguage() === "en" ? "AVG PRICE" : "평균 매수가"}<b>${quantity ? money(average, true) : "-"}</b></small>
        <small>${getLanguage() === "en" ? "UNREALIZED" : "평가 손익"}<b class="${pnl > 0 ? "profit" : pnl < 0 ? "loss" : ""}">${quantity ? `${pnl >= 0 ? "+" : ""}${money(pnl, true)}` : "-"}</b></small>
      </span>
      <span class="sector-chart-shell"><small>${getLanguage() === "en" ? "SECTOR PRICE TREND" : "섹터 가격 흐름"}</small>${sectorMiniChart(stock, change)}</span>
    </article>`;
  }).join("");
  stockList.scrollLeft = previousScroll;
}

function renderSelectedStock() {
  const stock = game.stocks[selectedStock];
  const price = currentPrice(game, selectedStock);
  const change = stockChange(selectedStock);
  const streak = stockStreak(selectedStock);
  const ceo = ceoPresentation(stock, change);
  const visibleSeries = [...(stock.history || []), ...stock.prices.slice(0, game.turn)];
  $("#selected-stock-icon").textContent = stock.icon || "◆";
  $("#selected-stock-icon").title = stock.sector;
  $("#selected-ticker").textContent = `${stock.ticker} · ${stock.sector.toUpperCase()}`;
  $("#selected-name").textContent = stock.name;
  $("#selected-name").className = streak.direction ? `streak-${streak.direction}` : "";
  $("#selected-price").textContent = money(price);
  $("#selected-change").textContent = percent(change);
  $("#selected-change").classList.toggle("down", change < 0);
  $("#stock-detail-sector").textContent = `${stock.icon || "◆"} ${stock.sector}`;
  $("#stock-detail-title").textContent = stock.name;
  $("#stock-detail-description").textContent = stock.sectorDescription || "";
  const detailCeo = $("#stock-detail-ceo");
  detailCeo.className = `sector-ceo ${ceo.className}`;
  detailCeo.style.cssText = ceo.style;
  const quantity = myPlayer().holdings[selectedStock] || 0;
  const average = myPlayer().averagePrices?.[selectedStock] || 0;
  const pnl = quantity ? quantity * (price - average) : 0;
  $("#detail-sell").disabled = quantity <= 0;
  $("#selected-sector").textContent = stock.sector;
  $("#selected-owned").textContent = `${quantity.toLocaleString()}${getLanguage() === "en" ? " shares" : "주"}`;
  $("#selected-average").textContent = quantity ? money(average) : "-";
  $("#selected-pnl").textContent = quantity ? `${pnl >= 0 ? "+" : ""}${money(pnl)}` : "-";
  $("#selected-pnl").className = quantity ? (pnl >= 0 ? "profit" : "loss") : "";
  $("#selected-origin").textContent = `${getLanguage() === "en" ? "ANONYMIZED SECTOR PATTERN" : "익명 섹터 패턴"} · ${stock.year}`;
  $("#chart-turn-marker").textContent = `현재 T${String(game.turn).padStart(2, "0")}`;
  $("#stat-open").textContent = money(visibleSeries[0], true);
  $("#stat-high").textContent = money(Math.max(...visibleSeries), true);
  $("#stat-low").textContent = money(Math.min(...visibleSeries), true);
  const candle = stock.candles?.[game.turn - 1];
  $("#stat-volume").textContent = candle ? `${candle.volume.toLocaleString("ko-KR")}주` : "-";
  const allCandles = [...(stock.historyCandles || []), ...(stock.candles || []).slice(0, game.turn)];
  const signal = volumeSignal(allCandles, allCandles.length - 1);
  const volumeAlert = $("#volume-alert");
  volumeAlert.className = `volume-alert ${signal?.type || ""} ${signal ? "" : "is-hidden"}`;
  volumeAlert.textContent = signal ? (signal.type === "surge" ? `▲ ${getLanguage() === "en" ? "VOLUME SURGE" : "거래량 폭등"}` : `▼ ${getLanguage() === "en" ? "VOLUME DROP" : "거래량 폭락"}`) : "";
  $("#stat-owned").textContent = `${myPlayer().holdings[selectedStock].toLocaleString()}주`;
  $("#limit-price").value ||= currencyInputValue(price);
}

function renderPortfolioPanel() {
  const player = myPlayer();
  const holdings = player.holdings.map((quantity, stockIndex) => {
    if (!quantity || !game.stocks[stockIndex]) return null;
    const stock = game.stocks[stockIndex];
    const price = currentPrice(game, stockIndex);
    const average = player.averagePrices?.[stockIndex] || price;
    const value = price * quantity;
    const pnl = (price - average) * quantity;
    return { quantity, stockIndex, stock, price, average, value, pnl, returnRate: average ? price / average - 1 : 0 };
  }).filter(Boolean).sort((a, b) => b.value - a.value);
  $("#portfolio-summary").textContent = getLanguage() === "en" ? `${holdings.length} positions` : `${holdings.length}개 종목`;
  $("#portfolio-list").innerHTML = holdings.length ? holdings.map((entry) => `
    <button class="portfolio-card" data-portfolio-stock="${entry.stockIndex}">
      <span class="portfolio-icon">${entry.stock.icon || "◆"}</span><span class="portfolio-name"><b>${escapeHtml(entry.stock.name)}</b><small>${escapeHtml(entry.stock.sector)} · ${entry.quantity.toLocaleString()}${getLanguage() === "en" ? " shares" : "주"}</small></span>
      <span><small>${getLanguage() === "en" ? "AVG" : "평균 매수가"}</small><b>${money(entry.average, true)}</b></span><span><small>${getLanguage() === "en" ? "NOW" : "현재가"}</small><b>${money(entry.price, true)}</b></span>
      <span class="${entry.pnl >= 0 ? "profit" : "loss"}"><small>${getLanguage() === "en" ? "RETURN" : "수익률"}</small><b>${percent(entry.returnRate)}</b></span><span><small>${getLanguage() === "en" ? "VALUE" : "평가금액"}</small><b>${money(entry.value, true)}</b></span>
      <span class="portfolio-pnl ${entry.pnl >= 0 ? "profit" : "loss"}"><small>${getLanguage() === "en" ? "P/L" : "평가 손익"}</small><b>${entry.pnl >= 0 ? "+" : ""}${money(entry.pnl, true)}</b></span>
    </button>`).join("") : `<p>${getLanguage() === "en" ? "You do not own any stocks yet. Select a stock and buy your first position." : "아직 보유한 종목이 없습니다. 종목을 선택해 매수해보세요."}</p>`;
}

function renderIntelCards() {
  const stock = game.stocks[selectedStock];
  const english = getLanguage() === "en";
  const marketEntries = Array.from({ length: Math.min(3, game.turn) }, (_, offset) => {
    const turn = game.turn - offset;
    const price = stock.prices[Math.max(0, turn - 1)];
    const previous = stock.prices[Math.max(0, turn - 2)] || price;
    const change = previous ? price / previous - 1 : 0;
    return { turn, price, change, direction: change > 0 ? "up" : change < 0 ? "down" : "flat" };
  });
  const disclosureEntries = Array.from({ length: Math.min(3, game.stocks.length) }, (_, offset) => {
    const stockIndex = offset === 0 ? selectedStock : (selectedStock + offset * 2) % game.stocks.length;
    const reportStock = game.stocks[stockIndex];
    const reportTurn = Math.max(1, game.turn - offset);
    const templateIndex = Math.abs((Number(game.seed) + reportTurn * 17 + stockIndex * 31 + offset * 7) % DISCLOSURE_TEMPLATES.length);
    const disclosure = DISCLOSURE_TEMPLATES[templateIndex];
    return { stockIndex, stock: reportStock, reportTurn, disclosure, text: english ? disclosure.en(reportStock) : disclosure.ko(reportStock) };
  });
  const rumorEntries = [...(game.messages || [])].filter((message) => message.system === "rumor").reverse().slice(0, 3);
  $("#intel-cards").innerHTML = `
    <div class="intel-ticker-item intel-feed-row news"><b class="intel-category">${english ? "[MARKET]" : "[시장]"}</b><div class="intel-feed-items">${marketEntries.map((entry, index) => `<div class="intel-feed-card age-${index}"><small>T${String(entry.turn).padStart(2, "0")}</small><button type="button" class="intel-sector-link" data-intel-stock="${selectedStock}">${escapeHtml(stock.sector)}</button><span>${escapeHtml(stock.name)}</span><strong class="intel-change-value ${entry.direction}">${percent(entry.change)}</strong><button type="button" class="intel-trade-link" data-intel-stock="${selectedStock}">${english ? "TRADE" : "거래"} ›</button></div>`).join("")}</div></div>
    <div class="intel-ticker-item intel-feed-row report"><b class="intel-category">${english ? "[DISCLOSURE]" : "[공시]"}</b><div class="intel-feed-items">${disclosureEntries.map((entry, index) => `<div class="intel-feed-card disclosure-card age-${index}"><small>T${String(entry.reportTurn).padStart(2, "0")}</small><span class="intel-report-tag">${english ? entry.disclosure.tagEn : entry.disclosure.tagKo}</span><button type="button" class="intel-sector-link" data-intel-stock="${entry.stockIndex}">${escapeHtml(entry.stock.sector)}</button><span>${escapeHtml(entry.text)}</span><button type="button" class="intel-trade-link report-link" data-intel-stock="${entry.stockIndex}">${english ? "DETAIL" : "상세"} ›</button></div>`).join("")}</div></div>
    <div class="intel-ticker-item intel-feed-row rumor"><b class="intel-category">${english ? "[RUMOR]" : "[찌라시]"}</b><div class="intel-feed-items">${rumorEntries.length ? rumorEntries.map((rumor, index) => { const rumorStock = game.stocks[rumor.stockIndex]; return `<button type="button" class="intel-feed-card rumor-card age-${index} ${rumor.read ? "" : "is-new"}" data-intel-rumor><small>T${String(rumor.startTurn || game.turn).padStart(2, "0")}</small><span>${escapeHtml(rumorStock ? `${rumorStock.sector} · ${rumorStock.name}` : (english ? "Market whisper" : "찌라시"))}</span><em>${escapeHtml(rumor.text)}</em><i>${english ? "OPEN" : "열기"} ›</i></button>`; }).join("") : `<div class="intel-feed-card age-0"><em>${english ? "No new rumor has arrived." : "새로 도착한 찌라시가 없습니다."}</em></div>`}</div></div>`;
}

function renderAssets() {
  const player = myPlayer();
  const summary = playerSummary();
  const ranking = displayRanking();
  const realRanking = actualRanking();
  const displayedRank = ranking.find((entry) => entry.playerId === player.id)?.rank ?? "-";
  const actualRank = realRanking.find((entry) => entry.playerId === player.id)?.rank ?? "-";
  const copied = player.copiedIdentity?.turn === game.turn ? player.copiedIdentity : null;

  $("#player-name").textContent = copied?.nickname || player.nickname;
  $("#player-id").textContent = copied?.id || player.id;
  $("#avatar-text").textContent = "";
  applyAvatar($("#my-profile-button"), player.avatar);
  $("#identity-card").classList.toggle("is-copied", Boolean(copied));
  $("#my-rank").textContent = `${displayedRank}위`;
  $("#my-rank").title = displayedRank !== actualRank ? `실제 순위 ${actualRank}위` : "";
  $("#my-goal-kicker").textContent = getLanguage() === "en" ? "MY GOAL" : "MY GOAL · 내 목표";
  $("#net-assets").textContent = money(summary.assets);
  $("#net-assets").classList.toggle("negative", summary.assets < 0);
  $("#asset-cash").textContent = money(summary.cash, true);
  $("#asset-stocks").textContent = money(summary.stocks, true);
  $("#asset-bonds").textContent = money(summary.bonds, true);
  $("#asset-debt").textContent = `-${money(summary.debt)}`;
  $("#salary").textContent = money(summary.salary, true);
  $("#tax-rate").textContent = `${Math.round(summary.taxRate * 100)}%`;
  $("#finance-debt").textContent = money(summary.debt);
  $("#finance-bonds").textContent = money(summary.bonds);

  const actualIndex = realRanking.findIndex((entry) => entry.playerId === player.id);
  if (player.eliminated || actualIndex < 0) {
    $("#my-goal-title").textContent = getLanguage() === "en" ? "SURVIVAL ENDED" : "생존 종료";
    $("#my-goal-detail").textContent = getLanguage() === "en" ? "Review your trading history and prepare for the next game." : "거래 기록을 복기하고 다음 게임을 준비하세요.";
    $("#my-goal-progress").style.width = "100%";
  } else if (actualIndex === 0) {
    const runnerUp = realRanking[1];
    const lead = runnerUp ? Math.max(0, summary.assets - runnerUp.assets) : 0;
    $("#my-goal-title").textContent = getLanguage() === "en" ? "DEFEND 1ST PLACE" : "1위 수성";
    $("#my-goal-detail").textContent = runnerUp
      ? (getLanguage() === "en" ? `Lead over 2nd: ${money(lead, true)}` : `2위와의 자산 격차 ${money(lead, true)}`)
      : (getLanguage() === "en" ? "You are the final survivor." : "최후의 생존자입니다.");
    $("#my-goal-progress").style.width = "100%";
  } else {
    const target = realRanking[actualIndex - 1];
    const gap = Math.max(1, target.assets - summary.assets + 1);
    const progress = target.assets > 0 ? Math.max(4, Math.min(99, summary.assets / target.assets * 100)) : 4;
    $("#my-goal-title").textContent = getLanguage() === "en" ? `OVERTAKE #${target.rank}` : `${target.rank}위 추월`;
    $("#my-goal-detail").textContent = getLanguage() === "en" ? `${money(gap, true)} more net worth needed` : `순자산 ${money(gap, true)} 추가 필요`;
    $("#my-goal-progress").style.width = `${progress}%`;
  }

  const positiveTotal = Math.max(1, Math.max(0, summary.cash) + summary.stocks + summary.bonds);
  $("#cash-bar").style.width = `${Math.max(0, summary.cash) / positiveTotal * 100}%`;
  $("#stock-bar").style.width = `${summary.stocks / positiveTotal * 100}%`;
  $("#bond-bar").style.width = `${summary.bonds / positiveTotal * 100}%`;

  if (previousAssets !== null && summary.assets !== previousAssets) {
    const delta = summary.assets - previousAssets;
    $("#asset-delta").textContent = `${delta >= 0 ? "+" : ""}${money(delta, true)}`;
    $("#asset-delta").style.color = delta >= 0 ? "var(--blue)" : "var(--red)";
  }
  previousAssets = summary.assets;
  if (!$("#holdings-modal").classList.contains("is-hidden")) renderHoldingsModal();
}

function renderHoldingsModal() {
  if (!game) return;
  const player = myPlayer();
  const holdings = player.holdings
    .map((quantity, stockIndex) => ({ quantity, stockIndex, stock: game.stocks[stockIndex] }))
    .filter((entry) => entry.quantity > 0)
    .map((entry) => ({ ...entry, price: currentPrice(game, entry.stockIndex), value: entry.quantity * currentPrice(game, entry.stockIndex), change: stockChange(entry.stockIndex) }))
    .sort((a, b) => b.value - a.value);
  const total = holdings.reduce((sum, entry) => sum + entry.value, 0);
  $("#holdings-total").textContent = money(total);
  $("#holdings-count").textContent = `${holdings.length}개 종목`;
  $("#holdings-list").innerHTML = holdings.map((entry) => `
    <div class="holding-row">
      <button class="holding-main" data-holding-stock="${entry.stockIndex}">
        <span class="holding-flag">${entry.stock.icon || "◆"}</span>
        <span class="holding-name"><strong>${escapeHtml(entry.stock.name)}</strong><small>${entry.stock.ticker} · ${entry.quantity.toLocaleString("ko-KR")}주 · ${percent(entry.change)}</small></span>
        <span class="holding-value"><b>${money(entry.value)}</b><small>현재가 ${money(entry.price, true)}</small></span>
      </button>
      <span class="holding-actions"><button class="quick-buy" data-holding-action="buy" data-stock-index="${entry.stockIndex}">매수</button><button class="quick-sell" data-holding-action="sell" data-stock-index="${entry.stockIndex}">매도</button></span>
    </div>`).join("");
}

function openHoldingsModal() {
  renderHoldingsModal();
  openSheet("holdings-modal");
}

function activateTradeTab(tabName) {
  $$('.tab').forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === tabName));
  $$('.tab-content').forEach((content) => content.classList.toggle("is-active", content.id === `trade-tab-${tabName}`));
}

function renderStockDetailSectorPicker() {
  $("#stock-detail-sector-list").innerHTML = game.stocks.map((stock, stockIndex) => {
    const change = stockChange(stockIndex);
    return `<button type="button" role="tab" aria-selected="${stockIndex === selectedStock}" class="${stockIndex === selectedStock ? "is-active" : ""}" data-detail-stock-index="${stockIndex}"><span>${stock.icon || "◆"}</span><b>${escapeHtml(stock.sector)}</b><small>${money(currentPrice(game, stockIndex), true)} <em class="${change > 0 ? "up" : change < 0 ? "down" : ""}">${percent(change)}</em></small></button>`;
  }).join("");
  requestAnimationFrame(() => $("#stock-detail-sector-list [aria-selected='true']")?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }));
}

function mountStockDetailPanels() {
  const detailBody = $("#stock-detail-body");
  if (!detailBody) return;
  for (const selector of [".chart-panel", ".trade-panel"]) {
    const panel = $(selector);
    if (!panel) continue;
    if (!stockDetailPanelOrigins.has(panel)) {
      stockDetailPanelOrigins.set(panel, { parent: panel.parentNode, nextSibling: panel.nextSibling });
    }
    if (panel.parentNode !== detailBody) detailBody.append(panel);
  }
}

function restoreStockDetailPanels() {
  for (const [panel, { parent, nextSibling }] of stockDetailPanelOrigins) {
    if (!parent) continue;
    if (nextSibling?.parentNode === parent) parent.insertBefore(panel, nextSibling);
    else parent.append(panel);
  }
  stockDetailPanelOrigins.clear();
}

function closeStockDetail() {
  closeSheet("stock-detail-modal");
  restoreStockDetailPanels();
}

function openStockDetail(stockIndex = selectedStock, side = null) {
  selectedStock = Number(stockIndex);
  $("#limit-price").value = currencyInputValue(currentPrice(game, selectedStock));
  $("#trade-quantity").value = 1;
  if (side) setTradeSide(side);
  activateTradeTab("trade");
  mountStockDetailPanels();
  renderMarket();
  renderSelectedStock();
  renderTradePanel();
  renderStockDetailSectorPicker();
  openSheet("stock-detail-modal");
  localizeDocument($("#stock-detail-modal"));
  requestAnimationFrame(() => {
    drawChart();
    if (side) $("#trade-quantity").focus();
  });
}

function openRankingModal() {
  renderRanking();
  openSheet("ranking-modal");
  localizeDocument($("#ranking-modal"));
  requestAnimationFrame(() => $("#rank-search").focus());
}

function jumpToHoldingStock(stockIndex, side = null) {
  closeSheet("holdings-modal");
  closeSheet("rank-detail-modal");
  openStockDetail(stockIndex, side);
}

function renderRanking() {
  const query = $("#rank-search").value.trim().toLowerCase();
  const ranking = displayRanking().filter((entry) => !query || entry.nickname.toLowerCase().includes(query) || entry.playerId.toLowerCase().includes(query));
  const blockedByItem = game.rankBlindTurn === game.turn;
  const checkpoint = game.turn % 10 === 0 && !game.finished;
  $("#rank-status").textContent = blockedByItem ? "통신 차단" : checkpoint ? `T${String(game.turn - 1).padStart(2, "0")} 기준` : game.finished ? "최종" : "실시간";
  $("#rank-status").classList.toggle("blind", blockedByItem || checkpoint);
  $("#ranking-list").classList.toggle("is-blind", blockedByItem);
  $("#ranking-list").innerHTML = ranking.map((entry) => {
    const effect = activeRankEffects.get(entry.playerId);
    const movement = Number(entry.movement) || 0;
    const streak = Number(entry.assetRiseStreak) || 0;
    return `
    <button class="rank-row ${entry.playerId === viewerId ? "is-me" : ""} ${effect ? `rank-${effect}` : ""} ${streak >= 2 ? "is-hot-streak" : ""}" data-player-id="${entry.playerId}" aria-label="${escapeHtml(entry.nickname)} 상세 정보">
      <span class="rank-number">${String(entry.rank).padStart(2, "0")}</span>
      ${avatarMarkup(entry.avatar, "rank-avatar")}
      <span class="rank-person"><b>${escapeHtml(entry.nickname)} ${streak >= 2 ? `<em class="streak-mark">연속 ${streak}↑</em>` : ""}</b><small>${entry.playerId}</small></span>
      <span class="rank-assets-wrap"><i class="rank-move ${movement > 0 ? "up" : movement < 0 ? "down" : ""}">${movement > 0 ? `▲${movement}` : movement < 0 ? `▼${Math.abs(movement)}` : ""}</i><span class="rank-assets ${entry.assets < 0 ? "negative" : ""}">${money(entry.assets, true)}</span></span>
      <span class="rank-message-button" data-message-player="${entry.playerId}" title="쪽지 보내기">✉</span>
    </button>`;
  }).join("");
}

function openRankDetail(playerId) {
  const entries = [...actualRanking(), ...displayRanking()];
  let entry = entries.find((candidate) => candidate.playerId === playerId);
  if (!entry && playerId === viewerId && myPlayer()) {
    const player = myPlayer();
    entry = { playerId, nickname: player.nickname, avatar: player.avatar, rank: player.eliminationRank || game.playerCount || game.players.length, assets: playerSummary().assets, performance: player.performance || [], portfolio: portfolioFor(playerId), topStock: topStockFor(playerId), assetRiseStreak: 0 };
  }
  if (!entry) return;
  $("#rank-detail-title").textContent = `${entry.rank}위 플레이어 정보`;
  $("#rank-detail-avatar").textContent = entry.nickname.slice(0, 1);
  applyAvatar($("#rank-detail-avatar"), entry.avatar);
  $("#rank-detail-name").textContent = entry.nickname;
  $("#rank-detail-id").textContent = entry.playerId;
  $("#rank-detail-rank").textContent = `${entry.rank}위`;
  $("#rank-detail-assets").textContent = money(entry.assets);
  const portfolio = entry.portfolio || (entry.topStock ? [entry.topStock] : []);
  $("#rank-detail-stock").innerHTML = portfolio.length
    ? `<span class="portfolio-heading">보유 종목 · 클릭해서 차트 보기</span>${portfolio.map((holding, index) => `<button class="rank-stock-jump ${index === 0 ? "is-largest" : ""}" data-rank-stock="${holding.stockIndex}"><strong>${escapeHtml(holding.name)}</strong><b>${holding.ticker}</b><small>${holding.quantity.toLocaleString("ko-KR")}주 · 평가액 ${money(holding.value)}</small></button>`).join("")}`
    : `<span>가장 많이 보유한 종목</span><strong>보유 종목 없음</strong><small>현재 공개할 주식 포지션이 없습니다.</small>`;
  $("#rank-detail-streak").textContent = entry.assetRiseStreak >= 2 ? `자산이 ${entry.assetRiseStreak}턴 연속 상승 중입니다.` : "연속 자산 상승 기록이 없습니다.";
  openSheet("rank-detail-modal");
  $("#rank-detail-message").dataset.messagePlayer = entry.playerId;
  $("#rank-detail-message").classList.toggle("is-hidden", entry.playerId === viewerId);
  drawHistoryChart($("#rank-history-chart"), entry.performance || [], "rank");
  drawHistoryChart($("#asset-history-chart"), entry.performance || [], "assets");
  localizeDocument($("#rank-detail-modal"));
}

function drawHistoryChart(canvas, points, field = "assets") {
  if (!canvas || !points.length) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(220, rect.width || 260); const height = Math.max(100, rect.height || 120); const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = width * dpr; canvas.height = height * dpr;
  const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, width, height);
  const values = points.map((point) => Number(point[field]));
  const min = Math.min(...values); const max = Math.max(...values); const range = Math.max(1, max - min);
  const x = (index) => 8 + index / Math.max(1, points.length - 1) * (width - 16);
  const y = (value) => field === "rank" ? 8 + (value - min) / range * (height - 20) : 8 + (max - value) / range * (height - 20);
  ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1;
  for (let line = 0; line < 4; line += 1) { const py = 8 + line / 3 * (height - 20); ctx.beginPath(); ctx.moveTo(8, py); ctx.lineTo(width - 8, py); ctx.stroke(); }
  ctx.beginPath(); points.forEach((point, index) => index ? ctx.lineTo(x(index), y(point[field])) : ctx.moveTo(x(index), y(point[field])));
  ctx.strokeStyle = field === "rank" ? "#d9ff43" : "#ff5b62"; ctx.lineWidth = 2; ctx.stroke();
  const last = points.at(-1); ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(x(points.length - 1), y(last[field]), 3, 0, Math.PI * 2); ctx.fill();
}

function renderTradePanel() {
  const player = myPlayer();
  const stock = game.stocks[selectedStock];
  const price = currentPrice(game, selectedStock);
  const quantity = Math.max(0, Math.floor(Number($("#trade-quantity").value) || 0));
  const owned = player.holdings[selectedStock] || 0;
  $("#order-total").textContent = money(price * quantity);
  $("[data-side='buy']").textContent = getLanguage() === "en" ? `BUY ${stock.name}` : `${stock.name} 매수`;
  $("[data-side='sell']").textContent = owned ? (getLanguage() === "en" ? `SELL ${stock.name}` : `${stock.name} 매도`) : (getLanguage() === "en" ? "CANNOT SELL · NO SHARES" : "매도 불가 · 보유 수량 없음");
  $("[data-side='sell']").disabled = owned <= 0;
  if (tradeSide === "sell" && owned <= 0) tradeSide = "buy";
  $$(".side-toggle button").forEach((button) => button.classList.toggle("is-active", button.dataset.side === tradeSide));
  $("#trade-submit").textContent = tradeSide === "buy"
    ? owned ? (getLanguage() === "en" ? `BUY MORE ${stock.name}` : `${stock.name} 추가 매수`) : (getLanguage() === "en" ? `BUY ${stock.name}` : `${stock.name} 매수하기`)
    : getLanguage() === "en" ? `SELL ${stock.name}` : `${stock.name} 매도하기`;
  $("#trade-submit").className = `button trade-submit ${tradeSide}`;
  const disabledReason = player.eliminated || player.frozenTurn === game.turn || player.tradeLockTurn === game.turn || game.finished || (online && roomState?.turnEnded) || (tradeSide === "sell" && owned <= 0);
  $("#trade-submit").disabled = disabledReason;
  $("#holdings-mini").innerHTML = `<span>현재 선택 종목 <b>${escapeHtml(stock.name)}</b></span><span>보유 수량 <b>${owned.toLocaleString()}주</b></span><span>평가액 <b>${money(owned * price)}</b></span><span>주문 가능 현금 <b>${money(player.cash)}</b></span>`;
}

function renderOrders() {
  const orders = myPlayer().orders;
  const actionEnded = online && roomState?.turnEnded;
  $("#order-count").textContent = orders.length;
  $("#limit-submit").disabled = game.finished || myPlayer().eliminated || actionEnded;
  $("#order-list").innerHTML = orders.map((order) => `
    <div class="order-row">
      <div><b>${escapeHtml(game.stocks[order.stockIndex].name)}</b><br><span>${order.side === "buy" ? "예약매수" : "예약매도"} ${order.quantity}주</span></div>
      <strong>${money(order.limitPrice)}</strong>
      <button data-cancel-order="${order.id}" aria-label="예약 취소" ${myPlayer().eliminated || actionEnded ? "disabled" : ""}>취소</button>
    </div>`).join("");
}

function renderFinance() {
  const player = myPlayer();
  const actionEnded = online && roomState?.turnEnded;
  $("#borrow-button").disabled = game.finished || player.eliminated || playerSummary().assets < 0 || actionEnded;
  $("#repay-button").disabled = game.finished || player.eliminated || player.debt <= 0 || actionEnded;
  $("#bond-button").disabled = game.finished || player.eliminated || player.frozenTurn === game.turn || player.tradeLockTurn === game.turn || actionEnded;
}

const itemIcons = ["◈", "↗", "↘", "▦", "◎", "#", "×"];
function renderItems() {
  const summary = playerSummary();
  const eliminated = myPlayer().eliminated;
  const actionEnded = online && roomState?.turnEnded;
  $("#special-gate").classList.toggle("is-locked", !summary.specialEligible);
  $("#random-gate").classList.toggle("is-locked", !summary.randomEligible);
  $("#special-items").innerHTML = SPECIAL_ITEMS.map((item, index) => {
    const turnBlocked = game.turn === (game.totalTurns ?? CONFIG.totalTurns) && ["future-price", "rising-stock", "falling-stock", "trade-freeze"].includes(item.id);
    return `<button class="item-card" data-special-item="${item.id}" ${!summary.specialEligible || game.finished || eliminated || turnBlocked || actionEnded ? "disabled" : ""}>
      <span class="item-icon">${itemIcons[index]}</span><strong>${item.name}</strong><small>${item.description}</small><em>자산의 ${item.rate * 100}%</em>
    </button>`;
  }).join("");
  $("#random-items").innerHTML = RANDOM_ITEMS.map((item, index) => `
    <button class="item-card" data-random-item="${item.id}" ${!summary.randomEligible || game.finished || eliminated || actionEnded ? "disabled" : ""}>
      <span class="item-icon">${index ? "⟳" : "?"}</span><strong>${item.name}</strong><small>${item.description}</small><em>현재 월급 1회분</em>
    </button>`).join("");
}

function renderLogs() {
  $("#log-list").innerHTML = game.logs.map((log) => {
    const amount = Number(log.amountDelta);
    const hasAmount = Number.isFinite(amount) && amount !== 0;
    const localizedMessage = displayText(log.message);
    const message = Number.isInteger(log.stockIndex)
      ? `<button class="log-stock-link" data-log-stock="${log.stockIndex}">${escapeHtml(localizedMessage)}</button>`
      : `<span>${escapeHtml(localizedMessage)}</span>`;
    return `<div class="log-row ${log.type}"><time>T${String(log.turn).padStart(2, "0")}</time><i></i>${message}${hasAmount ? `<b class="log-amount ${amount > 0 ? "increase" : "decrease"}">${amount > 0 ? "+" : ""}${money(amount)}</b>` : ""}</div>`;
  }).join("");
}

function setTradeSide(side) {
  tradeSide = side;
  $$(".side-toggle button").forEach((button) => button.classList.toggle("is-active", button.dataset.side === side));
  renderTradePanel();
}

async function submitTrade() {
  const quantity = Number($("#trade-quantity").value);
  if (online) {
    try {
      await sendAction("trade", { side: tradeSide, stockIndex: selectedStock, quantity }, `${game.stocks[selectedStock].name} ${tradeSide === "buy" ? "매수" : "매도"} 완료`);
    } catch (error) { showToast(error.message, "error"); }
    return;
  }
  safeAction(
    () => tradeSide === "buy" ? buyStock(game, selectedStock, quantity) : sellStock(game, selectedStock, quantity),
    `${game.stocks[selectedStock].name} ${tradeSide === "buy" ? "매수" : "매도"} 완료`,
  );
}

function selectQuickAmount(portion) {
  const player = myPlayer();
  const price = currentPrice(game, selectedStock);
  const max = tradeSide === "buy" ? Math.floor(player.cash / price) : player.holdings[selectedStock];
  $("#trade-quantity").value = Math.max(1, Math.floor(max * Number(portion)));
  renderTradePanel();
}

async function submitLimitOrder() {
  const details = {
    stockIndex: selectedStock,
    side: $("#limit-side").value,
    quantity: Number($("#limit-quantity").value),
    limitPrice: wonFromCurrencyInput($("#limit-price").value),
  };
  if (online) {
    try { await sendAction("limit-order", details, "예약 주문을 등록했습니다."); }
    catch (error) { showToast(error.message, "error"); }
  } else {
    safeAction(() => placeLimitOrder(game, details), "예약 주문을 등록했습니다.");
  }
}

function openItemModal(itemId) {
  const item = SPECIAL_ITEMS.find((candidate) => candidate.id === itemId);
  activeItem = item;
  $("#item-modal-title").textContent = item.name;
  $("#item-modal-description").textContent = item.description;
  const assets = playerSummary().assets;
  $("#item-cost").textContent = money(Math.max(0, Math.round(assets * item.rate)));
  let options = "";
  if (itemId === "future-price") {
    options = `<label class="item-option-label" for="item-stock">공개할 종목</label><select id="item-stock">${game.stocks.map((stock, index) => `<option value="${index}" ${index === selectedStock ? "selected" : ""}>${escapeHtml(stock.sector)} · ${escapeHtml(stock.name)} · ${stock.ticker}</option>`).join("")}</select>`;
  } else if (["identity-copy", "trade-freeze"].includes(itemId)) {
    const ranking = actualRanking();
    options = `<label class="item-option-label" for="item-target">대상 플레이어</label><select id="item-target">${ranking.filter((entry) => entry.playerId !== viewerId).map((entry) => `<option value="${entry.playerId}">${entry.rank}위 · ${escapeHtml(entry.nickname)} · ${money(entry.assets, true)}</option>`).join("")}</select>`;
  } else if (itemId === "fake-rank") {
    const playerCount = game.playerCount ?? game.players.length;
    options = `<label class="item-option-label" for="item-rank">표시할 순위 (1~${playerCount})</label><input id="item-rank" type="number" min="1" max="${playerCount}" value="1">`;
  }
  $("#item-options").innerHTML = options || `<p class="helper">추가 선택 없이 즉시 적용됩니다.</p>`;
  openSheet("item-modal");
}

async function confirmItem() {
  if (!activeItem) return;
  const options = {
    stockIndex: $("#item-stock")?.value,
    targetId: $("#item-target")?.value,
    rank: $("#item-rank")?.value,
  };
  let result;
  if (online) {
    try { result = await sendAction("special-item", { itemId: activeItem.id, options }); }
    catch (error) { showToast(error.message, "error"); return; }
  } else {
    result = safeAction(() => useSpecialItem(game, activeItem.id, options));
  }
  if (!result) return;
  closeSheet("item-modal");
  let message = `${activeItem.name}을 사용했습니다.`;
  if (activeItem.id === "future-price") message = `${game.stocks[result.stockIndex].name} 다음 가격: ${money(result.price)}`;
  if (activeItem.id === "rising-stock") message = `상승 신호: ${game.stocks[result.stockIndex].name}`;
  if (activeItem.id === "falling-stock") message = `하락 신호: ${game.stocks[result.stockIndex].name}`;
  showToast(message);
  activeItem = null;
}

async function useRandom(itemId) {
  let result;
  if (online) {
    try { result = await sendAction("random-item", { itemId }); }
    catch (error) { showToast(error.message, "error"); return; }
  } else {
    result = safeAction(() => useRandomItem(game, itemId));
  }
  if (!result) return;
  if (itemId === "salary-roll") showToast(`새 월급은 ${money(result.salary)}입니다.`);
  if (itemId === "portfolio-shuffle") showToast(`${result.count}개 종목으로 포트폴리오가 교체되었습니다.`);
}

function drawChart() {
  if (!game || $("#app-shell").classList.contains("is-hidden")) return;
  const canvas = $("#price-chart");
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const width = rect.width;
  const height = rect.height;
  const pad = { left: 14, right: 58, top: 12, bottom: 18 };
  const stock = game.stocks[selectedStock];
  const history = stock.history || [];
  const closes = [...history, ...stock.prices.slice(0, game.turn)];
  const fallbackCandles = closes.map((close, index) => ({ open: index ? closes[index - 1] : close, high: close, low: close, close, volume: 0 }));
  const candles = stock.historyCandles && stock.candles
    ? [...stock.historyCandles, ...stock.candles.slice(0, game.turn)]
    : fallbackCandles;
  const min = Math.min(...candles.map((candle) => candle.low)) * 0.98;
  const max = Math.max(...candles.map((candle) => candle.high)) * 1.02;
  const priceBottom = height - 73;
  const volumeTop = height - 57;
  const volumeBottom = height - pad.bottom;
  const plotWidth = width - pad.left - pad.right;
  const step = plotWidth / Math.max(1, candles.length);
  const x = (index) => pad.left + step * (index + 0.5);
  const y = (value) => pad.top + (max - value) / Math.max(1, max - min) * (priceBottom - pad.top);
  const maxVolume = Math.max(1, ...candles.map((candle) => candle.volume));
  const volumeY = (volume) => volumeBottom - volume / maxVolume * (volumeBottom - volumeTop);

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(18,62,110,.10)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#687b91";
  ctx.font = "8px IBM Plex Mono";
  ctx.textAlign = "left";
  for (let line = 0; line <= 4; line += 1) {
    const py = pad.top + line / 4 * (priceBottom - pad.top);
    ctx.beginPath(); ctx.moveTo(pad.left, py); ctx.lineTo(width - pad.right, py); ctx.stroke();
    ctx.fillText(money(max - line / 4 * (max - min), true), width - pad.right + 7, py + 3);
  }
  ctx.beginPath(); ctx.moveTo(pad.left, volumeTop - 7); ctx.lineTo(width - pad.right, volumeTop - 7); ctx.stroke();
  ctx.fillStyle = "#687b91";
  ctx.fillText("VOL", width - pad.right + 7, volumeTop + 2);

  candles.forEach((candle, index) => {
    const color = candle.close >= candle.open ? "#ff5b62" : "#36a6ff";
    const barWidth = Math.max(1, Math.min(9, step * 0.62));
    ctx.fillStyle = `${color}66`;
    ctx.fillRect(x(index) - barWidth / 2, volumeY(candle.volume), barWidth, Math.max(1, volumeBottom - volumeY(candle.volume)));
    if (index >= history.length) {
      const signal = volumeSignal(candles, index);
      if (signal) {
        const cx = x(index); const markerY = Math.max(volumeTop - 3, volumeY(candle.volume) - 4);
        ctx.fillStyle = signal.type === "surge" ? "#ff5b62" : "#36a6ff";
        ctx.beginPath();
        if (signal.type === "surge") { ctx.moveTo(cx, markerY - 5); ctx.lineTo(cx - 3.5, markerY + 1); ctx.lineTo(cx + 3.5, markerY + 1); }
        else { ctx.moveTo(cx, markerY + 5); ctx.lineTo(cx - 3.5, markerY - 1); ctx.lineTo(cx + 3.5, markerY - 1); }
        ctx.closePath(); ctx.fill();
        if (index === candles.length - 1) { ctx.font = "600 7px IBM Plex Mono"; ctx.textAlign = "center"; ctx.fillText(signal.type === "surge" ? "VOL SURGE" : "VOL DROP", cx, Math.max(8, markerY - 8)); }
      }
    }
  });

  const boundaryX = pad.left + step * history.length;
  ctx.strokeStyle = "rgba(23,104,212,.24)";
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(boundaryX, pad.top); ctx.lineTo(boundaryX, volumeBottom); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#687b91";
  ctx.textAlign = "center";
  ctx.fillText("GAME START", boundaryX, height - 5);

  if (chartType === "candle") {
    candles.forEach((candle, index) => {
      const color = candle.close >= candle.open ? "#ff5b62" : "#36a6ff";
      const cx = x(index);
      const bodyWidth = Math.max(2, Math.min(9, step * 0.64));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, y(candle.high)); ctx.lineTo(cx, y(candle.low)); ctx.stroke();
      ctx.fillStyle = color;
      const bodyTop = y(Math.max(candle.open, candle.close));
      const bodyBottom = y(Math.min(candle.open, candle.close));
      ctx.fillRect(cx - bodyWidth / 2, bodyTop, bodyWidth, Math.max(2, bodyBottom - bodyTop));
    });
  } else {
    const rising = candles.at(-1).close >= candles[0].close;
    const lineColor = rising ? "#ff5b62" : "#36a6ff";
    const gradient = ctx.createLinearGradient(0, pad.top, 0, priceBottom);
    gradient.addColorStop(0, rising ? "rgba(255,91,98,.28)" : "rgba(54,166,255,.27)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    candles.forEach((candle, index) => index ? ctx.lineTo(x(index), y(candle.close)) : ctx.moveTo(x(index), y(candle.close)));
    ctx.lineTo(x(candles.length - 1), priceBottom); ctx.lineTo(x(0), priceBottom); ctx.closePath();
    ctx.fillStyle = gradient; ctx.fill();
    ctx.beginPath();
    candles.forEach((candle, index) => index ? ctx.lineTo(x(index), y(candle.close)) : ctx.moveTo(x(index), y(candle.close)));
    ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.stroke();
    ctx.beginPath(); ctx.arc(x(candles.length - 1), y(candles.at(-1).close), 3.5, 0, Math.PI * 2); ctx.fillStyle = lineColor; ctx.fill();
  }
  canvas._chart = { candles, x, y, rect, pad, step };
}

function showResults() {
  const ranking = game.finalRanking;
  const me = ranking.find((entry) => entry.playerId === viewerId);
  $("#final-rank").textContent = me.rank;
  $("#result-message").textContent = me.rank === 1 ? `최후의 트레이더가 되었습니다. 최종 순자산 ${money(me.assets)}.` : `최종 순자산 ${money(me.assets)}. 다음 게임에서는 정보 아이템과 예약 주문을 더 일찍 활용해보세요.`;
  $("#podium").innerHTML = ranking.slice(0, 3).map((entry) => `<div><b>${entry.rank}위</b><span>${escapeHtml(entry.nickname)}</span><small>${money(entry.assets, true)}</small></div>`).join("");
  openSheet("result-modal");
}

function handleLeaderNotice() {
  const notice = game?.leaderNotice;
  if (!notice || notice.id === lastLeaderNoticeId) return;
  lastLeaderNoticeId = notice.id;
  if (game.turn % 10 === 0 || game.rankBlindTurn === game.turn) return;
  const text = phrase(notice.kind === "reclaimed" ? "leaderReclaimed" : "leaderChanged", { name: notice.nickname });
  receiveGameNotice({ id: notice.id, text, createdAt: notice.createdAt, icon: "♛", type: "leader" });
}

function receiveGameNotice(notice, delay = 0) {
  notificationHistory.unshift(notice);
  notificationHistory = notificationHistory.slice(0, 30);
  $("#notice-unread").textContent = notificationHistory.length;
  $("#notice-unread").classList.remove("is-hidden");
  setTimeout(() => {
    $("#leader-announcement span").textContent = notice.icon || "!";
    $("#leader-announcement-text").textContent = notice.text;
    $("#leader-announcement").classList.remove("is-hidden");
    setTimeout(() => $("#leader-announcement").classList.add("is-hidden"), 2300);
  }, delay);
}

function handleGameNotices() {
  if (!noticesInitialized) {
    (game.notices || []).filter((notice) => notice.turn < game.turn).forEach((notice) => seenNoticeIds.add(notice.id));
    noticesInitialized = true;
  }
  const fresh = (game.notices || []).filter((notice) => !seenNoticeIds.has(notice.id));
  fresh.forEach((notice, index) => {
    seenNoticeIds.add(notice.id);
    receiveGameNotice(notice, index * 2500);
  });
}

function handleSoloTurnEvents(result) {
  for (const event of result.holdingTaxEvents || []) {
    if (event.playerId !== viewerId) continue;
    if (event.becameEligible) {
      receiveGameNotice({ id: crypto.randomUUID(), type: "holding-tax-eligible", icon: "⚠️", text: getLanguage() === "en" ? "Cash reached the holding-tax threshold. A 2% tax applies from round 11." : "⚠️ 보유금이 2,000,000원을 넘어 11라운드부터 보유세 2%가 적용됩니다.", turn: game.turn, createdAt: Date.now() });
    }
    if (event.tax > 0) {
      receiveGameNotice({ id: crypto.randomUUID(), type: "holding-tax", icon: "💸", text: getLanguage() === "en" ? `Holding tax applied: ${event.tax.toLocaleString("en-US")} won was deducted this round.` : `💸 보유세 적용: 2,000,000원 이상 보유로 이번 라운드에 ${event.tax.toLocaleString("ko-KR")}원이 차감되었습니다.`, turn: game.turn, createdAt: Date.now() }, event.becameEligible ? 2500 : 0);
    }
    if (event.becameExempt) {
      receiveGameNotice({ id: crypto.randomUUID(), type: "holding-tax-exempt", icon: "✅", text: getLanguage() === "en" ? "Cash fell to 2,000,000 won or less, so the holding tax no longer applies." : "✅ 보유금이 2,000,000원 이하가 되어 보유세 대상에서 제외되었습니다.", turn: game.turn, createdAt: Date.now() });
    }
  }
  if (!result.finished && !myPlayer().eliminated) deliverLocalRumor();
  if (game.turn === 15) {
    receiveGameNotice({ id: crypto.randomUUID(), type: "salary-reminder", icon: getLanguage() === "en" ? "$" : "₩", text: getLanguage() === "en" ? "Five turns until payday." : "월급날까지 5턴 남았습니다.", turn: game.turn, createdAt: Date.now() });
  }
  if (result.eliminated) {
    const nickname = result.eliminated.nickname;
    receiveGameNotice({ id: crypto.randomUUID(), type: "elimination", icon: "☠", text: getLanguage() === "en" ? `${nickname} went broke and was eliminated.` : `${nickname}플레이어가 깡통을 찼습니다.`, turn: game.turn, createdAt: Date.now() }, game.turn === 15 ? 2500 : 0);
  }
}

function renderMessageBadges() {
  if (!game) return;
  const unread = online ? (game.unreadMessages || 0) : (game.messages || []).filter((message) => message.toId === viewerId && !message.read).length;
  $("#mail-unread").textContent = unread;
  $("#mail-unread").classList.toggle("is-hidden", unread <= 0);
}

function renderGlobalChat() {
  const messages = (game?.messages || []).filter((message) => message.system === "global" || message.toId === "ALL").slice(-60);
  const list = $("#global-chat-messages");
  list.innerHTML = messages.length ? messages.map((message) => {
    const sender = playerById(message.fromId);
    const senderName = message.fromName || sender?.nickname || message.fromId;
    return `<div class="global-chat-message ${message.fromId === viewerId ? "mine" : ""} ${message.ai ? "ai" : ""}"><b>${escapeHtml(senderName)}</b><span>${escapeHtml(message.text)}</span><time>${new Date(message.createdAt).toLocaleTimeString(getLanguage() === "en" ? "en-US" : "ko-KR", { hour: "2-digit", minute: "2-digit" })}</time></div>`;
  }).join("") : `<div class="global-chat-empty">${getLanguage() === "en" ? "No room messages yet. Say hello to the other survivors." : "아직 전체 메시지가 없습니다. 다른 생존자에게 인사해보세요."}</div>`;
  const unread = messages.filter((message) => message.fromId !== viewerId && !seenGlobalChatIds.has(message.id)).length;
  if (!globalChatCollapsed) messages.forEach((message) => seenGlobalChatIds.add(message.id));
  $("#global-chat-unread").textContent = unread;
  $("#global-chat-unread").classList.toggle("is-hidden", unread <= 0 || !globalChatCollapsed);
  $("#global-chat").classList.toggle("is-collapsed", globalChatCollapsed);
  $("#global-chat-toggle").setAttribute("aria-expanded", String(!globalChatCollapsed));
  if (!globalChatCollapsed) requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
}

async function sendGlobalChatMessage() {
  const input = $("#global-chat-input");
  const text = input.value.trim().slice(0, 180);
  if (!text || !game || myPlayer()?.eliminated) return;
  input.value = "";
  if (online) {
    try { await sendAction("send-global-message", { text }); }
    catch (error) { showToast(error.message, "error"); }
    return;
  }
  game.messages ??= [];
  game.messages.push({ id: crypto.randomUUID(), fromId: viewerId, fromName: myPlayer().nickname, toId: "ALL", text, createdAt: Date.now(), read: true, system: "global" });
  renderGlobalChat();
  scheduleLocalAiConversation({ chance: 0.88, triggerMessage: text, triggerName: myPlayer().nickname });
}

function playerById(playerId) { return game?.players.find((player) => player.id === playerId); }

function conversationIds(messages = game?.messages || []) {
  const latest = new Map();
  for (const message of messages) {
    if (message.system === "global" || message.toId === "ALL") continue;
    const partnerId = message.fromId === viewerId ? message.toId : message.toId === viewerId ? message.fromId : null;
    if (partnerId) latest.set(partnerId, Math.max(latest.get(partnerId) || 0, message.createdAt || 0));
  }
  return [...latest].sort((a, b) => b[1] - a[1]).map(([partnerId]) => partnerId);
}

function messageContact(partnerId, messages) {
  if (partnerId === "RUMOR") {
    const rumor = [...messages].reverse().find((message) => message.fromId === "RUMOR");
    return { id: "RUMOR", nickname: rumor?.fromName || (getLanguage() === "en" ? "Market Whisper" : "찌라시"), rumor: true, isHuman: false };
  }
  return playerById(partnerId);
}

function markThreadRead(targetId) {
  if (!targetId) return;
  if (online) sendAction("mark-messages-read", { targetId }).catch(() => {});
  else (game.messages || []).forEach((message) => { if (message.toId === viewerId && message.fromId === targetId) message.read = true; });
  renderMessageBadges();
}

function openMessages(targetId = null) {
  if (!game) return;
  const messages = game.messages || [];
  const existing = conversationIds(messages);
  currentMessageTarget = targetId || existing[0] || null;
  $("#message-recipient-panel").classList.add("is-hidden");
  renderMessages();
  openSheet("message-modal");
  markThreadRead(currentMessageTarget);
  localizeDocument($("#message-modal"));
}

function renderMessages() {
  const messages = game.messages || [];
  const ids = conversationIds(messages);
  if (currentMessageTarget && !ids.includes(currentMessageTarget)) ids.unshift(currentMessageTarget);
  const contacts = ids.map((id) => messageContact(id, messages)).filter(Boolean);
  $("#message-contacts").innerHTML = contacts.length ? contacts.map((player) => {
    const unread = messages.filter((message) => message.fromId === player.id && message.toId === viewerId && !message.read).length;
    const avatar = player.rumor ? `<span class="rank-avatar rumor-avatar">?</span>` : avatarMarkup(player.avatar, "rank-avatar");
    return `<button class="message-contact ${player.rumor ? "rumor" : ""} ${player.id === currentMessageTarget ? "is-active" : ""}" data-message-contact="${player.id}">${avatar}<span><b>${escapeHtml(player.nickname)}</b><small>${player.rumor ? (getLanguage() === "en" ? "PRIVATE MARKET TIP" : "비공개 시장 정보") : player.isHuman ? "PLAYER" : "AI TRADER"}</small></span>${unread ? `<em>${unread}</em>` : ""}</button>`;
  }).join("") : `<div class="message-empty">${getLanguage() === "en" ? "No sent or received messages yet." : "아직 주고받은 쪽지가 없습니다."}</div>`;
  const thread = messages.filter((message) => (message.fromId === viewerId && message.toId === currentMessageTarget) || (message.fromId === currentMessageTarget && message.toId === viewerId));
  $("#message-thread").innerHTML = thread.length ? thread.map((message) => `<div class="message-bubble ${message.fromId === viewerId ? "mine" : ""} ${message.system === "rumor" ? "rumor" : ""}">${escapeHtml(message.text)}<small>${new Date(message.createdAt).toLocaleTimeString(getLanguage() === "en" ? "en-US" : "ko-KR", { hour: "2-digit", minute: "2-digit" })}${message.ai ? " · AI" : message.system === "rumor" ? ` · ${getLanguage() === "en" ? `valid through turn ${message.endTurn}` : `${message.endTurn}턴 이내 정보`}` : ""}</small></div>`).join("") : `<div class="message-empty">${currentMessageTarget ? (getLanguage() === "en" ? "Start a new conversation." : "첫 쪽지를 보내 대화를 시작하세요.") : (getLanguage() === "en" ? "Select a conversation or send a new message." : "대화를 선택하거나 새 쪽지를 보내세요.")}</div>`;
  $("#message-thread").scrollTop = $("#message-thread").scrollHeight;
  const replyBlocked = !currentMessageTarget || currentMessageTarget === "RUMOR";
  $("#message-input").disabled = replyBlocked;
  $("#message-send").disabled = replyBlocked;
}

function renderMessageRecipients() {
  const query = $("#message-recipient-search").value.trim().toLowerCase();
  const recipients = game.players.filter((player) => player.id !== viewerId && !player.eliminated && (!query || player.nickname.toLowerCase().includes(query) || player.id.toLowerCase().includes(query)));
  $("#message-recipient-list").innerHTML = recipients.map((player) => `<button class="message-recipient" data-message-recipient="${player.id}">${avatarMarkup(player.avatar, "rank-avatar")}<span><b>${escapeHtml(player.nickname)}</b><small>${player.isHuman ? "PLAYER" : "AI TRADER"} · ${player.id}</small></span></button>`).join("");
}

function createLocalAiReply(target, previousMessage = "", previousSpeakerName = "") {
  const recentTexts = (game.messages || []).filter((message) => message.ai).slice(-20).map((message) => message.text);
  return createAiChatLine(game, target, {
    language: getLanguage(), previousMessage, previousSpeakerName,
    phase: previousMessage ? 1 : 0, recentTexts,
  }).text;
}

function scheduleLocalAiConversation(options = {}) {
  if (!game || online || game.finished) return false;
  const aiPlayers = game.players.filter((player) => !player.isHuman && !player.eliminated);
  if (!aiPlayers.length || Math.random() > Number(options.chance ?? 0.72)) return false;
  const recentTexts = (game.messages || [])
    .filter((message) => message.system === "global")
    .slice(-24)
    .map((message) => message.text);
  const plan = createAiConversationPlan(game, aiPlayers, {
    language: getLanguage(), triggerMessage: options.triggerMessage || "", triggerName: options.triggerName || "",
    recentTexts, count: options.count || 2 + Math.floor(Math.random() * 3),
  });
  if (!plan.length) return false;
  const activeGame = game;
  const generation = ++localAiConversationGeneration;
  plan.forEach((entry, index) => setTimeout(() => {
    if (game !== activeGame || game.finished || generation !== localAiConversationGeneration || entry.speaker.eliminated) return;
    game.messages.push({
      id: crypto.randomUUID(), fromId: entry.speaker.id, fromName: entry.speaker.nickname, toId: "ALL",
      text: entry.text, createdAt: Date.now(), read: false, system: "global", ai: true, aiConversation: true,
      stockIndex: entry.stockIndex, claimDirection: entry.claimedRise ? "up" : "down",
    });
    game.messages = game.messages.slice(-300);
    renderGlobalChat();
  }, 650 + index * 820 + Math.floor(Math.random() * 260)));
  return true;
}

async function sendDirectMessage() {
  const text = $("#message-input").value.trim();
  if (!text || !currentMessageTarget) return;
  $("#message-input").value = "";
  if (online) {
    try { await sendAction("send-message", { targetId: currentMessageTarget, text }); }
    catch (error) { showToast(error.message, "error"); }
    return;
  }
  game.messages ??= [];
  game.messages.push({ id: crypto.randomUUID(), fromId: viewerId, toId: currentMessageTarget, text, createdAt: Date.now(), read: true });
  renderMessages();
  const target = playerById(currentMessageTarget);
  if (target && !target.isHuman) setTimeout(() => {
    const reply = createLocalAiReply(target, text, myPlayer().nickname);
    game.messages.push({ id: crypto.randomUUID(), fromId: target.id, toId: viewerId, text: reply, createdAt: Date.now(), read: false, ai: true });
    renderMessages(); renderMessageBadges();
  }, 700);
}

function openNotifications() {
  $("#notifications-list").innerHTML = notificationHistory.length
    ? notificationHistory.map((notice) => `<div class="notice-row"><b>${escapeHtml(notice.icon || "!")}</b> ${escapeHtml(notice.text)}<small>${new Date(notice.createdAt).toLocaleTimeString()}</small></div>`).join("")
    : `<div class="notice-row">${getLanguage() === "en" ? "No notifications yet." : "아직 알림이 없습니다."}</div>`;
  openSheet("notifications-modal");
  $("#notice-unread").classList.add("is-hidden");
  localizeDocument($("#notifications-modal"));
}

async function loadHallOfFame() {
  try {
    const data = await requestJson("/api/hall-of-fame");
    $("#hall-of-fame-list").innerHTML = data.entries.length ? data.entries.map((entry, index) => `<div class="hall-row"><span>${index + 1}</span>${avatarMarkup(entry.avatar, "rank-avatar")}<b>${escapeHtml(entry.nickname)}</b><small>${money(entry.assets, true)}</small><i class="movement ${entry.movement > 0 ? "up" : entry.movement < 0 ? "down" : ""}">${entry.movement > 0 ? `▲${entry.movement}` : entry.movement < 0 ? `▼${Math.abs(entry.movement)}` : "-"}</i></div>`).join("") : `<p>${getLanguage() === "en" ? "No completed games yet." : "아직 완료된 게임이 없습니다."}</p>`;
  } catch { $("#hall-of-fame-list").innerHTML = ""; }
}

async function openBoard() {
  openSheet("board-modal");
  try {
    const data = await requestJson("/api/board");
    $("#board-posts").innerHTML = data.posts.map((post) => `<article class="board-post"><p>${escapeHtml(post.text)}</p><small>ANONYMOUS · ${new Date(post.createdAt).toLocaleString()}</small></article>`).join("");
  } catch (error) { showToast(error.message, "error"); }
  localizeDocument($("#board-modal"));
}

async function submitBoardPost() {
  const text = $("#board-input").value.trim(); if (!text) return;
  try { await requestJson("/api/board", { method: "POST", body: JSON.stringify({ text }) }); $("#board-input").value = ""; await openBoard(); }
  catch (error) { showToast(error.message, "error"); }
}

function showElimination() {
  const data = online ? game.elimination : (() => {
    const player = myPlayer(); if (!player?.eliminated) return null;
    return { turn: player.eliminatedTurn, rank: player.eliminationRank, quote: player.eliminationQuote, stats: player.stats, performance: player.performance, assets: getPlayerSummary(game, viewerId), topStock: topStockFor(viewerId) };
  })();
  if (!data) return;
  eliminationShown = true;
  $("#elimination-title").textContent = getLanguage() === "en" ? `${myPlayer().nickname}, you were eliminated.` : `${myPlayer().nickname} 플레이어가 시장에서 탈락했습니다.`;
  $("#elimination-rank").textContent = data.rank;
  $("#elimination-turn").textContent = `TURN ${data.turn}`;
  const stats = [["매수", data.stats.buys], ["매도", data.stats.sells], ["아이템", data.stats.items], ["대출", data.stats.loans], ["채권", data.stats.bonds]];
  $("#elimination-stats").innerHTML = stats.map(([label, value]) => `<div><b>${value}</b><small>${label}</small></div>`).join("");
  const activity = (game.logs || []).filter((log) => ["buy", "sell", "item", "loan", "bond"].includes(log.type)).slice(0, 12);
  $("#elimination-activity").innerHTML = activity.length
    ? activity.map((log) => `<div><span>T${String(log.turn).padStart(2, "0")}</span><b>${escapeHtml(displayText(log.message))}</b>${Number.isFinite(log.amountDelta) ? `<em class="${log.amountDelta > 0 ? "increase" : "decrease"}">${log.amountDelta > 0 ? "+" : "-"}${money(Math.abs(log.amountDelta))}</em>` : ""}</div>`).join("")
    : `<p>${getLanguage() === "en" ? "No trades or finance activity recorded." : "기록된 거래·금융 활동이 없습니다."}</p>`;
  $("#elimination-quote").textContent = `“${data.quote}”`;
  openSheet("elimination-modal");
  drawHistoryChart($("#elimination-chart"), data.performance || [], "assets");
  localizeDocument($("#elimination-modal"));
}

function resetToStart() {
  clearInterval(timerHandle);
  clearInterval(matchingTimer);
  timerHandle = null;
  matchingTimer = null;
  eventStream?.close();
  eventStream = null;
  clearSession();
  online = false;
  roomState = null;
  viewerId = "PLAYER-001";
  resultShown = false;
  lastCountdownNumber = null;
  rankAnimationTurnSeen = 0;
  activeRankEffects = new Map();
  eliminationShown = false;
  lastLeaderNoticeId = null;
  notificationHistory = [];
  seenNoticeIds = new Set();
  seenRumorMessageIds = new Set();
  seenGlobalChatIds = new Set();
  globalChatCollapsed = false;
  localAiConversationGeneration += 1;
  noticesInitialized = false;
  currencyInputsLanguage = null;
  currentMessageTarget = null;
  game = null;
  closeSheet("result-modal");
  closeSheet("rules-modal");
  closeSheet("holdings-modal");
  closeSheet("message-modal");
  closeSheet("notifications-modal");
  closeSheet("profile-modal");
  closeStockDetail();
  closeSheet("ranking-modal");
  closeSheet("elimination-modal");
  closeSheet("item-modal");
  closeSheet("board-modal");
  closeSheet("rank-detail-modal");
  $("#matchmaking-screen").classList.add("is-hidden");
  $("#lobby-screen").classList.add("is-hidden");
  $("#app-shell").classList.add("is-hidden");
  $("#final-countdown").classList.add("is-hidden");
  $("#start-screen").classList.remove("is-hidden");
  loadHallOfFame();
  loadActiveRooms();
  localizeDocument($("#start-screen"));
}

$("#start-button").addEventListener("click", startMatchmaking);
$("#private-room-button").addEventListener("click", createOnlineRoom);
$("#join-room-button").addEventListener("click", () => joinOnlineRoom());
$("#active-survival-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-active-room-code]");
  if (button) joinOnlineRoom(button.dataset.activeRoomCode);
});
$("#active-survival-refresh").addEventListener("click", loadActiveRooms);
$("#solo-button").addEventListener("click", beginSoloGame);
$("#nickname").addEventListener("keydown", (event) => { if (event.key === "Enter") startMatchmaking(); });
$("#language-choice").addEventListener("click", (event) => {
  const button = event.target.closest("[data-language]"); if (!button) return;
  $$("[data-language]", $("#language-choice")).forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
  setLanguage(button.dataset.language); loadHallOfFame(); loadActiveRooms();
  updateCurrencySymbols();
});
$("#game-mode-buttons").addEventListener("click", (event) => {
  const button = event.target.closest("[data-speed]"); if (!button) return;
  $("#game-speed").value = button.dataset.speed;
  $$('[data-speed]', $("#game-mode-buttons")).forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
});
$("#profile-open-button").addEventListener("click", () => { openSheet("profile-modal"); localizeDocument($("#profile-modal")); });
$("#profile-picker").addEventListener("click", (event) => { const button = event.target.closest("[data-profile-index]"); if (!button) return; selectedAvatar = { kind: "meme", index: Number(button.dataset.profileIndex) }; renderProfilePicker(); });
$("#profile-upload").addEventListener("change", async (event) => { try { selectedAvatar = await resizeUploadedAvatar(event.target.files[0]); renderProfilePicker(); showToast("프로필 사진을 적용했습니다."); } catch (error) { showToast(error.message, "error"); } });
$("#profile-confirm").addEventListener("click", () => closeSheet("profile-modal"));
$('[data-close-profile]').addEventListener("click", () => closeSheet("profile-modal"));
$("#stock-detail-modal").addEventListener("click", (event) => {
  if (event.target.closest("[data-close-stock-detail]") || event.target === event.currentTarget) closeStockDetail();
});
$('[data-close-ranking]').addEventListener("click", () => closeSheet("ranking-modal"));
$("#detail-buy").addEventListener("click", () => { setTradeSide("buy"); activateTradeTab("trade"); renderTradePanel(); $("#trade-quantity").focus(); });
$("#detail-sell").addEventListener("click", () => { if ($("#detail-sell").disabled) return; setTradeSide("sell"); activateTradeTab("trade"); renderTradePanel(); $("#trade-quantity").focus(); });
$("#room-code-input").addEventListener("input", (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
$("#room-code-input").addEventListener("keydown", (event) => { if (event.key === "Enter") joinOnlineRoom(); });
$("#start-match-button").addEventListener("click", startOnlineMatch);
$("#cancel-matchmaking").addEventListener("click", leaveOnlineRoom);
$("#leave-room-button").addEventListener("click", leaveOnlineRoom);
$("#room-code").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#room-code").textContent); showToast("방 코드를 복사했습니다."); }
  catch { showToast("방 코드를 직접 복사해주세요.", "error"); }
});
$("#game-room-code").addEventListener("click", async () => {
  if (!online || !roomState?.code) { showToast(getLanguage() === "en" ? "Solo game has no room code." : "솔로 게임에는 방 코드가 없습니다."); return; }
  try { await navigator.clipboard.writeText(roomState.code); showToast(getLanguage() === "en" ? `Room code ${roomState.code} copied.` : `방 코드 ${roomState.code}를 복사했습니다.`); }
  catch { showToast(getLanguage() === "en" ? `Room code: ${roomState.code}` : `방 코드: ${roomState.code}`); }
});
$("#end-turn-button").addEventListener("click", async () => {
  if (!game || game.finished) return;
  if (!online) {
    endCurrentTurn();
    return;
  }
  try {
    await sendAction("end-turn", {}, getLanguage() === "en" ? "Turn ended. Waiting for other survivors." : "턴을 종료했습니다. 다른 생존자를 기다립니다.");
  } catch (error) { showToast(error.message, "error"); }
});
$("#pause-button").addEventListener("click", () => { paused = !paused; lastFrame = performance.now(); renderHeader(); renderClock(); });
$("#portfolio-list").addEventListener("click", (event) => {
  const card = event.target.closest("[data-portfolio-stock]");
  if (card) jumpToHoldingStock(card.dataset.portfolioStock);
});
$("#open-intel-messages").addEventListener("click", () => openMessages());
$("#game-bottom-nav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-app-tab]"); if (!button || !game) return;
  const activeAppTab = setActiveAppTab(button.dataset.appTab);
  switch (activeAppTab) {
    case "home":
      renderAssets();
      renderPortfolioPanel();
      break;
    case "market":
      renderMarket();
      renderIntelCards();
      break;
    case "trade":
      renderTradePanel();
      renderOrders();
      renderFinance();
      renderItems();
      requestAnimationFrame(drawChart);
      break;
    case "survivors":
      renderRanking();
      break;
    case "logs":
      renderLogs();
      break;
  }
});
$("#new-game-button").addEventListener("click", leaveOnlineRoom);
$("#restart-button").addEventListener("click", leaveOnlineRoom);
$("#rules-button").addEventListener("click", () => openSheet("rules-modal"));
$("[data-close-modal]").addEventListener("click", () => closeSheet("rules-modal"));
$("[data-close-item]").addEventListener("click", () => closeSheet("item-modal"));
$("#stock-search").addEventListener("input", renderMarket);
$(".stock-table-head").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sort-key]");
  if (!button) return;
  const key = button.dataset.sortKey;
  stockSort = stockSort.key === key ? { key, direction: stockSort.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" };
  renderMarket();
});
$("#stock-list").addEventListener("click", (event) => {
  if (sectorRailClickSuppressed) { event.preventDefault(); return; }
  const openButton = event.target.closest("[data-open-stock-detail]");
  if (openButton) { openStockDetail(Number(openButton.dataset.openStockDetail)); return; }
  const row = event.target.closest("[data-stock-index]");
  if (!row) return;
  openStockDetail(Number(row.dataset.stockIndex));
});
$("#stock-list").addEventListener("keydown", (event) => {
  if (!['Enter', ' '].includes(event.key) || event.target.closest(".sector-open-button")) return;
  const row = event.target.closest("[data-stock-index]");
  if (!row) return;
  event.preventDefault();
  openStockDetail(Number(row.dataset.stockIndex));
});
$("#stock-detail-sector-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-detail-stock-index]");
  if (button) openStockDetail(Number(button.dataset.detailStockIndex), tradeSide);
});
$("#intel-cards").addEventListener("click", (event) => {
  const stockLink = event.target.closest("[data-intel-stock]");
  if (stockLink) { openStockDetail(Number(stockLink.dataset.intelStock)); return; }
  if (event.target.closest("[data-intel-rumor]")) openMessages("RUMOR");
});
function scrollSectorRail(direction) {
  const rail = $("#stock-list");
  const distance = Math.min(340, Math.max(240, rail.clientWidth * 0.72));
  rail.scrollBy({ left: direction * distance, behavior: "smooth" });
}
$("#sector-scroll-prev").addEventListener("click", () => scrollSectorRail(-1));
$("#sector-scroll-next").addEventListener("click", () => scrollSectorRail(1));
{
  const rail = $("#stock-list");
  const drag = { active: false, startX: 0, scrollLeft: 0, moved: false, pointerId: null, stockIndex: null };
  rail.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest(".sector-open-button")) return;
    const card = event.target.closest("[data-stock-index]");
    drag.active = true; drag.startX = event.clientX; drag.scrollLeft = rail.scrollLeft; drag.moved = false; drag.pointerId = event.pointerId; drag.stockIndex = card ? Number(card.dataset.stockIndex) : null;
    rail.setPointerCapture(event.pointerId);
    rail.classList.add("is-dragging");
  });
  rail.addEventListener("pointermove", (event) => {
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 6) drag.moved = true;
    if (drag.moved) rail.scrollLeft = drag.scrollLeft - distance;
  });
  const finishRailDrag = (event, allowCardOpen = false) => {
    if (!drag.active || event.pointerId !== drag.pointerId) return;
    const shouldOpenCard = allowCardOpen && !drag.moved && Number.isInteger(drag.stockIndex);
    drag.active = false;
    rail.classList.remove("is-dragging");
    if (rail.hasPointerCapture(event.pointerId)) rail.releasePointerCapture(event.pointerId);
    if (drag.moved || shouldOpenCard) {
      sectorRailClickSuppressed = true;
      setTimeout(() => { sectorRailClickSuppressed = false; }, 0);
    }
    if (shouldOpenCard) openStockDetail(drag.stockIndex);
    drag.stockIndex = null;
  };
  rail.addEventListener("pointerup", (event) => finishRailDrag(event, true));
  rail.addEventListener("pointercancel", (event) => finishRailDrag(event, false));
  rail.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    rail.scrollLeft += event.deltaY;
    event.preventDefault();
  }, { passive: false });
}
$$('.chart-type-toggle button').forEach((button) => button.addEventListener("click", () => {
  chartType = button.dataset.chartType;
  $$('.chart-type-toggle button').forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
  requestAnimationFrame(drawChart);
}));
$$('.side-toggle button').forEach((button) => button.addEventListener("click", () => setTradeSide(button.dataset.side)));
$("#trade-quantity").addEventListener("input", renderTradePanel);
$("#trade-submit").addEventListener("click", submitTrade);
$$('.quick-amounts button').forEach((button) => button.addEventListener("click", () => selectQuickAmount(button.dataset.portion)));
$$('.tab').forEach((tab) => tab.addEventListener("click", () => activateTradeTab(tab.dataset.tab)));
$("#limit-submit").addEventListener("click", submitLimitOrder);
$("#order-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-cancel-order]");
  if (!button) return;
  if (online) sendAction("cancel-order", { orderId: button.dataset.cancelOrder }, "예약 주문을 취소했습니다.").catch((error) => showToast(error.message, "error"));
  else safeAction(() => cancelOrder(game, button.dataset.cancelOrder), "예약 주문을 취소했습니다.");
});
$("#borrow-button").addEventListener("click", () => online
  ? sendAction("borrow", { amount: wonFromCurrencyInput($("#loan-amount").value) }, "대출이 실행되었습니다.").catch((error) => showToast(error.message, "error"))
  : safeAction(() => borrow(game, wonFromCurrencyInput($("#loan-amount").value)), "대출이 실행되었습니다."));
$("#repay-button").addEventListener("click", () => online
  ? sendAction("repay", { amount: wonFromCurrencyInput($("#loan-amount").value) }, "대출을 상환했습니다.").catch((error) => showToast(error.message, "error"))
  : safeAction(() => repay(game, wonFromCurrencyInput($("#loan-amount").value)), "대출을 상환했습니다."));
$("#bond-button").addEventListener("click", () => online
  ? sendAction("bond", { amount: wonFromCurrencyInput($("#bond-amount").value) }, "채권을 매수했습니다.").catch((error) => showToast(error.message, "error"))
  : safeAction(() => buyBond(game, wonFromCurrencyInput($("#bond-amount").value)), "채권을 매수했습니다."));
$("#special-items").addEventListener("click", (event) => {
  const button = event.target.closest("[data-special-item]");
  if (button) openItemModal(button.dataset.specialItem);
});
$("#random-items").addEventListener("click", (event) => {
  const button = event.target.closest("[data-random-item]");
  if (button) useRandom(button.dataset.randomItem);
});
$("#item-confirm").addEventListener("click", confirmItem);
$("#ranking-list").addEventListener("click", (event) => {
  const message = event.target.closest("[data-message-player]");
  if (message) { event.stopPropagation(); openMessages(message.dataset.messagePlayer); return; }
  const row = event.target.closest("[data-player-id]");
  if (row) openRankDetail(row.dataset.playerId);
});
$("#rank-search").addEventListener("input", renderRanking);
$("#my-profile-button").addEventListener("click", () => openRankDetail(viewerId));
$("#rank-detail-message").addEventListener("click", (event) => openMessages(event.currentTarget.dataset.messagePlayer));
$("#mailbox-button").addEventListener("click", () => openMessages());
$("#notifications-button").addEventListener("click", openNotifications);
$("#message-contacts").addEventListener("click", (event) => { const contact = event.target.closest("[data-message-contact]"); if (!contact) return; currentMessageTarget = contact.dataset.messageContact; renderMessages(); markThreadRead(currentMessageTarget); });
$("#message-new").addEventListener("click", () => { $("#message-recipient-panel").classList.toggle("is-hidden"); $("#message-recipient-search").value = ""; renderMessageRecipients(); $("#message-recipient-search").focus(); });
$("#message-recipient-search").addEventListener("input", renderMessageRecipients);
$("#message-recipient-list").addEventListener("click", (event) => { const recipient = event.target.closest("[data-message-recipient]"); if (!recipient) return; currentMessageTarget = recipient.dataset.messageRecipient; $("#message-recipient-panel").classList.add("is-hidden"); renderMessages(); $("#message-input").focus(); });
$("#message-send").addEventListener("click", sendDirectMessage);
$("#message-input").addEventListener("keydown", (event) => { if (event.key === "Enter") sendDirectMessage(); });
$("#global-chat-toggle").addEventListener("click", () => { globalChatCollapsed = !globalChatCollapsed; renderGlobalChat(); });
$("#global-chat-send").addEventListener("click", sendGlobalChatMessage);
$("#global-chat-input").addEventListener("keydown", (event) => { if (event.key === "Enter") sendGlobalChatMessage(); });
$("#developer-board-button").addEventListener("click", openBoard);
$("#board-submit").addEventListener("click", submitBoardPost);
$("#observe-button").addEventListener("click", () => closeSheet("elimination-modal"));
$("#open-holdings-button").addEventListener("click", openHoldingsModal);
$("#net-assets").addEventListener("click", openHoldingsModal);
$("#asset-stock-button").addEventListener("click", openHoldingsModal);
$("#holdings-list").addEventListener("click", (event) => {
  const action = event.target.closest("[data-holding-action]");
  if (action) {
    jumpToHoldingStock(action.dataset.stockIndex, action.dataset.holdingAction);
    return;
  }
  const stock = event.target.closest("[data-holding-stock]");
  if (stock) jumpToHoldingStock(stock.dataset.holdingStock);
});
$("#log-list").addEventListener("click", (event) => {
  const stock = event.target.closest("[data-log-stock]");
  if (stock) jumpToHoldingStock(stock.dataset.logStock);
});
$("#rank-detail-stock").addEventListener("click", (event) => {
  const stock = event.target.closest("[data-rank-stock]");
  if (stock) jumpToHoldingStock(stock.dataset.rankStock);
});
$("[data-close-holdings]").addEventListener("click", () => closeSheet("holdings-modal"));
$("[data-close-rank-detail]").addEventListener("click", () => closeSheet("rank-detail-modal"));
$("[data-close-message]").addEventListener("click", () => closeSheet("message-modal"));
$("[data-close-notifications]").addEventListener("click", () => closeSheet("notifications-modal"));
$("[data-close-board]").addEventListener("click", () => closeSheet("board-modal"));
$("#rules-modal").addEventListener("click", (event) => { if (event.target.id === "rules-modal") closeSheet("rules-modal"); });
$("#item-modal").addEventListener("click", (event) => { if (event.target.id === "item-modal") closeSheet("item-modal"); });
$("#rank-detail-modal").addEventListener("click", (event) => { if (event.target.id === "rank-detail-modal") closeSheet("rank-detail-modal"); });
$("#holdings-modal").addEventListener("click", (event) => { if (event.target.id === "holdings-modal") closeSheet("holdings-modal"); });
$("#message-modal").addEventListener("click", (event) => { if (event.target.id === "message-modal") closeSheet("message-modal"); });
$("#notifications-modal").addEventListener("click", (event) => { if (event.target.id === "notifications-modal") closeSheet("notifications-modal"); });
$("#board-modal").addEventListener("click", (event) => { if (event.target.id === "board-modal") closeSheet("board-modal"); });
$("#profile-modal").addEventListener("click", (event) => { if (event.target.id === "profile-modal") closeSheet("profile-modal"); });
window.addEventListener("resize", () => requestAnimationFrame(drawChart));
$("#price-chart").addEventListener("mousemove", (event) => {
  const chart = event.currentTarget._chart;
  if (!chart) return;
  const px = event.clientX - chart.rect.left;
  const ratio = Math.max(0, Math.min(1, (px - chart.pad.left) / (chart.rect.width - chart.pad.left - chart.pad.right)));
  const index = Math.min(chart.candles.length - 1, Math.floor(ratio * chart.candles.length));
  const candle = chart.candles[index];
  const tooltip = $("#chart-tooltip");
  const pointLabel = index < (game.stocks[selectedStock].history?.length || 0) ? "과거" : `T${String(index - (game.stocks[selectedStock].history?.length || 0) + 1).padStart(2, "0")}`;
  tooltip.textContent = `${pointLabel} · 시 ${money(candle.open, true)} 고 ${money(candle.high, true)} 저 ${money(candle.low, true)} 종 ${money(candle.close, true)} · 거래량 ${candle.volume.toLocaleString("ko-KR")}`;
  tooltip.style.left = `${chart.rect.width < 295 ? 5 : Math.min(chart.rect.width - 285, Math.max(5, px + 10))}px`;
  tooltip.style.top = `${Math.max(5, chart.y(candle.high) - 34)}px`;
  tooltip.classList.remove("is-hidden");
});
$("#price-chart").addEventListener("mouseleave", () => $("#chart-tooltip").classList.add("is-hidden"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSheet("rules-modal");
    closeSheet("item-modal");
    closeSheet("rank-detail-modal");
    closeSheet("holdings-modal");
    closeSheet("message-modal");
    closeSheet("notifications-modal");
    closeSheet("board-modal");
    closeSheet("profile-modal");
    closeStockDetail();
    closeSheet("ranking-modal");
    if (eliminationShown) closeSheet("elimination-modal");
  }
  if (event.code === "Space" && game && !online && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    paused = !paused;
    lastFrame = performance.now();
    renderHeader();
    renderClock();
  }
});

$("#nickname").value = randomNickname();
initializeIntegratedLayout();
renderProfilePicker();
setLanguage("ko");
updateCurrencySymbols();
loadHallOfFame();
loadActiveRooms();
activeRoomsTimer = setInterval(() => {
  if (!$("#start-screen").classList.contains("is-hidden") && document.visibilityState !== "hidden") loadActiveRooms();
}, 5_000);
resumeOnlineSession();
