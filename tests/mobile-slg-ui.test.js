import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const optionalModuleSources = new Set(["ui-shell.js", "ui-state.js"]);

async function readSource(name) {
  try {
    return await readFile(`${root}/${name}`, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT" && optionalModuleSources.has(name)) return "";
    throw error;
  }
}

test("mobile SLG shell exposes the five real battle tabs", async () => {
  const [html, uiState, uiShell] = await Promise.all([
    readFile(`${root}/index.html`, "utf8"),
    readSource("ui-state.js"),
    readSource("ui-shell.js"),
  ]);

  assert.match(html, /id="stock-survival-root"/);
  for (const tab of ["home", "market", "trade", "survivors", "logs"]) {
    assert.match(uiShell, new RegExp(`data-app-tab=["']${tab}["']`));
    assert.match(uiShell, new RegExp(`data-tab-panel=["']${tab}["']`));
  }
  const appTabs = [...uiShell.matchAll(/\bdata-app-tab=["']([^"']+)["']/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(appTabs)].sort(), ["home", "logs", "market", "survivors", "trade"]);
  assert.match(uiState, /aria-current/);
  assert.match(uiState, /hidden = panel\.dataset\.tabPanel !== activeTab/);
});

test("battle HUD, action bar, compact chat and image fallback contracts exist", async () => {
  const [uiShell, mobileCss] = await Promise.all([
    readSource("ui-shell.js"),
    readFile(`${root}/mobile-first.css`, "utf8"),
  ]);

  for (const id of ["battle-hud", "end-turn-button", "open-trade-button", "global-chat-toggle", "global-chat-sheet"]) {
    assert.match(uiShell, new RegExp(`id=["']${id}["']`));
  }
  assert.match(mobileCss, /\.mobile-app-shell\s*\{[^}]*\bwidth:\s*min\(\s*100%\s*,\s*480px\s*\)/);
  assert.match(mobileCss, /\.chat-fab\s*\{(?=[^}]*\bwidth:\s*44px)(?=[^}]*\bheight:\s*44px)[^}]*\}/);
  assert.match(mobileCss, /sector-art-fallback/);
  assert.match(mobileCss, /env\(safe-area-inset-bottom\)/);
});
