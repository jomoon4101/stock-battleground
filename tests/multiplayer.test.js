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
    env: { ...process.env, PORT: String(port), NODE_ENV: "test", ALLOWED_ORIGINS: "https://example.vercel.app,https://*.vercel.app", DATA_ROOT: dataRoot },
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
  const productionCors = await fetch(`${base}/api/health`, { headers: { Origin: "https://stock-survival.vercel.app" } });
  assert.equal(productionCors.headers.get("access-control-allow-origin"), "https://stock-survival.vercel.app");
  const previewCors = await fetch(`${base}/api/health`, { headers: { Origin: "https://stock-survival-git-fix-example.vercel.app" } });
  assert.equal(previewCors.headers.get("access-control-allow-origin"), "https://stock-survival-git-fix-example.vercel.app");
  const activeEmpty = await fetch(`${base}/api/rooms/active`);
  assert.equal(activeEmpty.status, 200);
  assert.deepEqual((await activeEmpty.json()).rooms, []);
  const activeWithTrailingSlash = await fetch(`${base}/api/rooms/active/`);
  assert.equal(activeWithTrailingSlash.status, 200);
  assert.deepEqual((await activeWithTrailingSlash.json()).rooms, []);
  const matchmakingInfo = await fetch(`${base}/api/matchmaking`);
  assert.equal(matchmakingInfo.status, 200);
  assert.equal((await matchmakingInfo.json()).available, true);
  const invalidMatchmaking = await fetch(`${base}/api/matchmaking`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(invalidMatchmaking.status, 422);
  const reservedRoomPath = await fetch(`${base}/api/rooms/status/state`);
  assert.equal(reservedRoomPath.status, 404);
  assert.equal((await reservedRoomPath.json()).error, "존재하지 않는 API 경로입니다.");
  const quickMode = await json(`${base}/api/rooms`, { method: "POST", body: JSON.stringify({ nickname: "빠른모드", speed: "quick", playerCount: 7, difficulty: "hard" }) });
  assert.equal(quickMode.state.room.capacity, 6);
  assert.equal(quickMode.state.room.difficulty, "easy");
  const longMode = await json(`${base}/api/rooms`, { method: "POST", body: JSON.stringify({ nickname: "장기모드", speed: "long", playerCount: 3, difficulty: "easy" }) });
  assert.equal(longMode.state.room.capacity, 3);
  assert.equal(longMode.state.room.difficulty, "hard");
  const survivalCode = quickMode.state.room.code;
  const survivalStarted = await json(`${base}/api/rooms/${survivalCode}/start?token=${quickMode.token}`, { method: "POST", body: "{}" });
  assert.equal(survivalStarted.game.stocks.length, 11);
  assert.equal(survivalStarted.game.survivalMvp.phase, "action");
  assert.equal(survivalStarted.game.players[0].skillDraft.length, 3);
  assert.equal(survivalStarted.game.players[0].skills.length, 0);
  assert.equal(Object.hasOwn(survivalStarted.game.players[1], "skills"), false);
  assert.equal(Object.hasOwn(survivalStarted.game.players[0], "queuedInsideInfoCard"), false);
  const draftIds = survivalStarted.game.players[0].skillDraft.slice(0, 2);
  await json(`${base}/api/rooms/${survivalCode}/action?token=${quickMode.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-skill-draft", payload: { skillId: draftIds[0] } }) });
  await json(`${base}/api/rooms/${survivalCode}/action?token=${quickMode.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-skill-draft", payload: { skillId: draftIds[1] } }) });
  await json(`${base}/api/rooms/${survivalCode}/action?token=${quickMode.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-skill-confirm", payload: {} }) });
  const assetAction = await json(`${base}/api/rooms/${survivalCode}/action?token=${quickMode.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-asset", payload: { side: "buy", assetKey: "gold", quantity: 1 } }) });
  assert.equal(assetAction.result.assetKey, "gold");
  const afterAssetAction = await json(`${base}/api/rooms/${survivalCode}/state?token=${quickMode.token}`);
  assert.equal(afterAssetAction.game.survivalMvp.phase, "dice");
  const rolled = await json(`${base}/api/rooms/${survivalCode}/action?token=${quickMode.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-progress", payload: {} }) });
  assert.equal(rolled.result.roll >= 1 && rolled.result.roll <= 6, true);
  await json(`${base}/api/rooms/${survivalCode}/action?token=${quickMode.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-progress", payload: {} }) });
  const nextSurvival = await json(`${base}/api/rooms/${survivalCode}/state?token=${quickMode.token}`);
  assert.equal(nextSurvival.game.turn, 2);
  assert.equal(nextSurvival.game.survivalMvp.activePlayerId, "PLAYER-001");
  await json(`${base}/api/rooms/${survivalCode}/leave?token=${quickMode.token}`, { method: "POST", body: "{}" });
  const duelHost = await json(`${base}/api/rooms`, { method: "POST", body: JSON.stringify({ nickname: "순차호스트", speed: "quick" }) });
  const duelCode = duelHost.state.room.code;
  const duelGuest = await json(`${base}/api/rooms/${duelCode}/join`, { method: "POST", body: JSON.stringify({ nickname: "순차게스트" }) });
  await json(`${base}/api/rooms/${duelCode}/start?token=${duelHost.token}`, { method: "POST", body: "{}" });
  const duelHostState = await json(`${base}/api/rooms/${duelCode}/state?token=${duelHost.token}`);
  for (const skillId of duelHostState.game.players[0].skillDraft.slice(0, 2)) await json(`${base}/api/rooms/${duelCode}/action?token=${duelHost.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-skill-draft", payload: { skillId } }) });
  await json(`${base}/api/rooms/${duelCode}/action?token=${duelHost.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-skill-confirm", payload: {} }) });
  await json(`${base}/api/rooms/${duelCode}/action?token=${duelHost.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-action", payload: { type: "defend" } }) });
  await json(`${base}/api/rooms/${duelCode}/action?token=${duelHost.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-progress", payload: {} }) });
  await json(`${base}/api/rooms/${duelCode}/action?token=${duelHost.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-progress", payload: {} }) });
  const guestTurn = await json(`${base}/api/rooms/${duelCode}/state?token=${duelGuest.token}`);
  assert.equal(guestTurn.game.survivalMvp.activePlayerId, "PLAYER-002");
  assert.equal(guestTurn.game.survivalMvp.phase, "action");
  await assert.rejects(
    json(`${base}/api/rooms/${duelCode}/action?token=${duelHost.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-skill", payload: { skillId: duelHostState.game.players[0].skillDraft[0], options: { stockIndex: 0, targetPlayerId: "PLAYER-002" } } }) }),
    /현재 내 턴/,
  );
  for (const skillId of guestTurn.game.players[1].skillDraft.slice(0, 2)) await json(`${base}/api/rooms/${duelCode}/action?token=${duelGuest.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-skill-draft", payload: { skillId } }) });
  await json(`${base}/api/rooms/${duelCode}/action?token=${duelGuest.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-skill-confirm", payload: {} }) });
  await json(`${base}/api/rooms/${duelCode}/action?token=${duelGuest.token}`, { method: "POST", body: JSON.stringify({ type: "mvp-action", payload: { type: "defend" } }) });
  await json(`${base}/api/rooms/${duelCode}/leave?token=${duelGuest.token}`, { method: "POST", body: "{}" });
  await json(`${base}/api/rooms/${duelCode}/leave?token=${duelHost.token}`, { method: "POST", body: "{}" });
  const host = await json(`${base}/api/rooms`, { method: "POST", body: JSON.stringify({ nickname: "방장", speed: "test", playerCount: 3, difficulty: "easy" }) });
  const code = host.state.room.code;
  assert.deepEqual((await json(`${base}/api/rooms/active`)).rooms, []);
  const guest = await json(`${base}/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ nickname: "참가자" }) });
  const started = await json(`${base}/api/rooms/${code}/start?token=${host.token}`, { method: "POST", body: "{}" });
  assert.equal(started.room.memberCount, 2);
  assert.equal(started.room.capacity, 3);
  assert.equal(started.game.players.length, 3);
  assert.equal(started.game.stocks.length, 5);
  assert.equal(started.game.stocks[0].prices[1], null);
  assert.equal(started.game.messages.some((message) => message.fromId === "RUMOR" && message.toId === "PLAYER-001"), true);
  const active = (await json(`${base}/api/rooms/active`)).rooms;
  assert.equal(active.length, 1);
  assert.equal(active[0].code, code);
  assert.equal(active[0].status, "running");
  assert.equal(active[0].participantCount, 2);
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
  await json(`${base}/api/rooms/${code}/action?token=${guest.token}`, { method: "POST", body: JSON.stringify({ type: "send-global-message", payload: { text: "모두 안녕" } }) });
  const globalForHost = await json(`${base}/api/rooms/${code}/state?token=${host.token}`);
  const globalForLate = await json(`${base}/api/rooms/${code}/state?token=${late.token}`);
  assert.ok(globalForHost.game.messages.some((message) => message.system === "global" && message.text === "모두 안녕"));
  assert.ok(globalForLate.game.messages.some((message) => message.toId === "ALL" && message.fromName === "참가자"));
  await json(`${base}/api/rooms/${code}/action?token=${guest.token}`, { method: "POST", body: JSON.stringify({ type: "send-message", payload: { targetId: "PLAYER-001", text: "hello" } }) });
  const withMessage = await json(`${base}/api/rooms/${code}/state?token=${host.token}`);
  assert.equal(withMessage.game.unreadMessages, 2);
  assert.equal(withMessage.game.messages.at(-1).text, "hello");
  await json(`${base}/api/rooms/${code}/action?token=${host.token}`, { method: "POST", body: JSON.stringify({ type: "end-turn" }) });
  const waiting = await json(`${base}/api/rooms/${code}/state?token=${host.token}`);
  assert.equal(waiting.room.turnEnded, true);
  await json(`${base}/api/rooms/${code}/action?token=${guest.token}`, { method: "POST", body: JSON.stringify({ type: "end-turn" }) });
  await json(`${base}/api/rooms/${code}/action?token=${late.token}`, { method: "POST", body: JSON.stringify({ type: "end-turn" }) });
  const advanced = await json(`${base}/api/rooms/${code}/state?token=${host.token}`);
  assert.equal(advanced.game.turn, 2);
  assert.equal(advanced.room.turnEnded, false);
  assert.equal(advanced.game.messages.filter((message) => message.system === "rumor").length, 2);
  await new Promise((resolve) => setTimeout(resolve, 1_600));
  const timedAdvance = await json(`${base}/api/rooms/${code}/state?token=${host.token}`);
  assert.ok(timedAdvance.game.turn >= 3);
  const board = await json(`${base}/api/board`, { method: "POST", body: JSON.stringify({ text: "테스트 의견" }) });
  assert.equal(board.post.text, "테스트 의견");
  const boardList = await json(`${base}/api/board`);
  assert.equal(boardList.posts[0].text, "테스트 의견");
});

test("순위와 관계없이 모든 일반 플레이어가 첫 턴 찌라시를 받는다", { timeout: 12_000 }, async (context) => {
  const port = 46_000 + Math.floor(Math.random() * 600);
  const dataRoot = await mkdtemp(join(tmpdir(), "stock-bg-test-"));
  const server = spawn(process.execPath, ["server.mjs"], { cwd: root, env: { ...process.env, PORT: String(port), NODE_ENV: "test", DATA_ROOT: dataRoot }, stdio: ["ignore", "pipe", "pipe"] });
  context.after(async () => { server.kill(); await rm(dataRoot, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server start timeout")), 5_000);
    server.stdout.once("data", () => { clearTimeout(timeout); resolve(); });
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${port}`;
  const members = [await json(`${base}/api/rooms`, { method: "POST", body: JSON.stringify({ nickname: "면역1", speed: "test" }) })];
  const code = members[0].state.room.code;
  for (let index = 2; index <= 6; index += 1) {
    members.push(await json(`${base}/api/rooms/${code}/join`, { method: "POST", body: JSON.stringify({ nickname: `면역${index}` }) }));
  }
  await json(`${base}/api/rooms/${code}/start?token=${members[0].token}`, { method: "POST", body: "{}" });
  for (let index = 0; index < members.length; index += 1) {
    const state = await json(`${base}/api/rooms/${code}/state?token=${members[index].token}`);
    assert.equal(state.game.messages.filter((message) => message.system === "rumor").length, 1);
  }
  assert.deepEqual((await json(`${base}/api/rooms/active`)).rooms, []);
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
  assert.equal(started.game.players.length, 6);
  assert.equal(started.game.players.filter((player) => player.isHuman).length, 2);
  assert.equal(started.game.players[0].avatar.index, 2);
  assert.equal(started.game.players[1].avatar.index, 4);
});

test("수동 턴 종료로 15턴 월급 알림과 매 턴 탈락 알림을 모든 참가자에게 전송한다", { timeout: 8_000 }, async (context) => {
  const port = 45_000 + Math.floor(Math.random() * 800);
  const dataRoot = await mkdtemp(join(tmpdir(), "stock-bg-test-"));
  const server = spawn(process.execPath, ["server.mjs"], { cwd: root, env: { ...process.env, PORT: String(port), NODE_ENV: "test", DATA_ROOT: dataRoot }, stdio: ["ignore", "pipe", "pipe"] });
  context.after(async () => { server.kill(); await rm(dataRoot, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("server start timeout")), 5_000);
    server.stdout.once("data", () => { clearTimeout(timeout); resolve(); });
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${port}`;
  const host = await json(`${base}/api/rooms`, { method: "POST", body: JSON.stringify({ nickname: "알림확인", speed: "test", language: "ko" }) });
  const participants = [host];
  for (let index = 2; index <= 6; index += 1) {
    participants.push(await json(`${base}/api/rooms/${host.state.room.code}/join`, { method: "POST", body: JSON.stringify({ nickname: `턴제참가${index}` }) }));
  }
  await json(`${base}/api/rooms/${host.state.room.code}/start?token=${host.token}`, { method: "POST", body: "{}" });
  await json(`${base}/api/rooms/${host.state.room.code}/action?token=${host.token}`, { method: "POST", body: JSON.stringify({ type: "borrow", payload: { amount: 3_000_000 } }) });
  let state = await json(`${base}/api/rooms/${host.state.room.code}/state?token=${host.token}`);
  while (!state.game.finished && state.game.turn < 15) {
    for (const participant of participants) {
      const playerId = participant.state.viewer.playerId;
      if (state.game.players.find((player) => player.id === playerId)?.eliminated) continue;
      await json(`${base}/api/rooms/${host.state.room.code}/action?token=${participant.token}`, { method: "POST", body: JSON.stringify({ type: "end-turn" }) });
    }
    state = await json(`${base}/api/rooms/${host.state.room.code}/state?token=${host.token}`);
  }
  assert.ok(state.game.turn >= 15);
  assert.ok(state.game.notices.some((notice) => notice.type === "salary-reminder" && notice.text === "월급날까지 5턴 남았습니다."));
  assert.ok(state.game.notices.some((notice) => notice.type === "elimination" && notice.text.includes("깡통을 찼습니다.")));
  assert.ok(state.game.notices.some((notice) => notice.type === "holding-tax-eligible"));
  assert.ok(state.game.notices.some((notice) => notice.type === "holding-tax" && notice.text.includes("보유세 적용")));
  const taxRounds = state.game.notices.filter((notice) => notice.type === "holding-tax").map((notice) => notice.turn);
  assert.equal(new Set(taxRounds).size, taxRounds.length);
  assert.deepEqual((await json(`${base}/api/rooms/active`)).rooms, []);
});
