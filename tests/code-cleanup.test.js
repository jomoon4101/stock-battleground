import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("removed compatibility paths and deleted UI styles do not return", async () => {
  const [app, server, logic, css] = await Promise.all([
    readFile(`${root}/app.js`, "utf8"),
    readFile(`${root}/server.mjs`, "utf8"),
    readFile(`${root}/survival-mvp/game-logic.js`, "utf8"),
    readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  assert.doesNotMatch(app, /\bcreateGame\b|\bnextPrice\b/);
  assert.doesNotMatch(server, /case "mvp-asset"/);
  assert.doesNotMatch(logic, /extraEventCount/);
  assert.doesNotMatch(css, /\.solo-player-count/);
});

test("core completed boundaries have readable Korean guide comments", async () => {
  const files = await Promise.all([
    "app.js", "server.mjs", "survival-mvp/event-effects.js",
    "survival-mvp/game-logic.js", "survival-mvp/skills.js",
  ].map((file) => readFile(`${root}/${file}`, "utf8")));
  for (const source of files) assert.match(source, /\/\/ \[완료\]/);
});
