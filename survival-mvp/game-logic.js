import { MVP_ACTIONS, MVP_RULES } from "./config.js";
import { drawEventCard, eventForRoll } from "./events.js";
import { calculateTurnOrder } from "./game-state.js";
import { alternativeAssetValue } from "./assets.js";
import { calculateMajorShareholders, getSurvivalRanking, settleSurvivalRound, survivalNetWorth } from "./progression.js";
import { confirmSkillSelection } from "./skills.js";

const playerById = (game, id) => {
  const player = game.players.find((candidate) => candidate.id === id);
  if (!player) throw new Error("플레이어를 찾을 수 없습니다.");
  return player;
};
const priceIndex = (game) => Math.max(0, Math.min(game.turn - 1, game.stocks[0].prices.length - 1));
const changePrice = (game, index, rate) => {
  const cursor = priceIndex(game);
  game.stocks[index].prices[cursor] = Math.max(1, Math.round(game.stocks[index].prices[cursor] * (1 + rate)));
};
const largestHoldingIndex = (player) => player.holdings.reduce((best, quantity, index, all) => quantity > all[best] ? index : best, 0);
const portfolioValue = (game, player) => player.holdings.reduce((sum, quantity, index) => sum + quantity * game.stocks[index].prices[priceIndex(game)], 0) + alternativeAssetValue(game, player);
const pushLog = (game, playerId, type, message, meta = {}) => {
  game.logs.unshift({ id: `mvp-${Date.now()}-${game.logs.length}`, turn: game.turn, playerId, type, message, ...meta });
  game.logs = game.logs.slice(0, 120);
};

export function applyAction(game, action, playerId, random = Math.random) {
  if (!game.survivalMvp || game.survivalMvp.phase !== "action") throw new Error("지금은 행동 선택 단계가 아닙니다.");
  if (!MVP_ACTIONS.includes(action?.type)) throw new Error("사용할 수 없는 행동입니다.");
  const player = playerById(game, playerId);
  if (player.isHuman && !player.skillSelectionComplete) throw new Error("먼저 스킬카드 3장 중 2장을 선택하세요.");
  let result;
  if (action.type === "buy" || action.type === "sell") {
    const stockIndex = Math.floor(Number(action.stockIndex));
    const quantity = Math.floor(Number(action.quantity));
    if (!game.stocks[stockIndex] || quantity < 1) throw new Error("종목과 수량을 확인하세요.");
    if (game.survivalMvp.haltedRound === game.turn && game.survivalMvp.haltedStockIndex === stockIndex) throw new Error("이번 라운드 거래정지 섹터입니다.");
    if (game.survivalMvp.evenQuantityRound === game.turn && quantity % 2) {
      const singleException = quantity === 1 && (action.type === "buy" ? game.survivalMvp.stockSupply[stockIndex] === 1 : player.holdings[stockIndex] === 1);
      if (!singleException) throw new Error("이번 라운드는 짝수 수량만 거래할 수 있습니다.");
    }
    if (action.type === "buy" && quantity > MVP_RULES.maxBuyPerAction) throw new Error("한 번에 최대 5주까지 매수할 수 있습니다.");
    const price = game.stocks[stockIndex].prices[priceIndex(game)];
    if (action.type === "buy") {
      if (player.holdings[stockIndex] + quantity > MVP_RULES.maxHoldingPerCompany) throw new Error("한 회사는 최대 11주까지 보유할 수 있습니다.");
      if (game.survivalMvp.stockSupply[stockIndex] < quantity) throw new Error("시장에 남은 주식이 부족합니다.");
      if (player.cash < price * quantity) throw new Error("현금이 부족합니다.");
      const before = player.holdings[stockIndex];
      player.cash -= price * quantity;
      player.holdings[stockIndex] += quantity;
      player.averagePrices[stockIndex] = Math.round(((player.averagePrices[stockIndex] * before) + price * quantity) / (before + quantity));
      game.survivalMvp.stockSupply[stockIndex] -= quantity;
    } else {
      if (player.holdings[stockIndex] < quantity) throw new Error("보유 수량이 부족합니다.");
      player.cash += price * quantity;
      player.holdings[stockIndex] -= quantity;
      game.survivalMvp.stockSupply[stockIndex] += quantity;
      if (!player.holdings[stockIndex]) player.averagePrices[stockIndex] = 0;
    }
    result = { type: action.type, stockIndex, quantity, amount: price * quantity };
  } else if (action.type === "all-in") {
    if (!player.bankruptcyDanger) throw new Error("올인은 파산 위기에서만 사용할 수 있습니다.");
    const budget = Math.floor(player.cash * 0.8);
    if (action.assetKey === "coin") {
      const price = game.survivalMvp.alternativeMarkets.coin.price;
      const quantity = Math.max(1, Math.floor(budget / (price * 1.05)));
      const cost = Math.round(price * quantity * 1.05);
      if (cost > player.cash) throw new Error("코인 올인 현금이 부족합니다.");
      player.cash -= cost;
      player.alternativeAssets.coin += quantity;
      result = { type: "all-in", target: "coin", key: "coin", quantity, cost, multiplier: 2 };
    } else {
      const stockIndex = Math.floor(Number(action.stockIndex));
      const price = game.stocks[stockIndex]?.prices[priceIndex(game)];
      if (!price) throw new Error("올인할 섹터를 선택하세요.");
      const quantity = Math.max(1, Math.min(MVP_RULES.maxHoldingPerCompany - player.holdings[stockIndex], game.survivalMvp.stockSupply[stockIndex], Math.floor(budget / price)));
      if (quantity < 1) throw new Error("올인할 수량을 확보할 수 없습니다.");
      player.cash -= price * quantity;
      player.holdings[stockIndex] += quantity;
      game.survivalMvp.stockSupply[stockIndex] -= quantity;
      result = { type: "all-in", target: "stock", stockIndex, quantity, multiplier: 2 };
    }
    game.survivalMvp.allIn = { playerId, ...result, expiresAfterEvent: true };
  } else if (action.type === "defend") {
    if (!game.survivalMvp.defendedPlayerIds.includes(playerId)) game.survivalMvp.defendedPlayerIds.push(playerId);
    result = { type: "defend" };
  } else if (action.type === "gamble") {
    const stake = Math.floor(player.cash * MVP_RULES.gambleCashRate);
    const won = random() >= 0.5;
    const winMultiplier = player.bankruptcyDanger ? 3 : 2;
    player.cash += won ? stake * (winMultiplier - 1) : -stake;
    result = { type: "gamble", stake, won, winMultiplier };
  } else {
    const target = playerById(game, action.targetPlayerId);
    const failed = random() < MVP_RULES.interferenceFailRate;
    const stockIndex = largestHoldingIndex(target);
    if (!failed) changePrice(game, stockIndex, -MVP_RULES.interferenceDrop);
    const targetRank = getSurvivalRanking(game).find((entry) => entry.playerId === target.id)?.rank;
    const bounty = !failed && targetRank === 1 ? MVP_RULES.firstPlaceBounty : 0;
    player.cash += bounty;
    result = { type: "interfere", targetPlayerId: target.id, stockIndex, failed, bounty };
  }
  game.survivalMvp.actionResult = result;
  game.survivalMvp.phase = "dice";
  pushLog(game, playerId, result.type, `${player.nickname}: ${result.type}`, result);
  return result;
}

export function resolveDice(game, playerId, forcedRoll = null, random = Math.random) {
  if (game.survivalMvp.phase !== "dice") throw new Error("먼저 행동을 선택하세요.");
  const player = playerById(game, playerId);
  const roll = forcedRoll == null ? Math.floor(random() * 6) + 1 : Math.max(1, Math.min(6, Math.floor(forcedRoll)));
  const event = eventForRoll(roll);
  const defended = game.survivalMvp.defendedPlayerIds.includes(playerId);
  const defendedSnapshots = new Map(game.survivalMvp.defendedPlayerIds.map((id) => {
    const defendedPlayer = playerById(game, id);
    return [id, portfolioValue(game, defendedPlayer)];
  }));
  const eventCards = [];
  let allInApplied = false;
  if (event.cash) player.cash += event.cash;
  if (event.scope === "card") {
    const preferred = game.survivalMvp.rallyRound === game.turn && random() < 0.5
      ? game.survivalMvp.rallyStockIndex
      : player.insideInfo?.turn === game.turn ? player.insideInfo.nextSectorIndex : null;
    const count = 1 + Number(game.survivalMvp.extraEventCount || 0);
    for (let index = 0; index < count; index += 1) {
      const card = drawEventCard(random, index === 0 ? preferred : null);
      applyEventCard(game, card);
      eventCards.push(card);
      const allIn = game.survivalMvp.allIn;
      if (allIn?.target === "coin" && card.assetModifiers?.coin) allInApplied = true;
      if (allIn?.target === "stock" && (card.target === "market" || (card.target === "stock" && Number(card.sectorIndex) === allIn.stockIndex))) allInApplied = true;
    }
    game.survivalMvp.extraEventCount = 0;
    if (player.insideInfo?.turn === game.turn) player.insideInfo = null;
  } else if (event.direction) {
    const rate = event.direction * event.rate;
    if (event.scope === "market") game.stocks.forEach((_, index) => {
      const doubled = game.survivalMvp.allIn?.target === "stock" && game.survivalMvp.allIn.stockIndex === index;
      changePrice(game, index, rate * (doubled ? 2 : 1));
      if (doubled) allInApplied = true;
    });
    else {
      let index = event.scope === "random" ? Math.floor(random() * game.stocks.length) : largestHoldingIndex(player);
      if (!player.holdings[index] && event.scope === "holding") index = Math.floor(random() * game.stocks.length);
      const doubled = game.survivalMvp.allIn?.target === "stock" && game.survivalMvp.allIn.stockIndex === index;
      changePrice(game, index, rate * (doubled ? 2 : 1));
      if (doubled) allInApplied = true;
    }
  }
  if (event.scope !== "card" && Number(game.survivalMvp.extraEventCount || 0) > 0) {
    for (let index = 0; index < game.survivalMvp.extraEventCount; index += 1) {
      const card = drawEventCard(random, player.insideInfo?.turn === game.turn ? player.insideInfo.nextSectorIndex : null);
      applyEventCard(game, card);
      eventCards.push(card);
      const allIn = game.survivalMvp.allIn;
      if (allIn?.target === "coin" && card.assetModifiers?.coin) allInApplied = true;
      if (allIn?.target === "stock" && (card.target === "market" || (card.target === "stock" && Number(card.sectorIndex) === allIn.stockIndex))) allInApplied = true;
    }
    game.survivalMvp.extraEventCount = 0;
    if (player.insideInfo?.turn === game.turn) player.insideInfo = null;
  }
  for (const [id, before] of defendedSnapshots) {
    const defendedPlayer = playerById(game, id);
    const portfolioDelta = portfolioValue(game, defendedPlayer) - before;
    defendedPlayer.cash -= Math.round(portfolioDelta * (1 - MVP_RULES.defendEffectMultiplier));
  }
  settleShortPosition(game);
  if (game.survivalMvp.allIn?.playerId === playerId && allInApplied) game.survivalMvp.allIn = null;
  const result = { roll, event, defended, eventCards };
  game.survivalMvp.diceResult = result;
  game.survivalMvp.phase = "resolved";
  pushLog(game, playerId, "dice", `주사위 ${roll} · ${event.labelKo}`, { roll, eventCards });
  return result;
}

function applyEventCard(game, card) {
  const shareholders = calculateMajorShareholders(game);
  const multiplierFor = (stockIndex) => {
    const allIn = game.survivalMvp.allIn;
    return allIn?.target === "stock" && allIn.stockIndex === stockIndex ? 2 : 1;
  };
  const shareholderAdjustedRate = (index, baseRate) => {
    const owner = shareholders[index];
    if (!owner) return baseRate;
    const key = game.stocks[index].sectorKey;
    let rate = baseRate;
    if (key === "technology" && rate > 0) rate += 0.05;
    if (key === "consumer-discretionary" && card.id === "global-boom" && rate > 0) rate += 0.1;
    if (key === "consumer-staples" && rate < 0) rate *= 0.7;
    if (key === "materials" && card.id === "global-inflation" && rate > 0) rate += 0.1;
    if (key === "energy" && card.id === "war-risk" && rate > 0) rate += 0.15;
    return rate;
  };
  if (card.target === "market") game.stocks.forEach((_, index) => changePrice(game, index, shareholderAdjustedRate(index, card.rate) * multiplierFor(index)));
  if (card.target === "stock") {
    const index = Math.max(0, Math.min(game.stocks.length - 1, Number(card.sectorIndex) || 0));
    changePrice(game, index, shareholderAdjustedRate(index, card.rate) * multiplierFor(index));
  }
  if (card.assetModifiers) {
    for (const [key, rate] of Object.entries(card.assetModifiers)) {
      const market = game.survivalMvp.alternativeMarkets[key];
      if (!market) continue;
      const allInMultiplier = game.survivalMvp.allIn?.target === key || (key === "coin" && game.survivalMvp.allIn?.target === "coin") ? 2 : 1;
      market.previousPrice = market.price;
      market.price = Math.max(1, Math.round(market.price * (1 + rate * allInMultiplier)));
      market.changeRate = market.price / market.previousPrice - 1;
      market.history.push(market.price);
    }
    if ((card.assetModifiers.copper || 0) > 0) {
      const industrialIndex = game.stocks.findIndex((stock) => stock.sectorKey === "industrials");
      if (shareholders[industrialIndex]) changePrice(game, industrialIndex, 0.03);
    }
    if (card.id === "global-inflation") {
      const materialsIndex = game.stocks.findIndex((stock) => stock.sectorKey === "materials");
      if (shareholders[materialsIndex]) changePrice(game, materialsIndex, 0.1);
    }
    if (card.id === "war-risk") {
      const energyIndex = game.stocks.findIndex((stock) => stock.sectorKey === "energy");
      changePrice(game, energyIndex, shareholders[energyIndex] ? 0.15 : 0.08);
    }
  }
  pushLog(game, null, `event-${card.grade}`, `${card.nameKo} · ${card.rate >= 0 ? "+" : ""}${Math.round(card.rate * 100)}%`, { card });
  if (card.duration > 0 && !game.survivalMvp.activeEffects.some((effect) => effect.card.id === card.id)) game.survivalMvp.activeEffects.push({ card: { ...card }, remaining: card.duration });
}

function settleShortPosition(game) {
  const short = game.survivalMvp.shortPosition;
  if (!short) return null;
  const player = playerById(game, short.playerId);
  const now = game.stocks[short.stockIndex].prices[priceIndex(game)];
  const rate = (short.price - now) / short.price;
  const delta = Math.round(short.stake * rate);
  player.cash += Math.max(-player.cash, delta);
  game.survivalMvp.shortPosition = null;
  return { ...short, rate, delta };
}

export function emergencySell(game, playerId, stockIndex, quantity) {
  const player = playerById(game, playerId);
  const qty = Math.floor(Number(quantity));
  if (qty < 1 || player.holdings[stockIndex] < qty) throw new Error("긴급매도 수량을 확인하세요.");
  const halted = game.survivalMvp.haltedRound === game.turn && game.survivalMvp.haltedStockIndex === Number(stockIndex);
  const rate = halted ? 0.7 : 0.9;
  const proceeds = Math.floor(game.stocks[stockIndex].prices[priceIndex(game)] * qty * rate);
  player.holdings[stockIndex] -= qty;
  player.cash += proceeds;
  game.survivalMvp.stockSupply[stockIndex] += qty;
  pushLog(game, playerId, "emergency-sell", `긴급매도 ${qty}주 · 현재가의 ${Math.round(rate * 100)}%`, { amountDelta: proceeds, stockIndex, quantity: qty });
  return { stockIndex: Number(stockIndex), quantity: qty, proceeds, rate };
}

export function completeRound(game) {
  const settlement = settleSurvivalRound(game);
  if (game.finished || game.turn >= game.totalTurns) {
    game.finished = true;
    game.finalRanking = [...game.players].sort((a, b) => survivalNetWorth(game, b) - survivalNetWorth(game, a)).map((player, index) => ({ playerId: player.id, nickname: player.nickname, assets: survivalNetWorth(game, player), rank: index + 1 }));
    return { finished: true, ranking: game.finalRanking, settlement };
  }
  game.turn += 1;
  game.survivalMvp.turnOrder = calculateTurnOrder(game);
  game.survivalMvp.activePlayerId = game.survivalMvp.turnOrder[0];
  game.survivalMvp.phase = "action";
  game.survivalMvp.actionResult = null;
  game.survivalMvp.diceResult = null;
  game.survivalMvp.defendedPlayerIds = [];
  game.survivalMvp.actedPlayerIds = [];
  return { finished: false, turn: game.turn, order: game.survivalMvp.turnOrder, settlement };
}

export function runAiTurns(game, random = Math.random) {
  return advanceAfterResolved(game, game.survivalMvp.activePlayerId, random);
}

function performAiTurn(game, id, random) {
  game.survivalMvp.activePlayerId = id;
  game.survivalMvp.phase = "action";
  const player = playerById(game, id);
  const affordable = game.stocks.findIndex((stock, index) => game.survivalMvp.stockSupply[index] > 0 && player.holdings[index] < MVP_RULES.maxHoldingPerCompany && stock.prices[priceIndex(game)] <= player.cash);
  if (affordable >= 0 && random() > 0.3) applyAction(game, { type: "buy", stockIndex: affordable, quantity: 1 }, id, random);
  else applyAction(game, { type: random() > 0.5 ? "defend" : "gamble" }, id, random);
  resolveDice(game, id, null, random);
}

export function advanceAfterResolved(game, playerId, random = Math.random) {
  if (game.survivalMvp.phase !== "resolved" || game.survivalMvp.activePlayerId !== playerId) throw new Error("현재 플레이어의 결과 단계가 아닙니다.");
  if (!game.survivalMvp.actedPlayerIds.includes(playerId)) game.survivalMvp.actedPlayerIds.push(playerId);
  while (true) {
    const nextId = game.survivalMvp.turnOrder.find((id) => !game.survivalMvp.actedPlayerIds.includes(id) && !playerById(game, id).eliminated);
    if (!nextId) {
      const result = completeRound(game);
      if (result.finished) return result;
      const first = game.survivalMvp.activePlayerId;
      if (playerById(game, first).isHuman) return { ...result, awaitingPlayerId: first };
      performAiTurn(game, first, random);
      if (!game.survivalMvp.actedPlayerIds.includes(first)) game.survivalMvp.actedPlayerIds.push(first);
      continue;
    }
    game.survivalMvp.activePlayerId = nextId;
    game.survivalMvp.phase = "action";
    if (playerById(game, nextId).isHuman) return { finished: false, turn: game.turn, awaitingPlayerId: nextId };
    performAiTurn(game, nextId, random);
    if (!game.survivalMvp.actedPlayerIds.includes(nextId)) game.survivalMvp.actedPlayerIds.push(nextId);
  }
}

export function autoCompletePhase(game, playerId, random = Math.random) {
  if (game.survivalMvp.phase === "action") {
    const player = playerById(game, playerId);
    if (player.isHuman && !player.skillSelectionComplete) {
      player.selectedSkillDraft = player.skillDraft.slice(0, 2);
      confirmSkillSelection(game, playerId);
    }
    return applyAction(game, { type: "defend" }, playerId, random);
  }
  if (game.survivalMvp.phase === "dice") return resolveDice(game, playerId, null, random);
  return advanceAfterResolved(game, playerId, random);
}

export function mvpNetWorth(game, playerId) {
  return survivalNetWorth(game, playerById(game, playerId));
}
