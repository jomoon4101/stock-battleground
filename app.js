import {
  CONFIG,
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
import { API_BASE_URL } from "./config.js";
import { getLanguage, localizeDocument, phrase, setLanguage, translateText } from "./i18n.js";

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
const apiUrl = (path) => `${API_BASE_URL}${path}`;

function updateCurrencySymbols() {
  $$(".logo-mark,.brand-mark").forEach((element) => { element.textContent = getLanguage() === "en" ? "$" : "₩"; });
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
let activeItem = null;
let lastFrame = 0;
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
let currencyInputsLanguage = null;
let seenNoticeIds = new Set();
let noticesInitialized = false;

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
    if (!best || value > best.value) best = { stockIndex, name: stock.name, ticker: stock.ticker, flag: stock.market.flag, quantity, value };
  });
  return best;
}

function portfolioFor(playerId) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player?.holdings) return [];
  return player.holdings.map((quantity, stockIndex) => {
    if (quantity <= 0) return null;
    const stock = game.stocks[stockIndex];
    return { stockIndex, name: stock.name, ticker: stock.ticker, flag: stock.market.flag, quantity, value: quantity * currentPrice(game, stockIndex) };
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
  game.messages ??= [];
  const rumor = createRumor(game, game.turn, viewerId);
  game.messages.push({ id: crypto.randomUUID(), fromId: rumor.senderId, fromName: rumor.senderName, toId: viewerId, text: rumor.text, createdAt: Date.now(), read: false, system: "rumor", stockIndex: rumor.stockIndex, direction: rumor.direction, startTurn: rumor.startTurn, endTurn: rumor.endTurn });
}

async function requestJson(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
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
  game = createGame({ nickname, seed: Date.now(), language: getLanguage(), avatar: selectedAvatar });
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
}

async function createOnlineRoom() {
  try {
    const payload = await requestJson("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ nickname: $("#nickname").value, speed: $("#game-speed").value, language: getLanguage(), avatar: selectedAvatar }),
    });
    online = true;
    saveSession(payload.state.room.code, payload.token);
    applyServerState(payload.state);
    connectToRoom(payload.state.room.code, payload.token);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function joinOnlineRoom() {
  const code = $("#room-code-input").value.trim().toUpperCase();
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

async function startMatchmaking() {
  try {
    const payload = await requestJson("/api/matchmaking", {
      method: "POST",
      body: JSON.stringify({ nickname: $("#nickname").value, speed: $("#game-speed").value, language: getLanguage(), avatar: selectedAvatar }),
    });
    online = true;
    saveSession(payload.state.room.code, payload.token);
    applyServerState(payload.state);
    connectToRoom(payload.state.room.code, payload.token);
  } catch (error) { showToast(error.message, "error"); }
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
  $("#matching-player-count").textContent = phrase("matchingCount", { count: state.room.memberCount });
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
  if (remainingSeconds <= 0) {
    endCurrentTurn();
  } else {
    renderClock();
  }
}

function renderClock() {
  const seconds = Math.max(0, Math.ceil(remainingSeconds));
  $("#timer").textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  $("#turn-progress").style.width = `${Math.max(0, (remainingSeconds / totalTurnSeconds) * 100)}%`;
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
  renderOrders();
  renderFinance();
  renderItems();
  renderLogs();
  renderMessageBadges();
  if (!$("#message-modal").classList.contains("is-hidden")) renderMessages();
  localizeDocument($("#app-shell"));
  requestAnimationFrame(drawChart);
}

function renderHeader() {
  $("#turn-number").textContent = String(game.turn).padStart(2, "0");
  const checkpoint = game.turn % 10 === 0;
  $("#round-label").textContent = checkpoint ? "블라인드 라운드 · 추가 시간" : "일반 라운드";
  const showBlindBanner = checkpoint || game.rankBlindTurn === game.turn;
  $("#blind-banner").classList.toggle("is-hidden", !showBlindBanner);
  const bannerText = game.rankBlindTurn === game.turn
    ? "아이템으로 모든 플레이어의 실시간 순위가 차단되었습니다."
    : "이 라운드에는 직전 턴의 순위와 자산만 표시됩니다.";
  $("#blind-banner small").textContent = bannerText;
  $("#pause-button").textContent = paused ? "▶" : "Ⅱ";
  $("#pause-button").title = paused ? "계속" : "일시정지";
  $("#pause-button").classList.toggle("is-hidden", online);
  $(".connection").innerHTML = `<i></i> ${online ? `ROOM ${roomState.code}` : "SOLO"}`;
}

function stockChange(index) {
  if (game.turn <= 1) return 0;
  const stock = game.stocks[index];
  const current = currentPrice(game, index);
  const previous = stock.prices[game.turn - 2];
  return current / previous - 1;
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

function renderMarket() {
  const search = $("#stock-search").value.trim().toLowerCase();
  const market = $("#market-filter").value;
  const rows = game.stocks.map((stock, index) => ({ stock, index, change: stockChange(index) }))
    .filter(({ stock }) => (market === "ALL" || stock.market.code === market) && (!search || stock.name.toLowerCase().includes(search) || stock.ticker.toLowerCase().includes(search)))
    .sort((a, b) => {
      let comparison = 0;
      if (stockSort.key === "name") comparison = a.stock.name.localeCompare(b.stock.name, "ko");
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
  $("#stock-list").innerHTML = rows.map(({ stock, index, change }) => `
    <button class="stock-row ${index === selectedStock ? "is-active" : ""}" data-stock-index="${index}" role="option" aria-selected="${index === selectedStock}">
      <span class="stock-identity"><span class="flag">${stock.market.flag}</span><span><b>${escapeHtml(stock.name)}</b><small>${stock.ticker} · ${stock.sector}</small></span></span>
      <span class="stock-price">${money(currentPrice(game, index), true)}</span>
      <span class="stock-change ${change >= 0 ? "up" : ""}">${percent(change)}</span>
    </button>`).join("");
}

function renderSelectedStock() {
  const stock = game.stocks[selectedStock];
  const price = currentPrice(game, selectedStock);
  const change = stockChange(selectedStock);
  const visibleSeries = [...(stock.history || []), ...stock.prices.slice(0, game.turn)];
  $("#selected-flag").textContent = stock.market.flag;
  $("#selected-ticker").textContent = `${stock.ticker} · ${stock.sector.toUpperCase()}`;
  $("#selected-name").textContent = stock.name;
  $("#selected-price").textContent = money(price);
  $("#selected-change").textContent = percent(change);
  $("#selected-change").classList.toggle("down", change < 0);
  $("#selected-origin").textContent = `ANONYMIZED ${stock.market.name.toUpperCase()} PATTERN · ${stock.year}`;
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
        <span class="holding-flag">${entry.stock.market.flag}</span>
        <span class="holding-name"><strong>${escapeHtml(entry.stock.name)}</strong><small>${entry.stock.ticker} · ${entry.quantity.toLocaleString("ko-KR")}주 · ${percent(entry.change)}</small></span>
        <span class="holding-value"><b>${money(entry.value)}</b><small>현재가 ${money(entry.price, true)}</small></span>
      </button>
      <span class="holding-actions"><button class="quick-buy" data-holding-action="buy" data-stock-index="${entry.stockIndex}">매수</button><button class="quick-sell" data-holding-action="sell" data-stock-index="${entry.stockIndex}">매도</button></span>
    </div>`).join("");
}

function openHoldingsModal() {
  renderHoldingsModal();
  $("#holdings-modal").classList.remove("is-hidden");
}

function activateTab(tabName) {
  $$('.tab').forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === tabName));
  $$('.tab-content').forEach((content) => content.classList.toggle("is-active", content.id === `tab-${tabName}`));
}

function jumpToHoldingStock(stockIndex, side = null) {
  selectedStock = Number(stockIndex);
  $("#limit-price").value = currencyInputValue(currentPrice(game, selectedStock));
  $("#trade-quantity").value = 1;
  if (side) setTradeSide(side);
  activateTab("trade");
  $("#holdings-modal").classList.add("is-hidden");
  $("#rank-detail-modal").classList.add("is-hidden");
  renderMarket();
  renderSelectedStock();
  renderTradePanel();
  requestAnimationFrame(drawChart);
  const tradePanel = $(".trade-panel");
  tradePanel.classList.remove("is-targeted");
  requestAnimationFrame(() => {
    tradePanel.classList.add("is-targeted");
    tradePanel.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => $("#trade-quantity").focus(), 450);
  });
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
    entry = { playerId, nickname: player.nickname, avatar: player.avatar, rank: player.eliminationRank || CONFIG.playerCount, assets: playerSummary().assets, performance: player.performance || [], portfolio: portfolioFor(playerId), topStock: topStockFor(playerId), assetRiseStreak: 0 };
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
    ? `<span class="portfolio-heading">보유 종목 · 클릭해서 차트 보기</span>${portfolio.map((holding, index) => `<button class="rank-stock-jump ${index === 0 ? "is-largest" : ""}" data-rank-stock="${holding.stockIndex}"><strong>${holding.flag} ${escapeHtml(holding.name)}</strong><b>${holding.ticker}</b><small>${holding.quantity.toLocaleString("ko-KR")}주 · 평가액 ${money(holding.value)}</small></button>`).join("")}`
    : `<span>가장 많이 보유한 종목</span><strong>보유 종목 없음</strong><small>현재 공개할 주식 포지션이 없습니다.</small>`;
  $("#rank-detail-streak").textContent = entry.assetRiseStreak >= 2 ? `자산이 ${entry.assetRiseStreak}턴 연속 상승 중입니다.` : "연속 자산 상승 기록이 없습니다.";
  $("#rank-detail-modal").classList.remove("is-hidden");
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
  const price = currentPrice(game, selectedStock);
  const quantity = Math.max(0, Math.floor(Number($("#trade-quantity").value) || 0));
  $("#order-total").textContent = money(price * quantity);
  $("#trade-submit").textContent = `${tradeSide === "buy" ? "매수" : "매도"} 주문`;
  $("#trade-submit").className = `button trade-submit ${tradeSide}`;
  const disabledReason = player.eliminated || player.frozenTurn === game.turn || player.tradeLockTurn === game.turn || game.finished;
  $("#trade-submit").disabled = disabledReason;
  $("#holdings-mini").innerHTML = `<span>보유 수량 <b>${player.holdings[selectedStock].toLocaleString()}주</b></span><span>평가액 <b>${money(player.holdings[selectedStock] * price)}</b></span><span>주문 가능 현금 <b>${money(player.cash)}</b></span>`;
}

function renderOrders() {
  const orders = myPlayer().orders;
  $("#order-count").textContent = orders.length;
  $("#order-list").innerHTML = orders.map((order) => `
    <div class="order-row">
      <div><b>${escapeHtml(game.stocks[order.stockIndex].name)}</b><br><span>${order.side === "buy" ? "예약매수" : "예약매도"} ${order.quantity}주</span></div>
      <strong>${money(order.limitPrice)}</strong>
      <button data-cancel-order="${order.id}" aria-label="예약 취소" ${myPlayer().eliminated ? "disabled" : ""}>취소</button>
    </div>`).join("");
}

function renderFinance() {
  const player = myPlayer();
  $("#borrow-button").disabled = game.finished || player.eliminated || playerSummary().assets < 0;
  $("#repay-button").disabled = game.finished || player.eliminated || player.debt <= 0;
  $("#bond-button").disabled = game.finished || player.eliminated || player.frozenTurn === game.turn || player.tradeLockTurn === game.turn;
}

const itemIcons = ["◈", "↗", "↘", "▦", "◎", "#", "×"];
function renderItems() {
  const summary = playerSummary();
  const eliminated = myPlayer().eliminated;
  $("#special-gate").classList.toggle("is-locked", !summary.specialEligible);
  $("#random-gate").classList.toggle("is-locked", !summary.randomEligible);
  $("#special-items").innerHTML = SPECIAL_ITEMS.map((item, index) => {
    const turnBlocked = game.turn === CONFIG.totalTurns && ["future-price", "rising-stock", "falling-stock", "trade-freeze"].includes(item.id);
    return `<button class="item-card" data-special-item="${item.id}" ${!summary.specialEligible || game.finished || eliminated || turnBlocked ? "disabled" : ""}>
      <span class="item-icon">${itemIcons[index]}</span><strong>${item.name}</strong><small>${item.description}</small><em>자산의 ${item.rate * 100}%</em>
    </button>`;
  }).join("");
  $("#random-items").innerHTML = RANDOM_ITEMS.map((item, index) => `
    <button class="item-card" data-random-item="${item.id}" ${!summary.randomEligible || game.finished || eliminated ? "disabled" : ""}>
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
    options = `<label class="item-option-label" for="item-stock">공개할 종목</label><select id="item-stock">${game.stocks.map((stock, index) => `<option value="${index}" ${index === selectedStock ? "selected" : ""}>${stock.market.flag} ${escapeHtml(stock.name)} · ${stock.ticker}</option>`).join("")}</select>`;
  } else if (["identity-copy", "trade-freeze"].includes(itemId)) {
    const ranking = actualRanking();
    options = `<label class="item-option-label" for="item-target">대상 플레이어</label><select id="item-target">${ranking.filter((entry) => entry.playerId !== viewerId).map((entry) => `<option value="${entry.playerId}">${entry.rank}위 · ${escapeHtml(entry.nickname)} · ${money(entry.assets, true)}</option>`).join("")}</select>`;
  } else if (itemId === "fake-rank") {
    options = `<label class="item-option-label" for="item-rank">표시할 순위 (1~100)</label><input id="item-rank" type="number" min="1" max="100" value="1">`;
  }
  $("#item-options").innerHTML = options || `<p class="helper">추가 선택 없이 즉시 적용됩니다.</p>`;
  $("#item-modal").classList.remove("is-hidden");
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
  $("#item-modal").classList.add("is-hidden");
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
  ctx.strokeStyle = "rgba(255,255,255,.055)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#536067";
  ctx.font = "8px IBM Plex Mono";
  ctx.textAlign = "left";
  for (let line = 0; line <= 4; line += 1) {
    const py = pad.top + line / 4 * (priceBottom - pad.top);
    ctx.beginPath(); ctx.moveTo(pad.left, py); ctx.lineTo(width - pad.right, py); ctx.stroke();
    ctx.fillText(money(max - line / 4 * (max - min), true), width - pad.right + 7, py + 3);
  }
  ctx.beginPath(); ctx.moveTo(pad.left, volumeTop - 7); ctx.lineTo(width - pad.right, volumeTop - 7); ctx.stroke();
  ctx.fillStyle = "#536067";
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
  ctx.strokeStyle = "rgba(217,255,67,.18)";
  ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.moveTo(boundaryX, pad.top); ctx.lineTo(boundaryX, volumeBottom); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#657278";
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
    gradient.addColorStop(1, "rgba(8,11,13,0)");
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
  $("#result-modal").classList.remove("is-hidden");
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
  if ([11, 21, 31].includes(game.turn) && !myPlayer().eliminated) deliverLocalRumor();
  if ([15, 25, 35].includes(game.turn)) {
    receiveGameNotice({ id: crypto.randomUUID(), type: "salary-reminder", icon: getLanguage() === "en" ? "$" : "₩", text: getLanguage() === "en" ? "Five turns until payday." : "월급날까지 5턴 남았습니다.", turn: game.turn, createdAt: Date.now() });
  }
  if (result.eliminated) {
    const nickname = result.eliminated.nickname;
    receiveGameNotice({ id: crypto.randomUUID(), type: "elimination", icon: "☠", text: getLanguage() === "en" ? `${nickname} went broke and was eliminated.` : `${nickname}플레이어가 깡통을 찼습니다.`, turn: game.turn, createdAt: Date.now() }, [15, 25, 35].includes(game.turn) ? 2500 : 0);
  }
}

function renderMessageBadges() {
  if (!game) return;
  const unread = online ? (game.unreadMessages || 0) : (game.messages || []).filter((message) => message.toId === viewerId && !message.read).length;
  $("#mail-unread").textContent = unread;
  $("#mail-unread").classList.toggle("is-hidden", unread <= 0);
}

function playerById(playerId) { return game?.players.find((player) => player.id === playerId); }

function conversationIds(messages = game?.messages || []) {
  const latest = new Map();
  for (const message of messages) {
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
  $("#message-modal").classList.remove("is-hidden");
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

function createLocalAiReply(target) {
  const owned = target.holdings.map((quantity, stockIndex) => ({ quantity, stockIndex })).filter((entry) => entry.quantity > 0);
  if (owned.length && Math.random() < 0.72) {
    const stock = game.stocks[owned[Math.floor(Math.random() * owned.length)].stockIndex];
    const ko = [`${stock.name}? 나도 조금 담아봤는데 아직 손에 땀나네.`, `${stock.name}은 내가 산 것 중 제일 신경 쓰여. 다음 봉은 좀 보려고.`, `솔직히 ${stock.name} 산 건 반쯤 감이었어. 그래도 바로 던질 생각은 없어.`, `아까 ${stock.name} 좀 샀는데 거래량이 영 수상하더라.`, `${stock.name} 담고 나니 오히려 확신이 없어졌어. 원래 주식이 그렇잖아.`];
    const en = [`${stock.name}? I picked some up, but it still makes me nervous.`, `${stock.name} is the position I keep checking. I want to see the next candle.`, `Buying ${stock.name} was half instinct. I'm not dumping it yet.`, `I bought some ${stock.name}; the volume looked suspicious.`, `The moment I bought ${stock.name}, my confidence disappeared. That's trading.`];
    const options = getLanguage() === "en" ? en : ko; return options[Math.floor(Math.random() * options.length)];
  }
  const ko = ["요즘 장이 사람 마음 가지고 노는 것 같지 않아?", "난 이번 턴엔 괜히 손대지 말고 지켜보려고.", "수익 났을 때 팔기가 손절보다 더 어렵더라.", "차트 오래 본다고 답이 나오는 건 아닌데 자꾸 보게 돼.", "남들 다 확신할 때가 제일 불안하지 않아?", "일단 살아남고 보자. 기회는 다음 턴에도 오니까."];
  const en = ["Feels like the market is playing with everyone's head.", "I'm thinking of doing nothing this turn and just watching.", "Taking profit is harder than cutting a loss.", "Staring longer doesn't give me answers, but I keep doing it.", "I get uneasy when everybody sounds certain.", "Survive first. There will be another setup next turn."];
  const options = getLanguage() === "en" ? en : ko; return options[Math.floor(Math.random() * options.length)];
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
    const reply = createLocalAiReply(target);
    game.messages.push({ id: crypto.randomUUID(), fromId: target.id, toId: viewerId, text: reply, createdAt: Date.now(), read: false, ai: true });
    renderMessages(); renderMessageBadges();
  }, 700);
}

function openNotifications() {
  $("#notifications-list").innerHTML = notificationHistory.length
    ? notificationHistory.map((notice) => `<div class="notice-row"><b>${escapeHtml(notice.icon || "!")}</b> ${escapeHtml(notice.text)}<small>${new Date(notice.createdAt).toLocaleTimeString()}</small></div>`).join("")
    : `<div class="notice-row">${getLanguage() === "en" ? "No notifications yet." : "아직 알림이 없습니다."}</div>`;
  $("#notifications-modal").classList.remove("is-hidden");
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
  $("#board-modal").classList.remove("is-hidden");
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
  $("#elimination-modal").classList.remove("is-hidden");
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
  noticesInitialized = false;
  currencyInputsLanguage = null;
  currentMessageTarget = null;
  game = null;
  $("#result-modal").classList.add("is-hidden");
  $("#rules-modal").classList.add("is-hidden");
  $("#holdings-modal").classList.add("is-hidden");
  $("#message-modal").classList.add("is-hidden");
  $("#notifications-modal").classList.add("is-hidden");
  $("#elimination-modal").classList.add("is-hidden");
  $("#matchmaking-screen").classList.add("is-hidden");
  $("#lobby-screen").classList.add("is-hidden");
  $("#app-shell").classList.add("is-hidden");
  $("#final-countdown").classList.add("is-hidden");
  $("#start-screen").classList.remove("is-hidden");
  loadHallOfFame();
  localizeDocument($("#start-screen"));
}

$("#start-button").addEventListener("click", startMatchmaking);
$("#private-room-button").addEventListener("click", createOnlineRoom);
$("#join-room-button").addEventListener("click", joinOnlineRoom);
$("#solo-button").addEventListener("click", beginSoloGame);
$("#nickname").addEventListener("keydown", (event) => { if (event.key === "Enter") startMatchmaking(); });
$("#language-choice").addEventListener("click", (event) => {
  const button = event.target.closest("[data-language]"); if (!button) return;
  $$("[data-language]", $("#language-choice")).forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
  setLanguage(button.dataset.language); loadHallOfFame();
  updateCurrencySymbols();
});
$("#profile-picker").addEventListener("click", (event) => { const button = event.target.closest("[data-profile-index]"); if (!button) return; selectedAvatar = { kind: "meme", index: Number(button.dataset.profileIndex) }; renderProfilePicker(); });
$("#profile-upload").addEventListener("change", async (event) => { try { selectedAvatar = await resizeUploadedAvatar(event.target.files[0]); renderProfilePicker(); showToast("프로필 사진을 적용했습니다."); } catch (error) { showToast(error.message, "error"); } });
$("#room-code-input").addEventListener("input", (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
$("#room-code-input").addEventListener("keydown", (event) => { if (event.key === "Enter") joinOnlineRoom(); });
$("#start-match-button").addEventListener("click", startOnlineMatch);
$("#cancel-matchmaking").addEventListener("click", leaveOnlineRoom);
$("#leave-room-button").addEventListener("click", leaveOnlineRoom);
$("#room-code").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#room-code").textContent); showToast("방 코드를 복사했습니다."); }
  catch { showToast("방 코드를 직접 복사해주세요.", "error"); }
});
$("#new-game-button").addEventListener("click", leaveOnlineRoom);
$("#restart-button").addEventListener("click", leaveOnlineRoom);
$("#pause-button").addEventListener("click", () => { paused = !paused; lastFrame = performance.now(); renderHeader(); });
$("#rules-button").addEventListener("click", () => $("#rules-modal").classList.remove("is-hidden"));
$("[data-close-modal]").addEventListener("click", () => $("#rules-modal").classList.add("is-hidden"));
$("[data-close-item]").addEventListener("click", () => $("#item-modal").classList.add("is-hidden"));
$("#stock-search").addEventListener("input", renderMarket);
$("#market-filter").addEventListener("change", renderMarket);
$(".stock-table-head").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sort-key]");
  if (!button) return;
  const key = button.dataset.sortKey;
  stockSort = stockSort.key === key ? { key, direction: stockSort.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" };
  renderMarket();
});
$("#stock-list").addEventListener("click", (event) => {
  const row = event.target.closest("[data-stock-index]");
  if (!row) return;
  selectedStock = Number(row.dataset.stockIndex);
  $("#limit-price").value = currencyInputValue(currentPrice(game, selectedStock));
  renderMarket(); renderSelectedStock(); renderTradePanel(); requestAnimationFrame(drawChart);
});
$$('.chart-type-toggle button').forEach((button) => button.addEventListener("click", () => {
  chartType = button.dataset.chartType;
  $$('.chart-type-toggle button').forEach((candidate) => candidate.classList.toggle("is-active", candidate === button));
  requestAnimationFrame(drawChart);
}));
$$('.side-toggle button').forEach((button) => button.addEventListener("click", () => setTradeSide(button.dataset.side)));
$("#trade-quantity").addEventListener("input", renderTradePanel);
$("#trade-submit").addEventListener("click", submitTrade);
$$('.quick-amounts button').forEach((button) => button.addEventListener("click", () => selectQuickAmount(button.dataset.portion)));
$$('.tab').forEach((tab) => tab.addEventListener("click", () => activateTab(tab.dataset.tab)));
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
$("#developer-board-button").addEventListener("click", openBoard);
$("#board-submit").addEventListener("click", submitBoardPost);
$("#observe-button").addEventListener("click", () => $("#elimination-modal").classList.add("is-hidden"));
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
$("[data-close-holdings]").addEventListener("click", () => $("#holdings-modal").classList.add("is-hidden"));
$("[data-close-rank-detail]").addEventListener("click", () => $("#rank-detail-modal").classList.add("is-hidden"));
$("[data-close-message]").addEventListener("click", () => $("#message-modal").classList.add("is-hidden"));
$("[data-close-notifications]").addEventListener("click", () => $("#notifications-modal").classList.add("is-hidden"));
$("[data-close-board]").addEventListener("click", () => $("#board-modal").classList.add("is-hidden"));
$("#rules-modal").addEventListener("click", (event) => { if (event.target.id === "rules-modal") event.currentTarget.classList.add("is-hidden"); });
$("#item-modal").addEventListener("click", (event) => { if (event.target.id === "item-modal") event.currentTarget.classList.add("is-hidden"); });
$("#rank-detail-modal").addEventListener("click", (event) => { if (event.target.id === "rank-detail-modal") event.currentTarget.classList.add("is-hidden"); });
$("#holdings-modal").addEventListener("click", (event) => { if (event.target.id === "holdings-modal") event.currentTarget.classList.add("is-hidden"); });
$("#message-modal").addEventListener("click", (event) => { if (event.target.id === "message-modal") event.currentTarget.classList.add("is-hidden"); });
$("#notifications-modal").addEventListener("click", (event) => { if (event.target.id === "notifications-modal") event.currentTarget.classList.add("is-hidden"); });
$("#board-modal").addEventListener("click", (event) => { if (event.target.id === "board-modal") event.currentTarget.classList.add("is-hidden"); });
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
    $("#rules-modal").classList.add("is-hidden");
    $("#item-modal").classList.add("is-hidden");
    $("#rank-detail-modal").classList.add("is-hidden");
    $("#holdings-modal").classList.add("is-hidden");
    $("#message-modal").classList.add("is-hidden");
    $("#notifications-modal").classList.add("is-hidden");
    $("#board-modal").classList.add("is-hidden");
    if (eliminationShown) $("#elimination-modal").classList.add("is-hidden");
  }
  if (event.code === "Space" && game && !online && !["INPUT", "SELECT"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    paused = !paused;
    lastFrame = performance.now();
    renderHeader();
  }
});

renderProfilePicker();
setLanguage("ko");
updateCurrencySymbols();
loadHallOfFame();
resumeOnlineSession();
