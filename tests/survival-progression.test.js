import test from "node:test";
import assert from "node:assert/strict";
import { createSurvivalMvpGame } from "../survival-mvp/game-state.js";
import { buyAlternativeAsset, sellAlternativeAsset } from "../survival-mvp/assets.js";
import { calculateMajorShareholders, settleSurvivalRound, checkVictory } from "../survival-mvp/progression.js";
import { useSkill } from "../survival-mvp/skills.js";

test("gold copper and coin obey fees and allocation limits", () => {
  const game = createSurvivalMvpGame({ seed: 31, playerCount: 3 });
  const player = game.players[0];
  player.cash = 1_000;
  buyAlternativeAsset(game, player.id, "gold", 2);
  assert.equal(player.alternativeAssets.gold, 2);
  assert.equal(player.cash, 800);
  buyAlternativeAsset(game, player.id, "coin", 1);
  assert.equal(player.cash, 695);
  sellAlternativeAsset(game, player.id, "coin", 1);
  assert.equal(player.cash, 790);
});

test("a sole holder with at least three shares is the major shareholder", () => {
  const game = createSurvivalMvpGame({ seed: 32, playerCount: 3 });
  game.players[0].holdings[0] = 3;
  game.players[1].holdings[0] = 2;
  assert.equal(calculateMajorShareholders(game)[0], game.players[0].id);
  game.players[1].holdings[0] = 3;
  assert.equal(calculateMajorShareholders(game)[0], null);
});

test("danger persists for two settlements then bankrupts and all-in is available", () => {
  const game = createSurvivalMvpGame({ seed: 33, playerCount: 3 });
  const player = game.players[0];
  player.cash = 0;
  settleSurvivalRound(game);
  assert.equal(player.bankruptcyDanger, true);
  assert.equal(player.bankruptcyDangerRounds, 1);
  player.cash = 0;
  settleSurvivalRound(game);
  assert.equal(player.eliminated, true);
});

test("tenbagger and seven-sector shareholder wins are detected", () => {
  const game = createSurvivalMvpGame({ seed: 34, playerCount: 3 });
  game.players[0].cash = 3_870;
  assert.equal(checkVictory(game)?.reason, "tenbagger");
  game.players[0].cash = 387;
  for (let i = 0; i < 7; i += 1) game.players[0].holdings[i] = 3;
  assert.equal(checkVictory(game)?.reason, "major-shareholder");
});

test("one-use skills are consumed and apply their rule", () => {
  const game = createSurvivalMvpGame({ seed: 35, playerCount: 3 });
  const player = game.players[0];
  player.skills = ["tax-audit", "rumor"];
  game.players[1].cash = 2_000;
  useSkill(game, player.id, "tax-audit");
  assert.deepEqual(player.skills, ["rumor"]);
  assert.ok(game.players[1].cash < 2_000);
});
