import { getRanking, netWorth } from "../engine.js";
import { MVP_ACTIONS, MVP_RULES } from "./config.js";
import { eventForRoll } from "./events.js";
import { calculateTurnOrder } from "./game-state.js";

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

export function applyAction(game, action, playerId, random = Math.random) {
  if (!game.survivalMvp || game.survivalMvp.phase !== "action") throw new Error("지금은 행동 선택 단계가 아닙니다.");
  if (!MVP_ACTIONS.includes(action?.type)) throw new Error("사용할 수 없는 행동입니다.");
  const player = playerById(game, playerId);
  let result;
  if (action.type === "buy" || action.type === "sell") {
    const stockIndex = Math.floor(Number(action.stockIndex));
    const quantity = Math.floor(Number(action.quantity));
    if (!game.stocks[stockIndex] || quantity < 1) throw new Error("종목과 수량을 확인하세요.");
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
  } else if (action.type === "defend") {
    if (!game.survivalMvp.defendedPlayerIds.includes(playerId)) game.survivalMvp.defendedPlayerIds.push(playerId);
    result = { type: "defend" };
  } else if (action.type === "gamble") {
    const stake = Math.floor(player.cash * MVP_RULES.gambleCashRate);
    const won = random() >= 0.5;
    player.cash += won ? stake : -stake;
    result = { type: "gamble", stake, won };
  } else {
    const target = playerById(game, action.targetPlayerId);
    const failed = random() < MVP_RULES.interferenceFailRate;
    const stockIndex = largestHoldingIndex(target);
    if (!failed) changePrice(game, stockIndex, -MVP_RULES.interferenceDrop);
    const targetRank = getRanking(game, { display: false }).find((entry) => entry.playerId === target.id)?.rank;
    const bounty = !failed && targetRank === 1 ? MVP_RULES.firstPlaceBounty : 0;
    player.cash += bounty;
    result = { type: "interfere", targetPlayerId: target.id, stockIndex, failed, bounty };
  }
  game.survivalMvp.actionResult = result;
  game.survivalMvp.phase = "dice";
  return result;
}

export function resolveDice(game, playerId, forcedRoll = null, random = Math.random) {
  if (game.survivalMvp.phase !== "dice") throw new Error("먼저 행동을 선택하세요.");
  const player = playerById(game, playerId);
  const roll = forcedRoll == null ? Math.floor(random() * 6) + 1 : Math.max(1, Math.min(6, Math.floor(forcedRoll)));
  const event = eventForRoll(roll);
  const defended = game.survivalMvp.defendedPlayerIds.includes(playerId);
  const multiplier = defended ? MVP_RULES.defendEffectMultiplier : 1;
  if (event.cash) player.cash += event.cash;
  if (event.direction) {
    const rate = event.direction * event.rate * multiplier;
    if (event.scope === "market") game.stocks.forEach((_, index) => changePrice(game, index, rate));
    else {
      let index = event.scope === "random" ? Math.floor(random() * game.stocks.length) : largestHoldingIndex(player);
      if (!player.holdings[index] && event.scope === "holding") index = Math.floor(random() * game.stocks.length);
      changePrice(game, index, rate);
    }
  }
  const result = { roll, event, defended };
  game.survivalMvp.diceResult = result;
  game.survivalMvp.phase = "resolved";
  return result;
}

export function completeRound(game) {
  game.players.filter((player) => !player.eliminated).forEach((player) => { player.cash += MVP_RULES.survivalIncome; });
  if (game.turn >= game.totalTurns) {
    game.finished = true;
    game.finalRanking = getRanking(game, { display: false });
    return { finished: true, ranking: game.finalRanking };
  }
  game.turn += 1;
  game.survivalMvp.turnOrder = calculateTurnOrder(game);
  game.survivalMvp.activePlayerId = game.survivalMvp.turnOrder[0];
  game.survivalMvp.phase = "action";
  game.survivalMvp.actionResult = null;
  game.survivalMvp.diceResult = null;
  game.survivalMvp.defendedPlayerIds = [];
  game.survivalMvp.actedPlayerIds = [];
  return { finished: false, turn: game.turn, order: game.survivalMvp.turnOrder };
}

export function runAiTurns(game, random = Math.random) {
  for (const id of game.survivalMvp.turnOrder) {
    if (playerById(game, id).isHuman) continue;
    game.survivalMvp.phase = "action";
    const player = playerById(game, id);
    const affordable = game.stocks.findIndex((stock, index) => game.survivalMvp.stockSupply[index] > 0 && stock.prices[priceIndex(game)] <= player.cash);
    if (affordable >= 0 && random() > 0.3) applyAction(game, { type: "buy", stockIndex: affordable, quantity: 1 }, id, random);
    else applyAction(game, { type: random() > 0.5 ? "defend" : "gamble" }, id, random);
    resolveDice(game, id, null, random);
    game.survivalMvp.actedPlayerIds.push(id);
  }
  return completeRound(game);
}

export function autoCompletePhase(game, playerId, random = Math.random) {
  if (game.survivalMvp.phase === "action") return applyAction(game, { type: "defend" }, playerId, random);
  if (game.survivalMvp.phase === "dice") return resolveDice(game, playerId, null, random);
  return runAiTurns(game, random);
}

export function mvpNetWorth(game, playerId) {
  return netWorth(playerById(game, playerId), game.stocks, game.turn);
}
