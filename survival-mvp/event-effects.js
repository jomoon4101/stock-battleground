import { calculateMajorShareholders } from "./progression.js";

// [완료] 모든 이벤트 가격 변화는 이 파일을 통과해 주식·대체자산·최대주주 보너스를 한 번만 계산한다.
export const eventPriceIndex = (game) => Math.max(0, Math.min(game.turn - 1, game.stocks[0].prices.length - 1));

export function changeStockPrice(game, stockIndex, rate) {
  const cursor = eventPriceIndex(game);
  const stock = game.stocks[stockIndex];
  if (!stock) return null;
  const previousPrice = stock.prices[cursor];
  stock.prices[cursor] = Math.max(1, Math.round(previousPrice * (1 + rate)));
  return { previousPrice, price: stock.prices[cursor], rate: stock.prices[cursor] / previousPrice - 1 };
}

export function applyEventCard(game, card) {
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

  if (card.target === "market") game.stocks.forEach((_, index) => changeStockPrice(game, index, shareholderAdjustedRate(index, card.rate) * multiplierFor(index)));
  if (card.target === "stock") {
    const index = Math.max(0, Math.min(game.stocks.length - 1, Number(card.sectorIndex) || 0));
    changeStockPrice(game, index, shareholderAdjustedRate(index, card.rate) * multiplierFor(index));
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
      if (shareholders[industrialIndex]) changeStockPrice(game, industrialIndex, 0.03);
    }
    if (card.id === "global-inflation") {
      const materialsIndex = game.stocks.findIndex((stock) => stock.sectorKey === "materials");
      if (shareholders[materialsIndex]) changeStockPrice(game, materialsIndex, 0.1);
    }
    if (card.id === "war-risk") {
      const energyIndex = game.stocks.findIndex((stock) => stock.sectorKey === "energy");
      changeStockPrice(game, energyIndex, shareholders[energyIndex] ? 0.15 : 0.08);
    }
  }

  game.logs.unshift({
    id: `event-${Date.now()}-${game.logs.length}`,
    turn: game.turn,
    playerId: null,
    type: `event-${card.grade}`,
    message: `${card.nameKo} · ${card.rate >= 0 ? "+" : ""}${Math.round(card.rate * 100)}%`,
    card,
  });
  game.logs = game.logs.slice(0, 120);
  if (card.duration > 0 && !game.survivalMvp.activeEffects.some((effect) => effect.card.id === card.id)) {
    game.survivalMvp.activeEffects.push({ card: { ...card }, remaining: card.duration });
  }
  return card;
}
