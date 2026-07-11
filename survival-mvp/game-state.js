import { createGame, netWorth } from "../engine.js";
import { MVP_RULES } from "./config.js";
import { ALTERNATIVE_ASSETS } from "./assets.js";
import { dealSkills } from "./skills.js";

export function calculateTurnOrder(game) {
  return [...game.players]
    .filter((player) => !player.eliminated)
    .sort((a, b) => netWorth(a, game.stocks, game.turn) - netWorth(b, game.stocks, game.turn))
    .map((player) => player.id);
}

export function createSurvivalMvpGame({ nickname = "플레이어", seed = Date.now(), language = "ko", avatar = null, playerCount = 3 } = {}) {
  const count = Math.max(MVP_RULES.minPlayers, Math.min(MVP_RULES.maxPlayers, Math.floor(Number(playerCount) || MVP_RULES.minPlayers)));
  const game = createGame({ nickname, seed, language, avatar, playerCount: count, totalTurns: MVP_RULES.totalRounds, difficulty: "hard" });
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
    player.skills = dealSkills(() => game.rng.next(), 3).slice(0, 2);
    player.hiddenVictory = ["safe-asset-king", "crisis-hunter", "monopoly-tycoon", "defense-wins", "coin-rich"][game.rng.int(0, 4)];
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
  };
  game.survivalMvp.turnOrder = calculateTurnOrder(game);
  game.survivalMvp.activePlayerId = game.survivalMvp.turnOrder[0];
  return game;
}
