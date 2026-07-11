import { createGame, netWorth } from "../engine.js";
import { MVP_RULES } from "./config.js";
import { ALTERNATIVE_ASSETS, alternativeAssetValue } from "./assets.js";
import { dealSkills } from "./skills.js";

// [완료] 게임 시작 시 필요한 플레이어 비공개 정보와 서바이벌 상태를 한 번만 초기화한다.
export function calculateTurnOrder(game) {
  return [...game.players]
    .filter((player) => !player.eliminated)
    .sort((a, b) => (netWorth(a, game.stocks, game.turn) + alternativeAssetValue(game, a)) - (netWorth(b, game.stocks, game.turn) + alternativeAssetValue(game, b)))
    .map((player) => player.id);
}

export function createSurvivalMvpGame({ nickname = "플레이어", seed = Date.now(), language = "ko", avatar = null, playerCount = 3, totalTurns = MVP_RULES.totalRounds, requireSkillSelection = false } = {}) {
  const count = Math.max(MVP_RULES.minPlayers, Math.min(MVP_RULES.maxPlayers, Math.floor(Number(playerCount) || MVP_RULES.minPlayers)));
  const rounds = [10, 20, 30].includes(Number(totalTurns)) ? Number(totalTurns) : MVP_RULES.totalRounds;
  const game = createGame({ nickname, seed, language, avatar, playerCount: count, totalTurns: rounds, difficulty: "hard" });
  game.players.forEach((player) => {
    player.cash = MVP_RULES.startingCash;
    player.salary = 0;
    player.debt = 0;
    player.bonds = [];
    player.holdings.fill(0);
    player.averagePrices.fill(0);
    player.alternativeAssets = { gold: 0, copper: 0, coin: 0 };
    player.bankruptcyDanger = false;
    player.bankruptcyDangerRounds = 0;
    player.bankruptcyRecoveries = 0;
    player.skillDraft = dealSkills(() => game.rng.next(), 3);
    player.selectedSkillDraft = [];
    player.skills = player.isHuman && requireSkillSelection ? [] : player.skillDraft.slice(0, 2);
    player.skillSelectionComplete = !player.isHuman || !requireSkillSelection;
    player.hiddenVictory = ["safe-asset-king", "crisis-hunter", "monopoly-tycoon", "defense-wins", "coin-rich"][game.rng.int(0, 4)];
    player.defensiveSurvivalRounds = 0;
    player.coinTripleRound = 0;
    player.healthcareRescueUsed = false;
  });
  game.logs = [];
  game.survivalMvp = {
    version: 1,
    phase: "action",
    activePlayerId: game.players[0].id,
    turnOrder: [],
    stockSupply: game.stocks.map(() => MVP_RULES.companyShareSupply),
    actionResult: null,
    diceResult: null,
    defendedPlayerIds: [],
    actedPlayerIds: [],
    alternativeMarkets: Object.fromEntries(Object.entries(ALTERNATIVE_ASSETS).map(([key, asset]) => [key, { price: asset.startPrice, previousPrice: asset.startPrice, changeRate: 0, history: [asset.startPrice] }])),
    majorShareholders: game.stocks.map(() => null),
    victory: null,
    lastLeaderId: null,
    leaderStreak: 0,
    lastFameBonusRound: 0,
    activeEffects: [],
    skillEventResult: null,
  };
  game.survivalMvp.turnOrder = calculateTurnOrder(game);
  game.survivalMvp.activePlayerId = game.survivalMvp.turnOrder[0];
  return game;
}
