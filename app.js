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

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const money = (value, compact = false) => {
  const number = Math.round(Number(value) || 0);
  if (compact && Math.abs(number) >= 100_000_000) return `${number < 0 ? "-" : ""}₩${(Math.abs(number) / 100_000_000).toFixed(2)}억`;
  if (compact && Math.abs(number) >= 10_000) return `${number < 0 ? "-" : ""}₩${(Math.abs(number) / 10_000).toFixed(0)}만`;
  return `${number < 0 ? "-" : ""}₩${Math.abs(number).toLocaleString("ko-KR")}`;
};
const percent = (value) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const apiUrl = (path) => `${API_BASE_URL}${path}`;

let game = null;
let speed = "turbo";
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

function decorateLocalRanking(ranking) {
  return ranking.map((entry) => ({
    ...entry,
    movement: soloRankMovements.get(entry.playerId) || 0,
    assetRiseStreak: soloAssetStreaks.get(entry.playerId) || 0,
    topStock: topStockFor(entry.playerId),
  }));
}

const displayRanking = () => online ? game.displayRanking : decorateLocalRanking(getRanking(game, { display: true, viewerId }));
const actualRanking = () => online ? game.actualRanking : decorateLocalRanking(getRanking(game, { display: false, viewerId }));

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
  toast.textContent = message;
  $("#toast-region").append(toast);
  setTimeout(() => toast.remove(), 3200);
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
  const nickname = $("#nickname").value.trim() || "플레이어";
  speed = $("#game-speed").value;
  online = false;
  roomState = null;
  viewerId = "PLAYER-001";
  game = createGame({ nickname, seed: Date.now() });
  selectedStock = 0;
  tradeSide = "buy";
  paused = false;
  previousAssets = null;
  rankAnimationTurnSeen = 0;
  activeRankEffects = new Map();
  soloRankMovements = new Map();
  soloAssetStreaks = new Map();
  soloLastAssets = new Map(getRanking(game, { display: false }).map((entry) => [entry.playerId, entry.assets]));
  $("#start-screen").classList.add("is-hidden");
  $("#app-shell").classList.remove("is-hidden");
  setupTurnClock();
  renderAll();
  requestAnimationFrame(drawChart);
}

async function createOnlineRoom() {
  try {
    const payload = await requestJson("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ nickname: $("#nickname").value, speed: $("#game-speed").value }),
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
      body: JSON.stringify({ nickname: $("#nickname").value }),
    });
    online = true;
    saveSession(code, payload.token);
    applyServerState(payload.state);
    connectToRoom(code, payload.token);
  } catch (error) {
    showToast(error.message, "error");
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
  viewerId = state.viewer.playerId;
  speed = state.room.speed;
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
  if (game.finished && !resultShown) {
    resultShown = true;
    showResults();
  }
}

function renderLobby(state) {
  $("#room-code").textContent = state.room.code;
  $("#lobby-count").textContent = `${state.room.memberCount} / ${state.room.capacity}명`;
  $("#lobby-members").innerHTML = state.room.members.map((member) => `
    <div class="lobby-member"><span class="member-avatar">${escapeHtml(member.nickname.slice(0, 1))}</span><span><b>${escapeHtml(member.nickname)}${member.isHost ? " · 방장" : ""}</b><small>${member.playerId}</small></span><em class="${member.connected ? "" : "offline"}">${member.connected ? "ONLINE" : "RECONNECTING"}</em></div>`).join("");
  $("#start-match-button").classList.toggle("is-hidden", !state.viewer.isHost);
  $("#lobby-note").textContent = state.viewer.isHost ? "준비되면 시작하세요. 빈자리는 즉시 AI가 채웁니다." : "방장이 게임을 시작할 때까지 기다려주세요.";
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
    setupTurnClock();
    renderAll();
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
  $("#stat-owned").textContent = `${myPlayer().holdings[selectedStock].toLocaleString()}주`;
  $("#limit-price").value ||= price;
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
  $("#avatar-text").textContent = (copied?.nickname || player.nickname).slice(0, 1);
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
  $("#limit-price").value = currentPrice(game, selectedStock);
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
  const ranking = displayRanking();
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
      <span class="rank-person"><b>${escapeHtml(entry.nickname)} ${streak >= 2 ? `<em class="streak-mark">연속 ${streak}↑</em>` : ""}</b><small>${entry.playerId}</small></span>
      <span class="rank-assets-wrap"><i class="rank-move ${movement > 0 ? "up" : movement < 0 ? "down" : ""}">${movement > 0 ? `▲${movement}` : movement < 0 ? `▼${Math.abs(movement)}` : ""}</i><span class="rank-assets ${entry.assets < 0 ? "negative" : ""}">${money(entry.assets, true)}</span></span>
    </button>`;
  }).join("");
}

function openRankDetail(playerId) {
  const entries = [...actualRanking(), ...displayRanking()];
  const entry = entries.find((candidate) => candidate.playerId === playerId);
  if (!entry) return;
  $("#rank-detail-title").textContent = `${entry.rank}위 플레이어 정보`;
  $("#rank-detail-avatar").textContent = entry.nickname.slice(0, 1);
  $("#rank-detail-name").textContent = entry.nickname;
  $("#rank-detail-id").textContent = entry.playerId;
  $("#rank-detail-rank").textContent = `${entry.rank}위`;
  $("#rank-detail-stock").innerHTML = entry.topStock
    ? `<button class="rank-stock-jump" data-rank-stock="${entry.topStock.stockIndex}"><span>가장 많이 보유한 종목 · 클릭해서 차트 보기</span><strong>${entry.topStock.flag} ${escapeHtml(entry.topStock.name)}</strong><b>${entry.topStock.ticker}</b><small>${entry.topStock.quantity.toLocaleString("ko-KR")}주 · 평가액 ${money(entry.topStock.value)}</small></button>`
    : `<span>가장 많이 보유한 종목</span><strong>보유 종목 없음</strong><small>현재 공개할 주식 포지션이 없습니다.</small>`;
  $("#rank-detail-streak").textContent = entry.assetRiseStreak >= 2 ? `자산이 ${entry.assetRiseStreak}턴 연속 상승 중입니다.` : "연속 자산 상승 기록이 없습니다.";
  $("#rank-detail-modal").classList.remove("is-hidden");
}

function renderTradePanel() {
  const player = myPlayer();
  const price = currentPrice(game, selectedStock);
  const quantity = Math.max(0, Math.floor(Number($("#trade-quantity").value) || 0));
  $("#order-total").textContent = money(price * quantity);
  $("#trade-submit").textContent = `${tradeSide === "buy" ? "매수" : "매도"} 주문`;
  $("#trade-submit").className = `button trade-submit ${tradeSide}`;
  const disabledReason = player.frozenTurn === game.turn || player.tradeLockTurn === game.turn || game.finished;
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
      <button data-cancel-order="${order.id}" aria-label="예약 취소">취소</button>
    </div>`).join("");
}

function renderFinance() {
  const player = myPlayer();
  $("#borrow-button").disabled = game.finished || playerSummary().assets < 0;
  $("#repay-button").disabled = game.finished || player.debt <= 0;
  $("#bond-button").disabled = game.finished || player.frozenTurn === game.turn || player.tradeLockTurn === game.turn;
}

const itemIcons = ["◈", "↗", "↘", "▦", "◎", "#", "×"];
function renderItems() {
  const summary = playerSummary();
  $("#special-gate").classList.toggle("is-locked", !summary.specialEligible);
  $("#random-gate").classList.toggle("is-locked", !summary.randomEligible);
  $("#special-items").innerHTML = SPECIAL_ITEMS.map((item, index) => {
    const turnBlocked = game.turn === CONFIG.totalTurns && ["future-price", "rising-stock", "falling-stock", "trade-freeze"].includes(item.id);
    return `<button class="item-card" data-special-item="${item.id}" ${!summary.specialEligible || game.finished || turnBlocked ? "disabled" : ""}>
      <span class="item-icon">${itemIcons[index]}</span><strong>${item.name}</strong><small>${item.description}</small><em>자산의 ${item.rate * 100}%</em>
    </button>`;
  }).join("");
  $("#random-items").innerHTML = RANDOM_ITEMS.map((item, index) => `
    <button class="item-card" data-random-item="${item.id}" ${!summary.randomEligible || game.finished ? "disabled" : ""}>
      <span class="item-icon">${index ? "⟳" : "?"}</span><strong>${item.name}</strong><small>${item.description}</small><em>현재 월급 1회분</em>
    </button>`).join("");
}

function renderLogs() {
  $("#log-list").innerHTML = game.logs.map((log) => {
    const amount = Number(log.amountDelta);
    const hasAmount = Number.isFinite(amount) && amount !== 0;
    const message = Number.isInteger(log.stockIndex)
      ? `<button class="log-stock-link" data-log-stock="${log.stockIndex}">${escapeHtml(log.message)}</button>`
      : `<span>${escapeHtml(log.message)}</span>`;
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
    limitPrice: Number($("#limit-price").value),
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

function resetToStart() {
  clearInterval(timerHandle);
  timerHandle = null;
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
  game = null;
  $("#result-modal").classList.add("is-hidden");
  $("#rules-modal").classList.add("is-hidden");
  $("#holdings-modal").classList.add("is-hidden");
  $("#lobby-screen").classList.add("is-hidden");
  $("#app-shell").classList.add("is-hidden");
  $("#final-countdown").classList.add("is-hidden");
  $("#start-screen").classList.remove("is-hidden");
}

$("#start-button").addEventListener("click", createOnlineRoom);
$("#join-room-button").addEventListener("click", joinOnlineRoom);
$("#solo-button").addEventListener("click", beginSoloGame);
$("#nickname").addEventListener("keydown", (event) => { if (event.key === "Enter") createOnlineRoom(); });
$("#room-code-input").addEventListener("input", (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""); });
$("#room-code-input").addEventListener("keydown", (event) => { if (event.key === "Enter") joinOnlineRoom(); });
$("#start-match-button").addEventListener("click", startOnlineMatch);
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
  $("#limit-price").value = currentPrice(game, selectedStock);
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
  ? sendAction("borrow", { amount: Number($("#loan-amount").value) }, "대출이 실행되었습니다.").catch((error) => showToast(error.message, "error"))
  : safeAction(() => borrow(game, Number($("#loan-amount").value)), "대출이 실행되었습니다."));
$("#repay-button").addEventListener("click", () => online
  ? sendAction("repay", { amount: Number($("#loan-amount").value) }, "대출을 상환했습니다.").catch((error) => showToast(error.message, "error"))
  : safeAction(() => repay(game, Number($("#loan-amount").value)), "대출을 상환했습니다."));
$("#bond-button").addEventListener("click", () => online
  ? sendAction("bond", { amount: Number($("#bond-amount").value) }, "채권을 매수했습니다.").catch((error) => showToast(error.message, "error"))
  : safeAction(() => buyBond(game, Number($("#bond-amount").value)), "채권을 매수했습니다."));
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
  const row = event.target.closest("[data-player-id]");
  if (row) openRankDetail(row.dataset.playerId);
});
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
$("#rules-modal").addEventListener("click", (event) => { if (event.target.id === "rules-modal") event.currentTarget.classList.add("is-hidden"); });
$("#item-modal").addEventListener("click", (event) => { if (event.target.id === "item-modal") event.currentTarget.classList.add("is-hidden"); });
$("#rank-detail-modal").addEventListener("click", (event) => { if (event.target.id === "rank-detail-modal") event.currentTarget.classList.add("is-hidden"); });
$("#holdings-modal").addEventListener("click", (event) => { if (event.target.id === "holdings-modal") event.currentTarget.classList.add("is-hidden"); });
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
  }
  if (event.code === "Space" && game && !online && !["INPUT", "SELECT"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    paused = !paused;
    lastFrame = performance.now();
    renderHeader();
  }
});

resumeOnlineSession();
