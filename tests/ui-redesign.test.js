import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("main setup has no player count control", async () => {
  const shell = await readFile(`${root}/ui-shell.js`, "utf8");
  assert.doesNotMatch(shell, /solo-player-count|플레이어 인원/);
});

test("all launch flows derive player count from the selected mode", async () => {
  const app = await readFile(`${root}/app.js`, "utf8");
  assert.doesNotMatch(app, /\$\("#solo-player-count"\)/);
  assert.match(app, /return \{ playerCount: mode\.playerCount, difficulty: "hard", totalTurns: mode\.totalTurns \}/);
  assert.match(app, /createSurvivalMvpGame\(\{[\s\S]*?playerCount: mode\.playerCount,[\s\S]*?totalTurns: mode\.totalTurns/);
});

test("the final shared design system is loaded and shipped", async () => {
  const [html, css, build, worker] = await Promise.all([
    readFile(`${root}/index.html`, "utf8"),
    readFile(`${root}/design-system.css`, "utf8"),
    readFile(`${root}/scripts/build.mjs`, "utf8"),
    readFile(`${root}/service-worker.js`, "utf8"),
  ]);
  assert.match(html, /design-system\.css/);
  for (const token of ["--ui-bg", "--ui-surface", "--ui-surface-raised", "--ui-text", "--ui-muted", "--ui-up", "--ui-down", "--ui-gold", "--ui-success"]) {
    assert.match(css, new RegExp(token));
  }
  assert.match(build, /design-system\.css/);
  assert.match(worker, /design-system\.css/);
});
