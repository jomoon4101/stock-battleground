import { getRanking } from "../engine.js";

export const SKILL_CARDS = Object.freeze({
  "short-sell": { ko: "공매도", en: "Short Sell" }, rumor: { ko: "루머", en: "Rumor" },
  "inside-info": { ko: "내부정보", en: "Inside Information" }, halt: { ko: "거래정지", en: "Trading Halt" },
  "tax-audit": { ko: "세무조사", en: "Tax Audit" }, tabloid: { ko: "찌라시", en: "Extra Event" },
  "fat-finger": { ko: "두꺼운 손가락", en: "Fat Finger" }, peek: { ko: "곁눈질", en: "Peek" },
  rally: { ko: "영차영차", en: "Sector Rally" },
});

export function dealSkills(random = Math.random, count = 3) {
  const pool = Object.keys(SKILL_CARDS);
  const result = [];
  while (result.length < Math.min(count, pool.length)) {
    const key = pool[Math.floor(random() * pool.length)];
    if (!result.includes(key)) result.push(key);
  }
  return result;
}

export function useSkill(game, playerId, skillId, payload = {}, random = Math.random) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player?.skills?.includes(skillId)) throw new Error("보유하지 않은 스킬카드입니다.");
  const consume = () => { player.skills = player.skills.filter((id) => id !== skillId); };
  let result = { skillId };
  if (skillId === "tax-audit") {
    const leader = getRanking(game, { display: false })[0];
    const target = game.players.find((candidate) => candidate.id === leader.playerId);
    const tax = Math.ceil((leader.assets || target.cash) * 0.05);
    target.cash -= Math.min(target.cash, tax);
    result = { ...result, targetPlayerId: target.id, tax };
  } else if (skillId === "rumor") {
    const success = random() < 0.7;
    if (success && game.stocks[payload.stockIndex]) {
      const cursor = game.turn - 1;
      game.stocks[payload.stockIndex].prices[cursor] = Math.max(1, Math.round(game.stocks[payload.stockIndex].prices[cursor] * 0.9));
    }
    result = { ...result, success };
  } else if (skillId === "halt") {
    game.survivalMvp.haltedStockIndex = Number(payload.stockIndex);
    game.survivalMvp.haltedRound = game.turn;
  } else if (skillId === "inside-info") {
    result = { ...result, nextSectorIndex: Math.floor(random() * game.stocks.length) };
  } else if (skillId === "fat-finger") {
    game.survivalMvp.evenQuantityRound = game.turn;
  } else if (skillId === "peek") {
    result = { ...result, cards: [...(game.players.find((candidate) => candidate.id === payload.targetPlayerId)?.skills || [])] };
  } else if (skillId === "rally") {
    game.survivalMvp.rallyStockIndex = Number(payload.stockIndex);
    game.survivalMvp.rallyRound = game.turn + 1;
  } else if (skillId === "tabloid") {
    game.survivalMvp.extraEventCount = (game.survivalMvp.extraEventCount || 0) + 1;
  } else if (skillId === "short-sell") {
    game.survivalMvp.shortPosition = { playerId, stockIndex: Number(payload.stockIndex), stake: Math.floor(player.cash * 0.3), price: game.stocks[payload.stockIndex].prices[game.turn - 1] };
  }
  consume();
  return result;
}
