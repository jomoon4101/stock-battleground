import test from "node:test";
import assert from "node:assert/strict";
import { createSurvivalMvpGame } from "../survival-mvp/game-state.js";
import { applyAction, resolveDice, completeRound, autoCompletePhase } from "../survival-mvp/game-logic.js";
import { MVP_RULES } from "../survival-mvp/config.js";

test("creates the PDF milestone game with 11 sectors and 387 starting cash", () => {
  const game = createSurvivalMvpGame({ playerCount: 3, seed: 7, nickname: "개미" });
  assert.equal(game.players.length, 3);
  assert.equal(game.stocks.length, 11);
  assert.equal(game.totalTurns, 10);
  assert.ok(game.players.every((player) => player.cash === 387));
  assert.ok(game.survivalMvp.stockSupply.every((amount) => amount === 21));
});

test("buy action enforces action and holding limits", () => {
  const game = createSurvivalMvpGame({ playerCount: 3, seed: 8 });
  game.players[0].cash = 10_000;
  applyAction(game, { type: "buy", stockIndex: 0, quantity: 5 }, game.players[0].id, () => 0.9);
  assert.equal(game.players[0].holdings[0], 5);
  assert.equal(game.survivalMvp.stockSupply[0], 16);
  game.survivalMvp.phase = "action";
  assert.throws(() => applyAction(game, { type: "buy", stockIndex: 0, quantity: 6 }, game.players[0].id), /5/);
});

test("defend halves the following dice event and gamble changes cash", () => {
  const game = createSurvivalMvpGame({ playerCount: 3, seed: 9 });
  const player = game.players[0];
  applyAction(game, { type: "defend" }, player.id);
  const before = game.stocks[0].prices[0];
  resolveDice(game, player.id, 2, () => 0);
  const after = game.stocks[0].prices[0];
  assert.ok(after < before);
  assert.ok(after > Math.round(before * 0.95));

  const second = createSurvivalMvpGame({ playerCount: 3, seed: 10 });
  const cash = second.players[0].cash;
  applyAction(second, { type: "gamble" }, second.players[0].id, () => 0.9);
  assert.equal(second.players[0].cash, cash + Math.floor(cash * 0.3));
});

test("round settlement pays 29 and recalculates low-asset-first order", () => {
  const game = createSurvivalMvpGame({ playerCount: 3, seed: 11 });
  game.players[0].cash = 500;
  game.players[1].cash = 100;
  game.players[2].cash = 300;
  completeRound(game);
  assert.deepEqual(game.players.map((player) => player.cash), [529, 129, 329]);
  assert.equal(game.turn, 2);
  assert.equal(game.survivalMvp.turnOrder[0], game.players[1].id);
});

test("timeout safely advances every phase", () => {
  const game = createSurvivalMvpGame({ playerCount: 3, seed: 12 });
  const id = game.players[0].id;
  autoCompletePhase(game, id, () => 0.2);
  assert.equal(game.survivalMvp.phase, "dice");
  autoCompletePhase(game, id, () => 0.2);
  assert.equal(game.survivalMvp.phase, "resolved");
  assert.equal(MVP_RULES.survivalIncome, 29);
});
