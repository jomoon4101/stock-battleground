import test from "node:test";
import assert from "node:assert/strict";
import { createSurvivalMvpGame } from "../survival-mvp/game-state.js";
import { buyAlternativeAsset, sellAlternativeAsset } from "../survival-mvp/assets.js";
import { calculateMajorShareholders, settleSurvivalRound, checkVictory, checkHiddenVictory, updateBankruptcy } from "../survival-mvp/progression.js";
import { confirmSkillSelection, toggleSkillDraft, useSkill } from "../survival-mvp/skills.js";
import { drawEventCard } from "../survival-mvp/events.js";
import { applyAction, emergencySell, resolveDice } from "../survival-mvp/game-logic.js";

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

test("an alternative-asset order consumes the one action for the turn", () => {
  const game = createSurvivalMvpGame({ seed: 311, playerCount: 3 });
  const player = game.players[0];
  player.cash = 1_000;
  const result = applyAction(game, { type: "buy", assetKey: "gold", quantity: 2 }, player.id);
  assert.equal(result.assetKey, "gold");
  assert.equal(result.quantity, 2);
  assert.equal(player.alternativeAssets.gold, 2);
  assert.equal(game.survivalMvp.phase, "dice");
  assert.throws(() => applyAction(game, { type: "defend" }, player.id), /행동 선택 단계/);
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

test("skills require the owner's active action phase and are not consumed on rejection", () => {
  const game = createSurvivalMvpGame({ seed: 352, playerCount: 3 });
  const active = game.players[0];
  const waiting = game.players[1];
  waiting.skills = ["rumor"];
  assert.throws(() => useSkill(game, waiting.id, "rumor", { stockIndex: 0 }, () => 0.9), /현재.*턴/);
  assert.deepEqual(waiting.skills, ["rumor"]);
  active.skills = ["rumor"];
  applyAction(game, { type: "defend" }, active.id);
  assert.throws(() => useSkill(game, active.id, "rumor", { stockIndex: 0 }, () => 0.9), /행동 단계/);
  assert.deepEqual(active.skills, ["rumor"]);
});

test("inside information previews and resolves the exact privately queued event", () => {
  const game = createSurvivalMvpGame({ seed: 353, playerCount: 3 });
  const player = game.players[0];
  player.skills = ["inside-info"];
  const values = [0, 0.1, 0, 0.5];
  const preview = useSkill(game, player.id, "inside-info", {}, () => values.shift() ?? 0);
  const queuedId = player.queuedInsideInfoCard.id;
  assert.equal(preview.nextSectorIndex, player.insideInfo.nextSectorIndex);
  assert.equal(Object.hasOwn(preview, "card"), false);
  applyAction(game, { type: "defend" }, player.id);
  const resolved = resolveDice(game, player.id, 6, () => 0.99);
  assert.equal(resolved.eventCards[0].id, queuedId);
  assert.equal(player.queuedInsideInfoCard, undefined);
  assert.equal(player.insideInfo, null);
});

test("tabloid reveals and applies its extra event immediately", () => {
  const game = createSurvivalMvpGame({ seed: 354, playerCount: 3 });
  const player = game.players[0];
  player.skills = ["tabloid"];
  const before = game.stocks.map((stock) => stock.prices[0]);
  const values = [0.1, 0, 0.5];
  const result = useSkill(game, player.id, "tabloid", {}, () => values.shift() ?? 0);
  assert.ok(result.immediateEvent);
  assert.equal(game.survivalMvp.skillEventResult.card.id, result.immediateEvent.id);
  assert.equal(game.survivalMvp.phase, "action");
  assert.equal(player.skills.includes("tabloid"), false);
  assert.notDeepEqual(game.stocks.map((stock) => stock.prices[0]), before);
  assert.ok(game.logs.some((entry) => entry.card?.id === result.immediateEvent.id));
});

test("human players choose exactly two of three dealt skills before acting", () => {
  const game = createSurvivalMvpGame({ seed: 351, playerCount: 3, requireSkillSelection: true });
  const player = game.players[0];
  assert.equal(player.skillDraft.length, 3);
  assert.equal(player.skillSelectionComplete, false);
  assert.throws(() => applyAction(game, { type: "defend" }, player.id), /스킬카드/);
  toggleSkillDraft(game, player.id, player.skillDraft[0]);
  toggleSkillDraft(game, player.id, player.skillDraft[1]);
  confirmSkillSelection(game, player.id);
  assert.equal(player.skills.length, 2);
  assert.equal(player.skillSelectionComplete, true);
  assert.doesNotThrow(() => applyAction(game, { type: "defend" }, player.id));
});

test("hidden victory conditions are private and checked before ordinary wins", () => {
  const game = createSurvivalMvpGame({ seed: 36, playerCount: 3 });
  const player = game.players[0];
  player.hiddenVictory = "safe-asset-king";
  player.alternativeAssets.gold = 15;
  player.cash = 3_000;
  assert.equal(checkHiddenVictory(game, player)?.reason, "hidden-safe-asset-king");
  assert.equal(checkVictory(game)?.reason, "hidden-safe-asset-king");
});

test("event cards use weighted grades and carry complete event metadata", () => {
  const common = drawEventCard(() => 0.1, 0);
  const disaster = drawEventCard(() => 0.999, 0);
  assert.equal(common.grade, "common");
  assert.equal(disaster.grade, "disaster");
  for (const card of [common, disaster]) {
    assert.equal(typeof card.nameKo, "string");
    assert.equal(typeof card.rate, "number");
    assert.ok(card.target);
  }
});

test("trading halt and fat finger are enforced by the action engine", () => {
  const game = createSurvivalMvpGame({ seed: 37, playerCount: 3 });
  const player = game.players[0];
  player.cash = 10_000;
  game.survivalMvp.haltedStockIndex = 0;
  game.survivalMvp.haltedRound = game.turn;
  assert.throws(() => applyAction(game, { type: "buy", stockIndex: 0, quantity: 1 }, player.id), /거래정지/);
  game.survivalMvp.haltedRound = 0;
  game.survivalMvp.evenQuantityRound = game.turn;
  assert.throws(() => applyAction(game, { type: "buy", stockIndex: 0, quantity: 3 }, player.id), /짝수/);
});

test("short sell settles from the next dice event and is then cleared", () => {
  const game = createSurvivalMvpGame({ seed: 38, playerCount: 3 });
  const player = game.players[0];
  player.skills = ["short-sell"];
  const before = player.cash;
  useSkill(game, player.id, "short-sell", { stockIndex: 0 });
  applyAction(game, { type: "defend" }, player.id);
  resolveDice(game, player.id, 2, () => 0);
  assert.ok(player.cash > before);
  assert.equal(game.survivalMvp.shortPosition, null);
});

test("emergency sale pays 90 percent or 70 percent during a halt", () => {
  const game = createSurvivalMvpGame({ seed: 39, playerCount: 3 });
  const player = game.players[0];
  player.holdings[0] = 2;
  const first = emergencySell(game, player.id, 0, 1);
  assert.equal(first.proceeds, Math.floor(game.stocks[0].prices[0] * 0.9));
  game.survivalMvp.haltedStockIndex = 0;
  game.survivalMvp.haltedRound = game.turn;
  const second = emergencySell(game, player.id, 0, 1);
  assert.equal(second.proceeds, Math.floor(game.stocks[0].prices[0] * 0.7));
});

test("all-in doubles the next relevant sector event", () => {
  const game = createSurvivalMvpGame({ seed: 40, playerCount: 3 });
  const player = game.players[0];
  player.bankruptcyDanger = true;
  const before = game.stocks[0].prices[0];
  applyAction(game, { type: "all-in", stockIndex: 0 }, player.id);
  resolveDice(game, player.id, 4, () => 0);
  assert.equal(game.stocks[0].prices[0], Math.round(before * 1.08));
  assert.equal(game.survivalMvp.allIn, null);
});

test("healthcare shareholder blocks bankruptcy once", () => {
  const game = createSurvivalMvpGame({ seed: 41, playerCount: 3 });
  const player = game.players[0];
  player.holdings[2] = 3;
  player.cash = -400;
  assert.equal(updateBankruptcy(game, player), "rescued");
  assert.equal(player.healthcareRescueUsed, true);
  player.cash = -400;
  assert.equal(updateBankruptcy(game, player), "bankrupt");
});

test("three-round first place streak awards 30 fame money once", () => {
  const game = createSurvivalMvpGame({ seed: 42, playerCount: 3 });
  game.players[0].cash = 900;
  game.players[1].cash = 100;
  game.players[2].cash = 100;
  const before = game.players[0].cash;
  for (let turn = 1; turn <= 3; turn += 1) { game.turn = turn; settleSurvivalRound(game, () => 0.5); }
  assert.equal(game.players[0].cash, before + 29 * 3 + 30);
  assert.ok(game.logs.some((entry) => entry.type === "fame"));
});
