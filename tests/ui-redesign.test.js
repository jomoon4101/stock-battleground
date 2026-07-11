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

