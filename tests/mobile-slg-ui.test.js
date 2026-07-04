import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("mobile SLG shell exposes the five real battle tabs", async () => {
  const [html, uiState, uiShell] = await Promise.all([
    readFile(`${root}/index.html`, "utf8"),
    readFile(`${root}/ui-state.js`, "utf8"),
    readFile(`${root}/ui-shell.js`, "utf8"),
  ]);

  assert.match(html, /id="stock-survival-root"/);
  for (const tab of ["home", "market", "trade", "survivors", "logs"]) {
    assert.match(uiShell, new RegExp(`data-app-tab=["']${tab}["']`));
    assert.match(uiShell, new RegExp(`data-tab-panel=["']${tab}["']`));
  }
  assert.match(uiState, /aria-current/);
  assert.match(uiState, /hidden = panel\.dataset\.tabPanel !== activeTab/);
});

test("battle HUD, action bar, compact chat and image fallback contracts exist", async () => {
  const [uiShell, mobileCss] = await Promise.all([
    readFile(`${root}/ui-shell.js`, "utf8"),
    readFile(`${root}/mobile-first.css`, "utf8"),
  ]);

  for (const id of ["battle-hud", "end-turn-button", "open-trade-button", "global-chat-toggle", "global-chat-sheet"]) {
    assert.match(uiShell, new RegExp(`id=["']${id}["']`));
  }
  assert.match(mobileCss, /max-width:\s*480px/);
  assert.match(mobileCss, /width:\s*44px;[\s\S]*height:\s*44px/);
  assert.match(mobileCss, /sector-art-fallback/);
  assert.match(mobileCss, /env\(safe-area-inset-bottom\)/);
});
