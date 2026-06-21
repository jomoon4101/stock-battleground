import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
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
  const server = spawn(process.execPath, ["server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port), NODE_ENV: "test", ALLOWED_ORIGINS: "https://example.vercel.app" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  context.after(() => server.kill());
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
  await json(`${base}/api/rooms/${code}/action?token=${guest.token}`, { method: "POST", body: JSON.stringify({ type: "borrow", payload: { amount: 1_000_000 } }) });
  const hostState = await json(`${base}/api/rooms/${code}/state?token=${host.token}`);
  const privateGuest = hostState.game.players.find((player) => player.id === "PLAYER-002");
  assert.equal(Object.hasOwn(privateGuest, "cash"), false);
});

