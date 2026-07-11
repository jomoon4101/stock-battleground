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

test("all scenes are covered by the responsive design layer", async () => {
  const css = await readFile(`${root}/design-system.css`, "utf8");
  for (const selector of [
    ".start-screen",
    ".matchmaking-screen",
    ".lobby-screen",
    ".app-shell",
    ".battle-hud",
    ".game-bottom-nav",
    ".panel",
    ".modal-backdrop",
    ".sheet-card",
    ".result-card",
    ".elimination-card",
    ".toast",
  ]) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(css, new RegExp(escaped));
  }
  assert.match(css, /@media\s*\(min-width:\s*768px\)/);
  assert.match(css, /@media\s*\(min-width:\s*1180px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("financial text and controls have mobile readability safeguards", async () => {
  const css = await readFile(`${root}/design-system.css`, "utf8");
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /font-variant-numeric:\s*tabular-nums/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /padding-bottom:\s*calc\([^;]*safe-area-inset-bottom/);
  assert.match(css, /min-width:\s*0/);
});

test("redesigned shell copy has exact English localization", async () => {
  const i18n = await readFile(`${root}/i18n.js`, "utf8");
  for (const copy of [
    "3명 · 10라운드 · 11섹터",
    "5명 · 20라운드 · 11섹터",
    "6명 · 30라운드 · 11섹터",
    "빠른 매칭",
    "함께 생존할 플레이어를 찾는 중",
    "친구 방",
    "게임 준비",
    "내 포트폴리오",
    "생존 정보",
  ]) {
    assert.match(i18n, new RegExp(`"${copy}"\\s*:`));
  }
});

test("mobile fixed navigation resets legacy centering transforms", async () => {
  const css = await readFile(`${root}/design-system.css`, "utf8");
  assert.match(css, /\.game-bottom-nav\s*\{[\s\S]*?left:\s*0;[\s\S]*?right:\s*0;[\s\S]*?transform:\s*none;/);
  assert.match(css, /\.turn-action-bar\s*\{[\s\S]*?left:\s*var\(--ui-space-3\);[\s\S]*?right:\s*var\(--ui-space-3\);[\s\S]*?transform:\s*none;/);
});

test("turn detail panel stays in document flow instead of covering tab content", async () => {
  const css = await readFile(`${root}/design-system.css`, "utf8");
  assert.match(css, /\.battle-arena-panel\s*\{[\s\S]*?position:\s*relative;[\s\S]*?inset:\s*auto;[\s\S]*?transform:\s*none;/);
});

test("sector cards override the old light infographic surface", async () => {
  const css = await readFile(`${root}/design-system.css`, "utf8");
  assert.match(css, /\.stock-row\.sector-card\s*\{[\s\S]*?padding:\s*0;[\s\S]*?background:\s*#0a111d;/);
  assert.match(css, /\.stock-row\.sector-card\s*>\s*\.sector-ceo\s*\{[\s\S]*?z-index:\s*-2;/);
});

test("desktop breakpoint releases the legacy 480px app root", async () => {
  const css = await readFile(`${root}/design-system.css`, "utf8");
  assert.match(css, /@media\s*\(min-width:\s*1180px\)\s*\{[\s\S]*?#stock-survival-root\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none;[\s\S]*?margin:\s*0;/);
});

test("desktop action bar is centered inside the content area beside the rail", async () => {
  const css = await readFile(`${root}/design-system.css`, "utf8");
  assert.match(css, /@media\s*\(min-width:\s*1180px\)[\s\S]*?\.turn-action-bar\s*\{[\s\S]*?left:\s*calc\(50% \+ 52px\);/);
  assert.doesNotMatch(css, /left:\s*calc\(104px \+ 50%\)/);
});
