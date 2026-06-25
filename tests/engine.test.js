import test from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG, advanceTurn, borrow, buyBond, buyStock, createGame, currentPrice,
  createRumor, getPlayerSummary, getRanking, placeLimitOrder, sellStock, turnDurationSeconds,
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

test("영어 게임은 종목·봇·시장 데이터를 영어로 생성한다", () => {
  const game = createGame({ nickname: "Ant Trader", seed: 55, language: "en", avatar: { kind: "meme", index: 7 } });
  assert.equal(game.language, "en");
  assert.equal(game.players[0].avatar.index, 7);
  assert.doesNotMatch(game.stocks[0].name, /[가-힣]/);
  assert.doesNotMatch(game.players[1].nickname, /[가-힣]/);
  assert.doesNotMatch(game.stocks[0].market.name, /[가-힣]/);
  assert.equal(game.players.length, 100);
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
  assert.equal(getRanking(game, { display: false }).length, 99);
});

test("찌라시는 7턴 안의 실제 방향을 나라·종목과 함께 모호하게 알려준다", () => {
  const game = createGame({ nickname: "정보원", seed: 1204 });
  const rumor = createRumor(game, 1, "PLAYER-001");
  const stock = game.stocks[rumor.stockIndex];
  const actualDirection = stock.prices[rumor.targetTurn - 1] >= stock.prices[0] ? "up" : "down";
  assert.equal(rumor.senderName, "찌라시");
  assert.equal(rumor.endTurn, 8);
  assert.ok(rumor.targetTurn >= 2 && rumor.targetTurn <= 8);
  assert.equal(rumor.direction, actualDirection);
  assert.match(rumor.text, new RegExp(`\\[${stock.market.name}\\]`));
  assert.match(rumor.text, new RegExp(`\\[${stock.name}\\]`));
  assert.doesNotMatch(rumor.text, /\d+%|\d+턴/);
});
