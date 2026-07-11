import { createGame, netWorth } from "../engine.js";
import { MVP_RULES } from "./config.js";

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
  };
  game.survivalMvp.turnOrder = calculateTurnOrder(game);
  game.survivalMvp.activePlayerId = game.survivalMvp.turnOrder[0];
  return game;
}
