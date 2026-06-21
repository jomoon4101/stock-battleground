import test from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG, advanceTurn, borrow, buyBond, buyStock, createGame, currentPrice,
  getPlayerSummary, getRanking, placeLimitOrder, sellStock, turnDurationSeconds,
  useRandomItem, useSpecialItem,
} from "../engine.js";

test("100명 플레이어, 30개 OHLC·거래량 종목을 생성한다", () => {
  const game = createGame({ nickname: "테스터", seed: 42 });
  assert.equal(game.players.length, 100);
  assert.equal(game.stocks.length, 30);
  assert.equal(game.players.filter((player) => !player.isHuman).length, 99);
  assert.equal(game.stocks[0].candles.length, 41);
  assert.equal(game.stocks[0].historyCandles.length, 18);
  assert.ok(game.stocks[0].candles.every((candle) => candle.high >= Math.max(candle.open, candle.close) && candle.low <= Math.min(candle.open, candle.close) && candle.volume > 0));
});

test("게임 속도 합계가 약 18분·45분·100분이다", () => {
  const total = (speed) => Array.from({ length: 40 }, (_, index) => turnDurationSeconds(index + 1, speed)).reduce((a, b) => a + b, 0);
  assert.equal(total("turbo"), 1_056);
  assert.equal(total("fast"), 2_700);
  assert.equal(total("standard"), 6_000);
  assert.equal(turnDurationSeconds(10, "standard"), 420);
});

test("매수·매도 로그에 종목과 현금 증감액을 기록한다", () => {
  const game = createGame({ seed: 7 });
  const price = currentPrice(game, 0);
  const quantity = Math.max(1, Math.min(3, Math.floor(game.players[0].cash / price)));
  const initialCash = game.players[0].cash;
  buyStock(game, 0, quantity);
  assert.equal(game.logs[0].stockIndex, 0);
  assert.equal(game.logs[0].amountDelta, -(price * quantity));
  sellStock(game, 0, quantity);
  assert.equal(game.logs[0].stockIndex, 0);
  assert.equal(game.logs[0].amountDelta, price * quantity);
  assert.equal(game.players[0].cash, initialCash);
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

test("40턴 후 최종 순위를 확정한다", () => {
  const game = createGame({ seed: 14 });
  for (let count = 0; count < 40; count += 1) advanceTurn(game);
  assert.equal(game.finished, true);
  assert.equal(game.finalRanking.length, 100);
});

