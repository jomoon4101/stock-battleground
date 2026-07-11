import { getRanking } from "../engine.js";
import { calculateMajorShareholders, getSurvivalRanking } from "./progression.js";
import { drawEventCard } from "./events.js";
import { applyEventCard } from "./event-effects.js";

export const SKILL_CARDS = Object.freeze({
  "short-sell": { ko: "공매도", en: "Short Sell", descKo: "현금 30%를 걸고 다음 하락률만큼 수익", descEn: "Stake 30% cash and profit from the next drop" },
  rumor: { ko: "루머", en: "Rumor", descKo: "70% 확률로 선택 섹터 악재", descEn: "70% chance of bad news in a chosen sector" },
  "inside-info": { ko: "내부정보", en: "Inside Information", descKo: "다음 이벤트 영향 섹터 미리보기", descEn: "Preview the next event sector" },
  halt: { ko: "거래정지", en: "Trading Halt", descKo: "선택 섹터의 이번 라운드 일반거래 정지", descEn: "Halt normal trades in one sector this round" },
  "tax-audit": { ko: "세무조사", en: "Tax Audit", descKo: "1위에게 총자산 5% 세금", descEn: "Tax the leader 5% of total assets" },
  tabloid: { ko: "찌라시", en: "Extra Event", descKo: "이벤트카드 1장 추가 공개", descEn: "Reveal one extra event card" },
  "fat-finger": { ko: "두꺼운 손가락", en: "Fat Finger", descKo: "이번 라운드 거래 수량을 짝수로 제한", descEn: "Force even trade quantities this round" },
  peek: { ko: "곁눈질", en: "Peek", descKo: "상대의 보유 스킬 확인", descEn: "Inspect another player's skills" },
  rally: { ko: "영차영차", en: "Sector Rally", descKo: "다음 이벤트가 선택 섹터일 확률 50%", descEn: "50% chance the next event targets a chosen sector" },
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

export function toggleSkillDraft(game, playerId, skillId) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player || player.skillSelectionComplete || !player.skillDraft?.includes(skillId)) throw new Error("선택할 수 없는 스킬카드입니다.");
  const selected = player.selectedSkillDraft || (player.selectedSkillDraft = []);
  if (selected.includes(skillId)) player.selectedSkillDraft = selected.filter((id) => id !== skillId);
  else {
    if (selected.length >= 2) throw new Error("스킬카드는 2장만 선택할 수 있습니다.");
    selected.push(skillId);
  }
  return [...player.selectedSkillDraft];
}

export function confirmSkillSelection(game, playerId) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player || player.skillSelectionComplete) throw new Error("이미 스킬 선택을 완료했습니다.");
  if (player.selectedSkillDraft?.length !== 2) throw new Error("스킬카드 2장을 선택하세요.");
  player.skills = [...player.selectedSkillDraft];
  player.skillSelectionComplete = true;
  return [...player.skills];
}

// [완료] 스킬은 살아 있는 현재 플레이어의 행동 단계에서만 검증 후 한 번 소모한다.
export function useSkill(game, playerId, skillId, payload = {}, random = Math.random) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player?.skills?.includes(skillId)) throw new Error("보유하지 않은 스킬카드입니다.");
  if (player.eliminated) throw new Error("탈락한 플레이어는 스킬카드를 사용할 수 없습니다.");
  if (game.survivalMvp?.activePlayerId !== playerId) throw new Error("현재 내 턴에만 스킬카드를 사용할 수 있습니다.");
  if (game.survivalMvp?.phase !== "action") throw new Error("행동 단계에서만 스킬카드를 사용할 수 있습니다.");
  const consume = () => { player.skills = player.skills.filter((id) => id !== skillId); };
  let result = { skillId };
  if (skillId === "tax-audit") {
    const leader = game.survivalMvp ? getSurvivalRanking(game)[0] : getRanking(game, { display: false })[0];
    const target = game.players.find((candidate) => candidate.id === leader.playerId);
    const tax = Math.ceil((leader.assets || target.cash) * 0.05);
    let raised = 0;
    while (target.cash < tax) {
      const cursor = game.turn - 1;
      const candidates = target.holdings.map((quantity, stockIndex) => ({ stockIndex, quantity, value: quantity > 0 ? game.stocks[stockIndex].prices[cursor] : 0 })).filter((entry) => entry.value > 0).sort((a, b) => b.value - a.value);
      if (!candidates.length) break;
      const best = candidates[0];
      const proceeds = Math.floor(best.value * 0.9);
      target.holdings[best.stockIndex] -= 1;
      game.survivalMvp.stockSupply[best.stockIndex] += 1;
      target.cash += proceeds;
      raised += proceeds;
    }
    const paid = Math.min(target.cash, tax);
    target.cash -= paid;
    result = { ...result, targetPlayerId: target.id, tax: paid, raised };
  } else if (skillId === "rumor") {
    const communicationIndex = game.stocks.findIndex((stock) => stock.sectorKey === "communication-services");
    const communicationOwner = calculateMajorShareholders(game)[communicationIndex];
    const success = random() < (communicationOwner === playerId ? 0.85 : 0.7);
    if (success && game.stocks[payload.stockIndex]) {
      const cursor = game.turn - 1;
      game.stocks[payload.stockIndex].prices[cursor] = Math.max(1, Math.round(game.stocks[payload.stockIndex].prices[cursor] * 0.9));
    }
    result = { ...result, success };
  } else if (skillId === "halt") {
    game.survivalMvp.haltedStockIndex = Number(payload.stockIndex);
    game.survivalMvp.haltedRound = game.turn;
  } else if (skillId === "inside-info") {
    const nextSectorIndex = Math.floor(random() * game.stocks.length);
    player.queuedInsideInfoCard = drawEventCard(random, nextSectorIndex);
    player.insideInfo = { turn: game.turn, nextSectorIndex };
    result = { ...result, nextSectorIndex };
  } else if (skillId === "fat-finger") {
    game.survivalMvp.evenQuantityRound = game.turn;
  } else if (skillId === "peek") {
    const cards = [...(game.players.find((candidate) => candidate.id === payload.targetPlayerId)?.skills || [])];
    player.peekResult = { turn: game.turn, targetPlayerId: payload.targetPlayerId, cards };
    result = { ...result, cards };
  } else if (skillId === "rally") {
    game.survivalMvp.rallyStockIndex = Number(payload.stockIndex);
    game.survivalMvp.rallyRound = game.turn + 1;
  } else if (skillId === "tabloid") {
    const immediateEvent = player.queuedInsideInfoCard || drawEventCard(random);
    applyEventCard(game, immediateEvent);
    game.survivalMvp.skillEventResult = { playerId, turn: game.turn, card: immediateEvent };
    if (player.queuedInsideInfoCard) {
      delete player.queuedInsideInfoCard;
      player.insideInfo = null;
    }
    result = { ...result, immediateEvent };
  } else if (skillId === "short-sell") {
    game.survivalMvp.shortPosition = { playerId, stockIndex: Number(payload.stockIndex), stake: Math.floor(player.cash * 0.3), price: game.stocks[payload.stockIndex].prices[game.turn - 1] };
  }
  consume();
  return result;
}
