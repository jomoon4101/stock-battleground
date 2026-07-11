import { netWorth } from "../engine.js";
import { MVP_RULES } from "./config.js";
import { alternativeAssetValue, fluctuateAlternativeAssets } from "./assets.js";

export const BANKRUPTCY_DANGER_THRESHOLD = 58;
export const BANKRUPTCY_RECOVERY_THRESHOLD = 155;
export const TENBAGGER_TARGET = 3_870;

export function survivalNetWorth(game, player) {
  return netWorth(player, game.stocks, game.turn) + alternativeAssetValue(game, player);
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

export function settleSurvivalRound(game, random = Math.random) {
  game.players.filter((player) => !player.eliminated).forEach((player) => { player.cash += MVP_RULES.survivalIncome; });
  fluctuateAlternativeAssets(game, random);
  applyMajorShareholderBonuses(game);
  const bankruptcy = game.players.map((player) => ({ playerId: player.id, status: updateBankruptcy(game, player) }));
  const victory = checkVictory(game);
  if (victory) {
    game.finished = true;
    game.survivalMvp.victory = victory;
  }
  return { bankruptcy, victory };
}
