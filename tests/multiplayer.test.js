import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
async function json(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error);
  return payload;
}

test("두 사용자가 서버 권한 게임과 비공개 포트폴리오를 공유한다", { timeout: 12_000 }, async (context) => {
  const port = 43_000 + Math.floor(Math.random() * 1_000);
  const dataRoot = await mkdtemp(join(tmpdir(), "stock-bg-test-"));
  const server = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NODE_ENV: "test", ALLOWED_ORIGINS: "https://example.vercel.app", DATA_ROOT: dataRoot },
    stdio: ["ignore", "pipe", "pipe"],
  });
  context.after(async () => { server.kill(); await rm(dataRoot, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server start timeout")), 5_000);
    server.stdout.once("data", () => { clearTimeout(timeout); resolve(); });
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${port}`;
  const health = await fetch(`${base}/api/health`, { headers: { Origin: "https://example.vercel.app" } });
  assert.equal(health.headers.get("access-control-allow-origin"), "https://example.vercel.app");
  const host = await json(`${base}/api/rooms`, { method: "POST", body: JSON.stringify({ nickname: "방장", speed: "test" }) });
  const code = host.state.room.code;
  const guest = await json(`${base}/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ nickname: "참가자" }) });
  const started = await json(`${base}/api/rooms/${code}/start?token=${host.token}`, { method: "POST", body: "{}" });
  assert.equal(started.room.memberCount, 2);
  assert.equal(started.game.stocks[0].prices[1], null);
  assert.equal(started.game.messages.some((message) => message.fromId === "RUMOR" && message.toId === "PLAYER-001"), true);
  const late = await json(`${base}/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ nickname: "중도참가자", avatar: { kind: "meme", index: 6 } }) });
  assert.equal(late.state.room.status, "running");
  assert.equal(late.state.viewer.playerId, "PLAYER-003");
  assert.equal(late.state.game.players.find((player) => player.id === "PLAYER-003").isHuman, true);
  await json(`${base}/api/rooms/${code}/action?token=${guest.token}`, { method: "POST", body: JSON.stringify({ type: "borrow", payload: { amount: 1_000_000 } }) });
  const hostState = await json(`${base}/api/rooms/${code}/state?token=${host.token}`);
  const privateGuest = hostState.game.players.find((player) => player.id === "PLAYER-002");
  assert.equal(Object.hasOwn(privateGuest, "cash"), false);
  assert.equal(hostState.game.players.filter((player) => player.isHuman).length, 3);
  assert.ok(hostState.game.actualRanking.every((entry) => Array.isArray(entry.portfolio)));
  await json(`${base}/api/rooms/${code}/action?token=${guest.token}`, { method: "POST", body: JSON.stringify({ type: "send-message", payload: { targetId: "PLAYER-001", text: "hello" } }) });
  const withMessage = await json(`${base}/api/rooms/${code}/state?token=${host.token}`);
  assert.equal(withMessage.game.unreadMessages, 2);
  assert.equal(withMessage.game.messages.at(-1).text, "hello");
  const board = await json(`${base}/api/board`, { method: "POST", body: JSON.stringify({ text: "테스트 의견" }) });
  assert.equal(board.post.text, "테스트 의견");
  const boardList = await json(`${base}/api/board`);
  assert.equal(boardList.posts[0].text, "테스트 의견");
});

test("5초 자동 매칭은 같은 언어·속도 사용자를 합치고 AI로 나머지를 채운다", { timeout: 12_000 }, async (context) => {
  const port = 44_000 + Math.floor(Math.random() * 1_000);
  const dataRoot = await mkdtemp(join(tmpdir(), "stock-bg-test-"));
  const server = spawn(process.execPath, ["server.mjs"], { cwd: root, env: { ...process.env, PORT: String(port), NODE_ENV: "test", DATA_ROOT: dataRoot }, stdio: ["ignore", "pipe", "pipe"] });
  context.after(async () => { server.kill(); await rm(dataRoot, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server start timeout")), 5_000);
    server.stdout.once("data", () => { clearTimeout(timeout); resolve(); });
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${port}`;
  const first = await json(`${base}/api/matchmaking`, { method: "POST", body: JSON.stringify({ nickname: "Alpha", speed: "test", language: "en", avatar: { kind: "meme", index: 2 } }) });
  const second = await json(`${base}/api/matchmaking`, { method: "POST", body: JSON.stringify({ nickname: "Beta", speed: "test", language: "en", avatar: { kind: "meme", index: 4 } }) });
  assert.equal(first.state.room.code, second.state.room.code);
  assert.equal(second.state.room.memberCount, 2);
  await new Promise((resolve) => setTimeout(resolve, 5_350));
  const started = await json(`${base}/api/rooms/${first.state.room.code}/state?token=${first.token}`);
  assert.equal(started.room.status, "running");
  assert.equal(started.room.language, "en");
  assert.equal(started.game.players.length, 30);
  assert.equal(started.game.players.filter((player) => player.isHuman).length, 2);
  assert.equal(started.game.players[0].avatar.index, 2);
  assert.equal(started.game.players[1].avatar.index, 4);
});

test("15턴 월급 알림과 매 턴 탈락 알림을 모든 참가자에게 전송한다", { timeout: 8_000 }, async (context) => {
  const port = 45_000 + Math.floor(Math.random() * 800);
  const dataRoot = await mkdtemp(join(tmpdir(), "stock-bg-test-"));
  const server = spawn(process.execPath, ["server.mjs"], { cwd: root, env: { ...process.env, PORT: String(port), NODE_ENV: "test", TEST_TURN_MS: "30", DATA_ROOT: dataRoot }, stdio: ["ignore", "pipe", "pipe"] });
  context.after(async () => { server.kill(); await rm(dataRoot, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server start timeout")), 5_000);
    server.stdout.once("data", () => { clearTimeout(timeout); resolve(); });
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${port}`;
  const host = await json(`${base}/api/rooms`, { method: "POST", body: JSON.stringify({ nickname: "알림확인", speed: "test", language: "ko" }) });
  await json(`${base}/api/rooms/${host.state.room.code}/start?token=${host.token}`, { method: "POST", body: "{}" });
  await new Promise((resolve) => setTimeout(resolve, 560));
  const state = await json(`${base}/api/rooms/${host.state.room.code}/state?token=${host.token}`);
  assert.ok(state.game.turn >= 15);
  assert.ok(state.game.notices.some((notice) => notice.type === "salary-reminder" && notice.text === "월급날까지 5턴 남았습니다."));
  assert.ok(state.game.notices.some((notice) => notice.type === "elimination" && notice.text.includes("깡통을 찼습니다.")));
});
