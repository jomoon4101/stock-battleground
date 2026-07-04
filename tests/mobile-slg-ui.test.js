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

test("app tab state owns validation, accessibility, events and sheet scroll locking", async () => {
  const uiState = await readSource("ui-state.js");

  assert.match(uiState, /const APP_TABS = Object\.freeze\(\["home", "market", "trade", "survivors", "logs"\]\)/);
  assert.match(uiState, /if \(!APP_TABS\.includes\(tabName\)\) return activeTab/);
  assert.match(uiState, /aria-current/);
  assert.match(uiState, /hidden = panel\.dataset\.tabPanel !== activeTab/);
  assert.match(uiState, /new CustomEvent\("stock-survival:tab-change"/);
  assert.match(uiState, /document\.body\.classList\.toggle\("has-open-sheet"/);
});

test("bottom navigation selects app tabs and renders each tab's content", async () => {
  const [app, build] = await Promise.all([
    readFile(`${root}/app.js`, "utf8"),
    readFile(`${root}/scripts/build.mjs`, "utf8"),
  ]);

  assert.match(app, /import \{[^}]*closeSheet[^}]*openSheet[^}]*setActiveAppTab[^}]*\} from ["']\.\/ui-state\.js["']/);
  assert.match(app, /mountAppShell\(\);[\s\S]*setActiveAppTab\("home"\)/);
  assert.match(app, /#game-bottom-nav[\s\S]*closest\("\[data-app-tab\]"\)[\s\S]*setActiveAppTab\(button\.dataset\.appTab\)/);
  assert.match(app, /case "home":[\s\S]*renderAssets\(\)[\s\S]*renderPortfolioPanel\(\)/);
  assert.match(app, /case "market":[\s\S]*renderMarket\(\)[\s\S]*renderIntelCards\(\)/);
  assert.match(app, /case "trade":[\s\S]*renderTradePanel\(\)[\s\S]*renderOrders\(\)[\s\S]*renderFinance\(\)[\s\S]*renderItems\(\)[\s\S]*requestAnimationFrame\(drawChart\)/);
  assert.match(app, /case "survivors":[\s\S]*renderRanking\(\)/);
  assert.match(app, /case "logs":[\s\S]*renderLogs\(\)/);
  assert.doesNotMatch(app, /#game-bottom-nav[\s\S]*target === "ranking"[\s\S]*openRankingModal/);
  assert.doesNotMatch(app, /#game-bottom-nav[\s\S]*target === "trade"[\s\S]*openStockDetail/);
  assert.match(app, /function activateTradeTab\(tabName\)/);
  assert.doesNotMatch(app, /function activateTab\(tabName\)/);
  assert.match(build, /"ui-state\.js"/);
});

test("all modal backdrop flows use shared sheet state helpers", async () => {
  const app = await readFile(root + "/app.js", "utf8");
  const sheetIds = [
    "profile-modal", "stock-detail-modal", "ranking-modal", "rules-modal",
    "item-modal", "result-modal", "message-modal", "notifications-modal",
    "elimination-modal", "board-modal", "holdings-modal", "rank-detail-modal",
  ];

  for (const id of sheetIds) {
    assert.match(app, new RegExp("openSheet\\(\"" + id + "\"\\)"), id + " must open through openSheet");
    assert.match(app, new RegExp("closeSheet\\(\"" + id + "\"\\)"), id + " must close through closeSheet");
    assert.doesNotMatch(
      app,
      new RegExp("\\$\\(\"#" + id + "\"\\)\\.classList\\.(?:add|remove)\\(\"is-hidden\"\\)"),
      id + " must not bypass shared sheet state",
    );
  }
});
