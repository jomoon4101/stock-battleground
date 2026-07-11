// [완료] 금·구리·코인의 수수료, 보유 제한과 가격 변화는 이 모듈에서만 처리한다.
export const ALTERNATIVE_ASSETS = Object.freeze({
  gold: Object.freeze({ startPrice: 100, minRate: -0.03, maxRate: 0.06, buyFee: 0, sellFee: 0 }),
  copper: Object.freeze({ startPrice: 100, minRate: -0.08, maxRate: 0.12, buyFee: 0, sellFee: 0 }),
  coin: Object.freeze({ startPrice: 100, minRate: -0.3, maxRate: 0.35, buyFee: 0.05, sellFee: 0.05, maxAssetRatio: 0.6 }),
});

const getPlayer = (game, id) => {
  const player = game.players.find((candidate) => candidate.id === id);
  if (!player) throw new Error("플레이어를 찾을 수 없습니다.");
  return player;
};
const getAsset = (game, key) => {
  if (!ALTERNATIVE_ASSETS[key] || !game.survivalMvp?.alternativeMarkets?.[key]) throw new Error("지원하지 않는 대체자산입니다.");
  return game.survivalMvp.alternativeMarkets[key];
};

export function alternativeAssetValue(game, player) {
  return Object.keys(ALTERNATIVE_ASSETS).reduce((sum, key) => sum + (player.alternativeAssets?.[key] || 0) * getAsset(game, key).price, 0);
}

export function buyAlternativeAsset(game, playerId, key, quantity) {
  const player = getPlayer(game, playerId);
  const market = getAsset(game, key);
  const qty = Math.floor(Number(quantity));
  if (qty < 1) throw new Error("수량은 1 이상이어야 합니다.");
  const cost = Math.round(market.price * qty * (1 + ALTERNATIVE_ASSETS[key].buyFee));
  if (cost > player.cash) throw new Error("현금이 부족합니다.");
  if (key === "coin") {
    const currentTotal = Math.max(1, player.cash + alternativeAssetValue(game, player));
    const nextCoinValue = ((player.alternativeAssets.coin || 0) + qty) * market.price;
    if (nextCoinValue > currentTotal * ALTERNATIVE_ASSETS.coin.maxAssetRatio) throw new Error("코인은 총자산의 60%까지만 보유할 수 있습니다.");
  }
  player.cash -= cost;
  player.alternativeAssets[key] += qty;
  return { key, quantity: qty, cost };
}

export function sellAlternativeAsset(game, playerId, key, quantity) {
  const player = getPlayer(game, playerId);
  const market = getAsset(game, key);
  const qty = Math.floor(Number(quantity));
  if (qty < 1 || player.alternativeAssets[key] < qty) throw new Error("보유 수량을 확인하세요.");
  const proceeds = Math.round(market.price * qty * (1 - ALTERNATIVE_ASSETS[key].sellFee));
  player.alternativeAssets[key] -= qty;
  player.cash += proceeds;
  return { key, quantity: qty, proceeds };
}

export function fluctuateAlternativeAssets(game, random = Math.random, modifiers = {}) {
  for (const [key, rule] of Object.entries(ALTERNATIVE_ASSETS)) {
    const market = getAsset(game, key);
    let rate = rule.minRate + random() * (rule.maxRate - rule.minRate);
    rate += Number(modifiers[key] || 0);
    market.previousPrice = market.price;
    market.price = Math.max(1, Math.round(market.price * (1 + rate)));
    market.changeRate = market.price / market.previousPrice - 1;
    market.history.push(market.price);
  }
  return game.survivalMvp.alternativeMarkets;
}
