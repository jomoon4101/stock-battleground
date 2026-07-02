import test from "node:test";
import assert from "node:assert/strict";
import { createAiChatLine, createAiConversationPlan } from "../ai-chat.js";

function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

const game = {
  language: "ko",
  turn: 1,
  stocks: [
    { name: "테스트 테크", sector: "정보기술", prices: [100, 115, 108] },
    { name: "테스트 에너지", sector: "에너지", prices: [100, 88, 92] },
  ],
};

const bots = [
  { id: "BOT-001", nickname: "단타개미", holdings: [3, 0] },
  { id: "BOT-002", nickname: "물타기여우", holdings: [0, 4] },
  { id: "BOT-003", nickname: "존버곰", holdings: [1, 1] },
];

test("AI 채팅은 실제 다음 방향과 반대인 거짓 정보를 확률적으로 만들 수 있다", () => {
  const sequence = [0, 0.9, 0, 0];
  let index = 0;
  const line = createAiChatLine(game, { ...bots[0], holdings: [0, 0] }, { random: () => sequence[index++] ?? 0 });
  assert.equal(line.stockIndex, 0);
  assert.equal(line.truthful, false);
  assert.equal(line.claimedRise, false);
  assert.match(line.text, /테스트 테크/);
});

test("AI 여러 명이 앞 대화를 받아 서로 다른 문장으로 대화를 이어간다", () => {
  const plan = createAiConversationPlan(game, bots, {
    count: 4,
    triggerMessage: "테스트 테크 어때?",
    triggerName: "사람플레이어",
    random: seededRandom(42),
  });
  assert.equal(plan.length, 4);
  assert.ok(new Set(plan.map((entry) => entry.speaker.id)).size >= 2);
  assert.equal(new Set(plan.map((entry) => entry.text)).size, 4);
  assert.ok(plan.every((entry) => Number.isInteger(entry.stockIndex)));
});
