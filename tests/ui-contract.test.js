import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("앱이 참조하는 정적 ID가 HTML에 존재한다", async () => {
  const [html, app] = await Promise.all([readFile(`${root}/index.html`, "utf8"), readFile(`${root}/app.js`, "utf8")]);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const dynamic = new Set(["item-stock", "item-target", "item-rank"]);
  const used = new Set([...app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]));
  assert.deepEqual([...used].filter((id) => !ids.has(id) && !dynamic.has(id)), []);
});

test("고지문·체크포인트 카운트다운·종목 바로가기 계약이 존재한다", async () => {
  const [html, app] = await Promise.all([readFile(`${root}/index.html`, "utf8"), readFile(`${root}/app.js`, "utf8")]);
  assert.match(html, /본 서비스는 가상 주식 시뮬레이션 게임이며/);
  assert.match(app, /game\?\.turn % 10 === 0/);
  assert.match(app, /data-log-stock/);
  assert.match(app, /data-rank-stock/);
  assert.match(app, /amount > 0 \? "increase" : "decrease"/);
});

test("언어·프로필·쪽지·명예의 전당·탈락 UI와 밈 스프라이트가 존재한다", async () => {
  const [html, app, i18n, avatar] = await Promise.all([
    readFile(`${root}/index.html`, "utf8"), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/i18n.js`, "utf8"), readFile(`${root}/assets/stock-meme-avatars.png`),
  ]);
  for (const id of ["language-choice", "profile-picker", "profile-upload", "mailbox-button", "message-modal", "hall-of-fame-list", "developer-board-button", "elimination-modal", "matchmaking-screen"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /Array\.from\(\{ length: 10 \}/);
  assert.match(app, /data-message-player/);
  assert.match(app, /drawHistoryChart/);
  assert.match(i18n, /START GAME/);
  assert.ok(avatar.length > 100_000);
});

test("대화형 쪽지함·거래량 신호·달러 환산·게임 알림 계약이 존재한다", async () => {
  const [html, app, server] = await Promise.all([readFile(`${root}/index.html`, "utf8"), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/server.mjs`, "utf8")]);
  for (const id of ["message-new", "message-recipient-panel", "message-recipient-search", "message-recipient-list", "volume-alert"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /const USD_KRW_RATE = 1_500/);
  assert.match(app, /conversationIds/);
  assert.match(app, /volumeSignal/);
  assert.match(server, /\[11, 21, 31\]/);
  assert.match(server, /\[15, 25, 35\]/);
  assert.match(server, /깡통을 찼습니다/);
  assert.match(server, /\["waiting", "running"\]/);
});
