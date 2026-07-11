import { netWorth } from "../engine.js";
import { MVP_RULES } from "./config.js";
import { alternativeAssetValue, fluctuateAlternativeAssets } from "./assets.js";

export const BANKRUPTCY_DANGER_THRESHOLD = 58;
export const BANKRUPTCY_RECOVERY_THRESHOLD = 155;
export const TENBAGGER_TARGET = 3_870;

// [완료] 순위·최대주주·파산·승리 판정은 라운드 정산 모듈에서 같은 자산 기준을 사용한다.
export function survivalNetWorth(game, player) {
  return netWorth(player, game.stocks, game.turn) + alternativeAssetValue(game, player);
}

export function getSurvivalRanking(game) {
  return game.players.filter((player) => !player.eliminated)
    .map((player) => ({ playerId: player.id, nickname: player.nickname, assets: survivalNetWorth(game, player) }))
    .sort((a, b) => b.assets - a.assets)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function calculateMajorShareholders(game) {
  return game.stocks.map((_, stockIndex) => {
    const active = game.players.filter((player) => !player.eliminated);
    const highest = Math.max(0, ...active.map((player) => player.holdings[stockIndex] || 0));
    if (highest < 3) return null;
    const leaders = active.filter((player) => player.holdings[stockIndex] === highest);
    return leaders.length === 1 ? leaders[0].id : null;
  });
}

export function applyMajorShareholderBonuses(game) {
  const holders = calculateMajorShareholders(game);
  holders.forEach((playerId, index) => {
    if (!playerId) return;
    const player = game.players.find((candidate) => candidate.id === playerId);
    const key = game.stocks[index].sectorKey;
    if (key === "financials") player.cash += 5;
    if (key === "utilities") player.cash += 3;
    if (key === "real-estate") player.cash += Math.floor(player.holdings[index] / 3) * 5;
  });
  game.survivalMvp.majorShareholders = holders;
  return holders;
}

export function updateBankruptcy(game, player) {
  if (player.eliminated) return "bankrupt";
  const assets = survivalNetWorth(game, player);
  if (assets <= 0) {
    const healthIndex = game.stocks.findIndex((stock) => stock.sectorKey === "health-care");
    const healthOwner = calculateMajorShareholders(game)[healthIndex];
    if (healthOwner === player.id && !player.healthcareRescueUsed) {
      player.healthcareRescueUsed = true;
      player.cash = Math.max(player.cash, BANKRUPTCY_DANGER_THRESHOLD + 1);
      player.bankruptcyDanger = false;
      player.bankruptcyDangerRounds = 0;
      return "rescued";
    }
    player.eliminated = true;
    player.bankruptcyReason = "zero-assets";
    return "bankrupt";
  }
  if (player.bankruptcyDanger && assets >= BANKRUPTCY_RECOVERY_THRESHOLD) {
    player.bankruptcyDanger = false;
    player.bankruptcyDangerRounds = 0;
    player.bankruptcyRecoveries += 1;
    return "recovered";
  }
  if (assets <= BANKRUPTCY_DANGER_THRESHOLD) {
    player.bankruptcyDanger = true;
    player.bankruptcyDangerRounds += 1;
    if (player.bankruptcyDangerRounds >= 2) {
      const healthIndex = game.stocks.findIndex((stock) => stock.sectorKey === "health-care");
      if (calculateMajorShareholders(game)[healthIndex] === player.id && !player.healthcareRescueUsed) {
        player.healthcareRescueUsed = true;
        player.cash += BANKRUPTCY_RECOVERY_THRESHOLD - assets;
        player.bankruptcyDanger = false;
        player.bankruptcyDangerRounds = 0;
        return "rescued";
      }
      player.eliminated = true;
      player.bankruptcyReason = "danger-two-rounds";
      return "bankrupt";
    }
    return "danger";
  }
  return "safe";
}

export function checkVictory(game) {
  const active = game.players.filter((player) => !player.eliminated);
  if (active.length === 1) return { playerId: active[0].id, reason: "last-survivor" };
  const hiddenWinners = active.map((player) => checkHiddenVictory(game, player)).filter(Boolean)
    .sort((a, b) => survivalNetWorth(game, game.players.find((player) => player.id === b.playerId)) - survivalNetWorth(game, game.players.find((player) => player.id === a.playerId)));
  if (hiddenWinners.length) return hiddenWinners[0];
  const shareholders = calculateMajorShareholders(game);
  const shareholderWinner = active.find((player) => shareholders.filter((id) => id === player.id).length >= 7);
  if (shareholderWinner) return { playerId: shareholderWinner.id, reason: "major-shareholder" };
  const tenbagger = [...active].sort((a, b) => survivalNetWorth(game, b) - survivalNetWorth(game, a)).find((player) => survivalNetWorth(game, player) >= TENBAGGER_TARGET);
  if (tenbagger) return { playerId: tenbagger.id, reason: "tenbagger" };
  if (game.turn >= game.totalTurns) {
    const leader = [...active].sort((a, b) => survivalNetWorth(game, b) - survivalNetWorth(game, a))[0];
    return leader ? { playerId: leader.id, reason: "assets" } : null;
  }
  return null;
}

export function checkHiddenVictory(game, player) {
  if (!player || player.eliminated) return null;
  const active = game.players.filter((candidate) => !candidate.eliminated).sort((a, b) => survivalNetWorth(game, b) - survivalNetWorth(game, a));
  const rank = active.findIndex((candidate) => candidate.id === player.id) + 1;
  const shareholders = calculateMajorShareholders(game);
  const ownedKeys = game.stocks.filter((_, index) => shareholders[index] === player.id).map((stock) => stock.sectorKey);
  const highRisk = new Set(["technology", "consumer-discretionary", "communication-services", "energy", "materials"]);
  const coinValue = (player.alternativeAssets.coin || 0) * game.survivalMvp.alternativeMarkets.coin.price;
  const total = Math.max(1, survivalNetWorth(game, player));
  const conditions = {
    "safe-asset-king": player.alternativeAssets.gold >= 15 && rank <= 2,
    "crisis-hunter": player.bankruptcyRecoveries >= 2 && rank === 1,
    "monopoly-tycoon": ownedKeys.filter((key) => highRisk.has(key)).length >= 3 && rank === 1,
    "defense-wins": ["consumer-staples", "utilities", "health-care"].every((key) => ownedKeys.includes(key)) && player.defensiveSurvivalRounds >= 7,
    "coin-rich": player.coinTripleRound > 0 && game.turn > player.coinTripleRound && player.alternativeAssets.coin === Math.max(...active.map((candidate) => candidate.alternativeAssets.coin || 0)) && coinValue / total >= 0.59,
  };
  return conditions[player.hiddenVictory] ? { playerId: player.id, reason: `hidden-${player.hiddenVictory}`, hidden: true } : null;
}

export function settleSurvivalRound(game, random = Math.random) {
  const beforeAssets = new Map(game.players.map((player) => [player.id, survivalNetWorth(game, player)]));
  game.players.filter((player) => !player.eliminated).forEach((player) => { player.cash += MVP_RULES.survivalIncome; });
  fluctuateAlternativeAssets(game, random);
  game.survivalMvp.activeEffects = (game.survivalMvp.activeEffects || []).filter((effect) => {
    const card = effect.card;
    if (card.target === "stock" && game.stocks[card.sectorIndex]) {
      const cursor = Math.max(0, game.turn - 1);
      game.stocks[card.sectorIndex].prices[cursor] = Math.max(1, Math.round(game.stocks[card.sectorIndex].prices[cursor] * (1 + card.rate * 0.5)));
    }
    effect.remaining -= 1;
    return effect.remaining > 0;
  });
  applyMajorShareholderBonuses(game);
  const ranking = getSurvivalRanking(game);
  const leaderId = ranking[0]?.playerId;
  if (leaderId && game.survivalMvp.lastLeaderId === leaderId) game.survivalMvp.leaderStreak = (game.survivalMvp.leaderStreak || 1) + 1;
  else { game.survivalMvp.lastLeaderId = leaderId; game.survivalMvp.leaderStreak = leaderId ? 1 : 0; }
  if (leaderId && game.survivalMvp.leaderStreak >= 3 && game.survivalMvp.leaderStreak % 3 === 0 && game.survivalMvp.lastFameBonusRound !== game.turn) {
    game.players.find((player) => player.id === leaderId).cash += 30;
    game.survivalMvp.lastFameBonusRound = game.turn;
    game.logs.unshift({ id: `fame-${game.turn}-${leaderId}`, turn: game.turn, playerId: leaderId, type: "fame", message: "3라운드 연속 1위 명성 보너스 +30머니", amountDelta: 30 });
  }
  const defensiveKeys = new Set(["consumer-staples", "utilities", "health-care"]);
  const shareholders = calculateMajorShareholders(game);
  game.players.forEach((player) => {
    const owned = game.stocks.filter((_, index) => shareholders[index] === player.id).map((stock) => stock.sectorKey);
    player.defensiveSurvivalRounds = [...defensiveKeys].every((key) => owned.includes(key)) && !player.eliminated ? (player.defensiveSurvivalRounds || 0) + 1 : 0;
    const before = Math.max(1, beforeAssets.get(player.id) || 1);
    if (survivalNetWorth(game, player) >= before * 3 && (player.alternativeAssets.coin || 0) > 0) player.coinTripleRound = game.turn;
  });
  const bankruptcy = game.players.map((player) => ({ playerId: player.id, status: updateBankruptcy(game, player) }));
  bankruptcy.filter((entry) => entry.status !== "safe").forEach((entry) => {
    const labels = { danger: "파산 위기 진입", recovered: "파산 위기 극복", bankrupt: "파산", rescued: "헬스케어 최대주주 방어" };
    game.logs.unshift({ id: `bankruptcy-${game.turn}-${entry.playerId}-${entry.status}`, turn: game.turn, playerId: entry.playerId, type: entry.status, message: labels[entry.status] || entry.status });
  });
  const victory = checkVictory(game);
  if (victory) {
    game.finished = true;
    game.survivalMvp.victory = victory;
    game.logs.unshift({ id: `victory-${game.turn}-${victory.playerId}`, turn: game.turn, playerId: victory.playerId, type: "victory", message: `승리조건 달성 · ${victory.reason}` });
  }
  return { bankruptcy, victory };
}
