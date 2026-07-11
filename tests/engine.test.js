import test from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG, GAME_MODES, HOLDING_TAX_RATE, HOLDING_TAX_START_ROUND, HOLDING_TAX_THRESHOLD, RUMOR_IMMUNE_TOP_RANK, SECTOR_DEFINITIONS, STOCK_DIFFICULTIES,
  advanceTurn, applyHoldingTax, borrow, buyBond, buyStock, createGame, currentPrice,
  createRumor, getPlayerSummary, getRanking, placeLimitOrder, sellStock, turnDurationSeconds,
  updateRumorImmunity, useRandomItem, useSpecialItem,
} from "../engine.js";

test("3~6명과 모드별 5·8·11개 섹터 OHLC·거래량 종목을 생성한다", () => {
  const game = createGame({ nickname: "테스터", seed: 42 });
  assert.equal(game.players.length, 5);
  assert.equal(game.stocks.length, 8);
  assert.equal(game.players.filter((player) => !player.isHuman).length, 4);
  assert.equal(game.stocks[0].candles.length, 21);
  assert.equal(game.stocks[0].historyCandles.length, 18);
  assert.ok(game.stocks[0].candles.every((candle) => candle.high >= Math.max(candle.open, candle.close) && candle.low <= Math.min(candle.open, candle.close) && candle.volume > 0));
  assert.ok(game.stocks.every((stock) => stock.icon && stock.sectorKey));
  assert.equal(new Set(game.stocks.map((stock) => stock.sectorKey)).size, game.stocks.length);
  assert.ok(game.stocks.every((stock) => currentPrice(game, game.stocks.indexOf(stock)) === SECTOR_DEFINITIONS.find((sector) => sector.key === stock.sectorKey).startPrice));
  assert.equal(createGame({ playerCount: 3, difficulty: "easy" }).players.length, 3);
  assert.equal(createGame({ playerCount: 1 }).players.length, 3);
  assert.equal(createGame({ playerCount: 99 }).players.length, 6);
  const quickStocks = createGame({ difficulty: "easy" }).stocks;
  const standardStocks = createGame({ difficulty: "normal" }).stocks;
  const longStocks = createGame({ difficulty: "hard" }).stocks;
  assert.equal(quickStocks.length, STOCK_DIFFICULTIES.easy);
  assert.equal(quickStocks.filter((stock) => stock.sectorGroup === "sensitive").length, 3);
  assert.equal(quickStocks.filter((stock) => stock.sectorGroup === "stable").length, 2);
  assert.equal(standardStocks.length, STOCK_DIFFICULTIES.normal);
  assert.equal(standardStocks.filter((stock) => stock.sectorGroup === "sensitive").length, 5);
  assert.equal(standardStocks.filter((stock) => stock.sectorGroup === "stable").length, 3);
  assert.equal(longStocks.length, 11);
});

test("빠른·기본·장기 게임은 10·20·30라운드 제한시간을 사용한다", () => {
  const total = (speed) => Array.from({ length: GAME_MODES[speed].totalTurns }, (_, index) => turnDurationSeconds(index + 1, speed)).reduce((a, b) => a + b, 0);
  assert.equal(total("quick"), 480);
  assert.equal(total("standard"), 1_860);
  assert.equal(total("long"), 3_690);
  assert.equal(turnDurationSeconds(10, "standard"), 120);
  assert.deepEqual([GAME_MODES.quick.playerCount, GAME_MODES.standard.playerCount, GAME_MODES.long.playerCount], [3, 5, 6]);
  assert.deepEqual([GAME_MODES.quick.stockCount, GAME_MODES.standard.stockCount, GAME_MODES.long.stockCount], [5, 8, 11]);
});

test("매수·매도 로그에 종목과 현금 증감액을 기록한다", () => {
  const game = createGame({ seed: 7 });
  const price = currentPrice(game, 0);
  const quantity = Math.max(1, Math.min(3, Math.floor(game.players[0].cash / price)));
  const initialCash = game.players[0].cash;
  buyStock(game, 0, quantity);
  assert.equal(game.players[0].averagePrices[0], price);
  assert.equal(game.logs[0].stockIndex, 0);
  assert.equal(game.logs[0].amountDelta, -(price * quantity));
  sellStock(game, 0, quantity);
  assert.equal(game.logs[0].stockIndex, 0);
  assert.equal(game.logs[0].amountDelta, price * quantity);
  assert.equal(game.players[0].cash, initialCash);
  assert.equal(game.players[0].averagePrices[0], 0);
  assert.throws(() => sellStock(game, 1, 1), /보유 수량이 부족합니다/);
});

test("대출은 선이자 10%를 차감한다", () => {
  const game = createGame({ seed: 8 });
  const before = getPlayerSummary(game).assets;
  const result = borrow(game, 1_000_000);
  assert.equal(result.upfrontInterest, 100_000);
  assert.equal(getPlayerSummary(game).assets, before - 100_000);
});

test("예약 주문은 다음 턴부터 체결된다", () => {
  const game = createGame({ seed: 9 });
  placeLimitOrder(game, { stockIndex: 0, quantity: 1, limitPrice: game.stocks[0].prices[1] + 1, side: "buy" });
  advanceTurn(game);
  assert.equal(game.players[0].holdings[0], 1);
  assert.equal(game.players[0].orders.length, 0);
});

test("채권은 10턴 뒤 만기되고 체크포인트 월급이 지급된다", () => {
  const game = createGame({ seed: 11 });
  buyBond(game, 100_000);
  for (let count = 0; count < 10; count += 1) advanceTurn(game);
  assert.equal(game.turn, 11);
  assert.equal(game.players[0].bonds.length, 0);
  assert.ok(game.logs.some((log) => log.message.includes("채권 만기")));
});

test("특별·랜덤 아이템과 표시 순위를 적용한다", () => {
  const game = createGame({ seed: 12 });
  game.players[0].cash = 20_000_000;
  useSpecialItem(game, "fake-rank", { rank: 1 });
  assert.equal(getRanking(game)[0].playerId, "PLAYER-001");
  const salary = game.players[0].salary;
  const result = useRandomItem(game, "salary-roll");
  assert.equal(result.cost, salary);
});

test("빠른 게임은 10라운드 후 최종 순위를 확정한다", () => {
  const game = createGame({ seed: 14, totalTurns: GAME_MODES.quick.totalTurns, playerCount: GAME_MODES.quick.playerCount, difficulty: GAME_MODES.quick.difficulty });
  for (let count = 0; count < 10; count += 1) advanceTurn(game);
  assert.equal(game.finished, true);
  assert.equal(game.finalRanking.length, 3);
});

test("장기 게임도 최후의 한 명만 남으면 최대 라운드 전에 종료한다", () => {
  const game = createGame({ seed: 15, totalTurns: 30, playerCount: 3 });
  while (!game.finished) advanceTurn(game);
  assert.equal(game.turn, 12);
  assert.equal(game.finalRanking.length, 3);
  assert.equal(getRanking(game, { display: false }).length, 1);
});

test("영어 게임은 종목·봇·시장 데이터를 영어로 생성한다", () => {
  const game = createGame({ nickname: "Ant Trader", seed: 55, language: "en", avatar: { kind: "meme", index: 7 } });
  assert.equal(game.language, "en");
  assert.equal(game.players[0].avatar.index, 7);
  assert.doesNotMatch(game.stocks[0].name, /[가-힣]/);
  assert.doesNotMatch(game.players[1].nickname, /[가-힣]/);
  assert.doesNotMatch(game.stocks[0].market.name, /[가-힣]/);
  assert.equal(game.players.length, 5);
  assert.ok(game.players.every((player) => player.avatar.kind === "meme"));
});

test("11턴부터 최하위 한 명을 탈락시키고 행동을 차단한다", () => {
  const game = createGame({ nickname: "탈락 후보", seed: 88 });
  game.players[0].cash = -10_000_000_000;
  for (let count = 0; count < 10; count += 1) advanceTurn(game);
  assert.equal(game.turn, 11);
  assert.equal(game.players.filter((player) => player.eliminated).length, 1);
  assert.equal(game.players[0].eliminated, true);
  assert.equal(game.players[0].eliminatedTurn, 11);
  assert.ok(game.players[0].performance.length >= 11);
  assert.throws(() => borrow(game, 100_000), /탈락한 플레이어/);
  assert.equal(getRanking(game, { display: false }).length, 4);
});

test("방 시드가 바뀌면 가상 기업 이름이 달라진다", () => {
  const first = createGame({ seed: 501 });
  const second = createGame({ seed: 502 });
  assert.notDeepEqual(first.stocks.map((stock) => stock.name), second.stocks.map((stock) => stock.name));
  assert.equal(new Set(first.stocks.map((stock) => stock.name)).size, first.stocks.length);
});

test("찌라시는 7턴 안의 방향을 섹터·종목과 함께 모호하고 확률적으로 알려준다", () => {
  const game = createGame({ nickname: "정보원", seed: 1204 });
  const rumor = createRumor(game, 1, "PLAYER-001");
  const stock = game.stocks[rumor.stockIndex];
  const actualDirection = stock.prices[rumor.targetTurn - 1] >= stock.prices[0] ? "up" : "down";
  assert.equal(rumor.senderName, "찌라시");
  assert.equal(rumor.endTurn, 8);
  assert.ok(rumor.targetTurn >= 2 && rumor.targetTurn <= 8);
  assert.equal(rumor.isAccurate, rumor.direction === actualDirection);
  assert.match(rumor.text, new RegExp(`\\[${stock.sector}\\]`));
  assert.match(rumor.text, new RegExp(`\\[${stock.name}\\]`));
  assert.doesNotMatch(rumor.text, /\d+%|\d+턴/);
  const accuracySamples = Array.from({ length: 40 }, (_, index) => createRumor(game, 1, `RUMOR-TEST-${index}`).isAccurate);
  assert.deepEqual(new Set(accuracySamples), new Set([true, false]));
});

test("상위 5위 찌라시 면역은 순위 경계를 넘을 때만 상태 변경을 알린다", () => {
  const game = createGame({ nickname: "면역 확인", seed: 707, playerCount: 6 });
  const initial = getRanking(game, { display: false });
  assert.equal(RUMOR_IMMUNE_TOP_RANK, 5);
  initial.forEach((entry) => assert.equal(game.players.find((player) => player.id === entry.playerId).rumorImmune, entry.rank <= 5));

  const human = game.players[0];
  human.cash = -1_000_000_000;
  const dropped = updateRumorImmunity(game);
  assert.deepEqual(dropped.filter((event) => event.playerId === human.id), [{ playerId: human.id, rank: 6, immune: false }]);
  assert.equal(updateRumorImmunity(game).length, 0);

  human.cash = 1_000_000_000;
  const entered = updateRumorImmunity(game);
  assert.deepEqual(entered.filter((event) => event.playerId === human.id), [{ playerId: human.id, rank: 1, immune: true }]);
  assert.equal(updateRumorImmunity(game).length, 0);
});

test("11라운드 보유세는 현금 200만원 이상에 2%를 라운드당 한 번만 적용한다", () => {
  const game = createGame({ nickname: "보유세 확인", seed: 808 });
  const player = game.players[0];
  player.cash = 2_500_000;
  assert.equal(HOLDING_TAX_START_ROUND, 11);
  assert.equal(HOLDING_TAX_THRESHOLD, 2_000_000);
  assert.equal(HOLDING_TAX_RATE, 0.02);
  assert.deepEqual(applyHoldingTax(game, 10), []);

  const first = applyHoldingTax(game, 11).find((event) => event.playerId === player.id);
  assert.equal(first.tax, 50_000);
  assert.equal(first.becameEligible, true);
  assert.equal(player.cash, 2_450_000);
  assert.equal(player.lastHoldingTaxAppliedRound, 11);
  assert.deepEqual(applyHoldingTax(game, 11), []);
  assert.equal(player.cash, 2_450_000);

  player.cash = 1_999_999;
  const exempt = applyHoldingTax(game, 12).find((event) => event.playerId === player.id);
  assert.equal(exempt.becameExempt, true);
  assert.equal(exempt.tax, 0);
  assert.equal(player.holdingTaxEligible, false);
});
