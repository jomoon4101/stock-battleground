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

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a complete function body`);
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
  const [uiShell, app, styles, mobileCss] = await Promise.all([
    readSource("ui-shell.js"),
    readFile(`${root}/app.js`, "utf8"),
    readFile(`${root}/styles.css`, "utf8"),
    readFile(`${root}/mobile-first.css`, "utf8"),
  ]);

  for (const id of ["battle-hud", "end-turn-button", "open-trade-button", "global-chat-toggle", "global-chat-sheet"]) {
    assert.match(uiShell, new RegExp(`id=["']${id}["']`));
  }
  for (const [token, value] of [
    ["bg-main", "#070b14"], ["bg-panel", "#101827"], ["bg-panel-2", "#162033"],
    ["line-soft", "rgba(255,255,255,.08)"], ["text-main", "#f8fafc"],
    ["text-sub", "#94a3b8"], ["text-muted", "#64748b"], ["red-main", "#ef233c"],
    ["red-dark", "#b80f28"], ["blue-main", "#2f80ed"], ["gold-main", "#f2b84b"],
    ["green-main", "#2dd4bf"], ["danger", "#ef4444"], ["safe", "#22c55e"],
    ["warning", "#f59e0b"],
  ]) {
    assert.match(styles, new RegExp(`--${token}:\\s*${value.replace(/[().]/g, "\\$&")}`));
  }
  assert.doesNotMatch(styles, /color-scheme:\s*light/);
  assert.match(styles, /body\s*\{[^}]*\bfont:\s*[^;}]*\b14px\b/);
  assert.doesNotMatch(styles, /2026-07 v2 readability and light-surface hardening/);
  assert.doesNotMatch(styles, /Every dialog\/form surface is explicitly light/);
  assert.doesNotMatch(styles, /--font-body:\s*16px|body\s*\{[^}]*font(?:-size)?:\s*[^;}]*16px|body\s*\{\s*font-size:\s*var\(--font-body\)/);
  assert.doesNotMatch(styles, /--surface:\s*#ffffff|--surface-soft:\s*#f4f8fc|--surface-blue:\s*#eaf3fd/);
  assert.doesNotMatch(styles, /\.message-bubble\.rumor\s*\{[^}]*background:\s*#fff7df/);
  assert.match(styles, /\.message-bubble\.rumor\s*\{(?=[^}]*background:\s*rgba\(245,158,11,\.12\))(?=[^}]*color:\s*#fde68a)[^}]*\}/);
  assert.match(mobileCss, /\.mobile-app-shell\s*\{[^}]*\bwidth:\s*min\(\s*100%\s*,\s*480px\s*\)/);
  assert.match(mobileCss, /\.app-tab\s*\{[^}]*\bmin-height:\s*48px/);
  assert.match(mobileCss, /\.chat-fab\s*\{(?=[^}]*\bwidth:\s*44px)(?=[^}]*\bheight:\s*44px)[^}]*\}/);
  assert.match(mobileCss, /\.battle-hud\s*\{[^}]*\bposition:\s*sticky/);
  assert.match(mobileCss, /\.game-bottom-nav\s*\{(?=[^}]*\bposition:\s*fixed)(?=[^}]*\bwidth:\s*min\(\s*100%\s*,\s*480px\s*\))(?=[^}]*env\(safe-area-inset-bottom\))[^}]*\}/);
  assert.match(mobileCss, /\.turn-action-bar\s*\{(?=[^}]*\bposition:\s*fixed)(?=[^}]*\bbottom:\s*calc\()[^}]*\}/);
  assert.match(mobileCss, /\.sector-art-fallback\s*\{/);
  assert.doesNotMatch(mobileCss, /\.profile-open-button\s*\{[^}]*background:\s*linear-gradient\(145deg,#fff,#eef5fa\)/);
  assert.doesNotMatch(mobileCss, /\.my-goal-panel\s*\{[^}]*background:\s*rgba\(255,255,255,\.78\)/);
  assert.doesNotMatch(mobileCss, /body\s*\{\s*background:\s*#edf3f9/);
  assert.doesNotMatch(mobileCss, /\.stock-detail-sector-list button\.is-active\s*\{[^}]*background:\s*#fff0f2/);
  assert.match(mobileCss, /\.profile-open-button\s*\{(?=[^}]*border:\s*1px solid var\(--line-soft\))(?=[^}]*background:\s*var\(--bg-panel-2\))(?=[^}]*color:\s*var\(--text-main\))[^}]*\}/);
  assert.match(mobileCss, /\.my-goal-panel\s*\{(?=[^}]*border:\s*1px solid var\(--line-soft\))(?=[^}]*background:\s*#0b1220)(?=[^}]*color:\s*var\(--text-main\))[^}]*\}/);
  assert.match(mobileCss, /\.my-goal-progress\s*\{[^}]*background:\s*var\(--bg-panel-2\)/);
  for (const viewport of [390, 412, 430]) assert.match(mobileCss, new RegExp(`@media \\(min-width: ${viewport}px\\)`));
  assert.match(mobileCss, /@media \(min-width: 481px\)/);

  const actionBar = uiShell.match(/<div class="turn-action-bar"[\s\S]*?<\/div>/)?.[0] || "";
  assert.match(actionBar, /id="open-trade-button"/);
  assert.match(actionBar, /id="end-turn-button"/);
  assert.equal((uiShell.match(/id="open-trade-button"/g) || []).length, 1);
  assert.equal((uiShell.match(/id="end-turn-button"/g) || []).length, 1);
  const bottomNav = uiShell.match(/<nav class="game-bottom-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.equal((bottomNav.match(/data-app-tab=/g) || []).length, 5);
  assert.doesNotMatch(bottomNav, /id="open-trade-button"/);
  assert.match(app, /#open-trade-button[\s\S]*activateAppView\("trade"\)/);
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

  assert.match(app, /import \{[^}]*getActiveAppTab[^}]*setActiveAppTab[^}]*\} from ["']\.\/ui-state\.js["']/);
  assert.match(app, /mountAppShell\(\);[\s\S]*setActiveAppTab\("home"\)/);
  const activeRenderer = functionSource(app, "renderActiveBattleTab");
  assert.match(activeRenderer, /switch \(getActiveAppTab\(\)\)/);
  assert.match(activeRenderer, /case "home":[\s\S]*renderAssets\(\)[\s\S]*renderPortfolioPanel\(\)/);
  assert.match(activeRenderer, /case "market":[\s\S]*renderMarket\(\)[\s\S]*renderIntelCards\(\)/);
  assert.match(activeRenderer, /case "trade":[\s\S]*renderSelectedStock\(\)[\s\S]*renderTradePanel\(\)[\s\S]*renderOrders\(\)[\s\S]*renderFinance\(\)[\s\S]*renderItems\(\)[\s\S]*requestAnimationFrame\(drawChart\)/);
  assert.match(activeRenderer, /case "survivors":[\s\S]*renderRanking\(\)/);
  assert.match(activeRenderer, /case "logs":[\s\S]*renderLogs\(\)/);

  const activateView = functionSource(app, "activateAppView");
  assert.match(activateView, /setActiveAppTab\(tab\)/);
  assert.match(activateView, /renderActiveBattleTab\(\)/);
  const renderIndex = activateView.indexOf("renderActiveBattleTab()");
  const panelIndex = activateView.indexOf('[data-tab-panel="${activeTab}"]');
  const localizeIndex = activateView.indexOf("localizeDocument(panel)");
  assert.ok(panelIndex > renderIndex, "the active panel must be selected after its dynamic content renders");
  assert.ok(localizeIndex > panelIndex, "the newly rendered active panel must be localized");
  const navHandler = app.slice(app.indexOf('$("#game-bottom-nav")'), app.indexOf('$("#open-trade-button")'));
  assert.match(navHandler, /closest\("\[data-app-tab\]"\)/);
  assert.match(navHandler, /activateAppView\(button\.dataset\.appTab\)/);
  assert.doesNotMatch(navHandler, /switch\s*\(/);
  const tradeHandler = app.slice(app.indexOf('$("#open-trade-button")'), app.indexOf('$("#new-game-button")'));
  assert.match(tradeHandler, /activateAppView\("trade"\)/);

  const renderAll = functionSource(app, "renderAll");
  assert.match(renderAll, /renderHeader\(\)/);
  assert.match(renderAll, /renderSurvivalStatus\(\)/);
  assert.match(renderAll, /renderClock\(\)/);
  assert.match(renderAll, /renderMessageBadges\(\)/);
  assert.match(renderAll, /renderGlobalChat\(\)/);
  assert.match(renderAll, /renderActiveBattleTab\(\)/);
  assert.doesNotMatch(renderAll, /renderMarket\(\)|renderRanking\(\)|renderTradePanel\(\)|renderOrders\(\)|renderFinance\(\)|renderItems\(\)|renderLogs\(\)|requestAnimationFrame\(drawChart\)/);
  assert.doesNotMatch(app, /#game-bottom-nav[\s\S]*target === "ranking"[\s\S]*openRankingModal/);
  assert.doesNotMatch(app, /#game-bottom-nav[\s\S]*target === "trade"[\s\S]*openStockDetail/);
  assert.match(app, /function activateTradeTab\(tabName\)/);
  assert.doesNotMatch(app, /function activateTab\(tabName\)/);
  assert.match(build, /"ui-state\.js"/);
});

test("Survivors owns ranking without a legacy ranking modal", async () => {
  const [app, uiShell] = await Promise.all([
    readFile(`${root}/app.js`, "utf8"),
    readSource("ui-shell.js"),
  ]);
  assert.doesNotMatch(app, /openRankingModal|ranking-modal|data-close-ranking/);
  assert.doesNotMatch(uiShell, /ranking-modal|ranking-modal-body|ranking-modal-title|data-close-ranking/);
  assert.match(functionSource(app, "renderActiveBattleTab"), /case "survivors":[\s\S]*renderRanking\(\)/);
  assert.doesNotMatch(app, /function initializeIntegratedLayout\(/);
});

test("Trade owns finance totals while Home renders only home asset fields", async () => {
  const app = await readFile(`${root}/app.js`, "utf8");
  const renderAssets = functionSource(app, "renderAssets");
  const renderFinance = functionSource(app, "renderFinance");

  assert.doesNotMatch(renderAssets, /#finance-debt|#finance-bonds/);
  assert.match(renderFinance, /const summary = playerSummary\(\)/);
  assert.match(renderFinance, /\$\("#finance-debt"\)\.textContent = money\(summary\.debt\)/);
  assert.match(renderFinance, /\$\("#finance-bonds"\)\.textContent = money\(summary\.bonds\)/);
});

test("opening stock detail initializes once, activates Trade, then mounts and opens the modal", async () => {
  const app = await readFile(`${root}/app.js`, "utf8");
  const openStockDetail = functionSource(app, "openStockDetail");
  const selectedIndex = openStockDetail.indexOf("selectedStock = Number(stockIndex)");
  const priceIndex = openStockDetail.indexOf('$("#limit-price").value');
  const quantityIndex = openStockDetail.indexOf('$("#trade-quantity").value');
  const sideIndex = openStockDetail.indexOf("if (side)");
  const activateIndex = openStockDetail.indexOf('activateAppView("trade")');
  const pickerIndex = openStockDetail.indexOf("renderStockDetailSectorPicker()");
  const mountIndex = openStockDetail.indexOf("mountStockDetailPanels()");
  const openIndex = openStockDetail.indexOf('openSheet("stock-detail-modal")');
  const localizeIndex = openStockDetail.indexOf('localizeDocument($("#stock-detail-modal"))');

  assert.ok(selectedIndex >= 0, "stock detail must select the requested stock");
  assert.ok(priceIndex > selectedIndex && quantityIndex > priceIndex, "trade inputs must initialize after stock selection");
  assert.ok(sideIndex > quantityIndex && activateIndex > sideIndex, "trade side must initialize before Trade activation");
  assert.equal((openStockDetail.match(/activateAppView\("trade"\)/g) || []).length, 1);
  assert.ok(pickerIndex > activateIndex, "the detail sector picker must render after Trade activation");
  assert.ok(mountIndex > pickerIndex, "temporary panels must mount after the detail picker renders");
  assert.ok(openIndex > mountIndex, "temporary panel mounting must happen before the modal opens");
  assert.ok(localizeIndex > openIndex, "the open modal must be localized");
  assert.doesNotMatch(openStockDetail, /renderMarket\(\)|renderSelectedStock\(\)|renderTradePanel\(\)|drawChart\(\)/);
  assert.doesNotMatch(functionSource(app, "activateAppView"), /openStockDetail\(/);
});

test("rank-effect timers update ranking only while Survivors is active", async () => {
  const app = await readFile(`${root}/app.js`, "utf8");
  const guardedRenders = app.match(/if \(game && getActiveAppTab\(\) === "survivors"\) renderRanking\(\);/g) || [];

  assert.equal(guardedRenders.length, 2);
  assert.doesNotMatch(app, /if \(game\) renderRanking\(\)/);
});

test("all modal backdrop flows use shared sheet state helpers", async () => {
  const app = await readFile(root + "/app.js", "utf8");
  const sheetIds = [
    "profile-modal", "stock-detail-modal", "rules-modal",
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
  assert.doesNotMatch(app, /openRankingModal|ranking-modal|data-close-ranking/);
});

test("compact global chat has an external trigger and a real hidden sheet lifecycle", async () => {
  const [uiShell, app] = await Promise.all([
    readSource("ui-shell.js"),
    readFile(root + "/app.js", "utf8"),
  ]);
  const toggleIndex = uiShell.indexOf('id="global-chat-toggle"');
  const sheetStart = uiShell.indexOf('id="global-chat-sheet"');
  const sheetEnd = uiShell.indexOf("</aside>", sheetStart);

  assert.match(uiShell, /class="chat-fab" id="global-chat-toggle"[^>]*aria-controls="global-chat-sheet"[^>]*aria-expanded="false"/);
  assert.ok(toggleIndex >= 0 && toggleIndex < sheetStart, "chat toggle must remain outside the hidden sheet");
  assert.match(uiShell, /class="global-chat-sheet is-hidden" id="global-chat-sheet"/);
  assert.match(uiShell.slice(sheetStart, sheetEnd), /data-close-global-chat/);
  assert.equal((uiShell.match(/id="global-chat-toggle"/g) || []).length, 1);
  assert.equal((uiShell.match(/id="global-chat-unread"/g) || []).length, 1);

  assert.match(app, /#global-chat-toggle[\s\S]*openSheet\("global-chat-sheet"\)[\s\S]*aria-expanded", "true"/);
  assert.match(app, /data-close-global-chat[\s\S]*closeSheet\("global-chat-sheet"\)[\s\S]*aria-expanded", "false"/);
  assert.match(app, /#global-chat-sheet[\s\S]*classList\.contains\("is-hidden"\)/);
  assert.doesNotMatch(app, /globalChatCollapsed|is-collapsed/);
});

test("post-legacy dark leader and modal readability floor wins the cascade", async () => {
  const styles = await readFile(`${root}/styles.css`, "utf8");
  const legacyLeaderIndex = styles.lastIndexOf(".leader-announcement { border-color:");
  const floorIndex = styles.lastIndexOf("/* Mobile readability floor */");
  assert.ok(legacyLeaderIndex >= 0, "legacy leader declaration must remain detectable");
  assert.ok(floorIndex > legacyLeaderIndex, "readability floor must follow all legacy declarations");

  const floor = styles.slice(floorIndex);
  assert.match(floor, /\.leader-announcement\s*\{(?=[^}]*border:\s*1px solid var\(--line-soft\))(?=[^}]*background:\s*var\(--bg-panel\))(?=[^}]*color:\s*var\(--text-main\))(?=[^}]*box-shadow:)[^}]*\}/);
  assert.doesNotMatch(floor, /\.leader-announcement\s*\{[^}]*background:\s*(?:white|#fff)/);
  assert.match(floor, /\.leader-announcement strong\s*\{[^}]*color:\s*var\(--text-main\)[^}]*font-size:\s*14px/);
  assert.match(floor, /\.rules-grid p,\.data-note\s*\{[^}]*font-size:\s*14px/);
  assert.match(floor, /\.message-bubble,\.message-empty,\.notice-row,\.board-post p\s*\{[^}]*font-size:\s*14px/);
  assert.match(floor, /\.message-bubble small,\.message-recipient small,\.message-contact small,\.board-post small\s*\{[^}]*font-size:\s*12px/);
  assert.match(floor, /\.rank-number,\.rank-person small,\.rank-move,\.streak-mark,[^}]*font-size:\s*12px/);
  assert.match(floor, /\.rank-person b,\.rank-assets,\.rank-detail-player strong,[^}]*font-size:\s*14px/);
  assert.match(floor, /\.item-modal-card > p,\.item-option-label,\.modal-cost,[^}]*font-size:\s*14px/);
  assert.match(floor, /\.rules-grid b,\.podium b,\.holdings-list:empty::after\s*\{[^}]*font-size:\s*14px/);
  assert.match(floor, /\.rank-stock-jump b,\.top-stock-card b,\.holding-name small,[^}]*font-size:\s*12px/);
  assert.match(floor, /\.elimination-stats small,\.elimination-activity > strong,[^}]*font-size:\s*12px/);
  assert.match(floor, /\.holding-name strong,\.holding-value b,\.elimination-activity b\s*\{[^}]*font-size:\s*14px/);

  const mobileCss = await readFile(`${root}/mobile-first.css`, "utf8");
  assert.match(mobileCss, /\.profile-open-button small\s*\{[^}]*font-size:\s*12px/);
});

test("final high-specificity intelligence block defeats light market surfaces", async () => {
  const mobileCss = await readFile(`${root}/mobile-first.css`, "utf8");
  const lightPanelIndex = mobileCss.lastIndexOf("background: linear-gradient(90deg,#eef6fd,#fff)");
  const lightCardsIndex = mobileCss.lastIndexOf("background: #d4e0eb");
  const darkIntelIndex = mobileCss.lastIndexOf("/* Final intelligence dark cascade */");
  assert.ok(lightPanelIndex >= 0 && lightCardsIndex >= 0, "legacy light intel surfaces must remain detectable");
  assert.ok(darkIntelIndex > lightPanelIndex && darkIntelIndex > lightCardsIndex, "dark intel cascade must be last");

  const finalIntel = mobileCss.slice(darkIntelIndex);
  assert.doesNotMatch(finalIntel, /background:\s*(?:#fff|#d4e0eb|linear-gradient\([^;]*#fff)/);
  assert.match(finalIntel, /\.market-panel > \.intel-panel\s*\{(?=[^}]*border:\s*1px solid var\(--line-soft\))(?=[^}]*background:\s*linear-gradient\([^}]*var\(--bg-panel\))(?=[^}]*color:\s*var\(--text-main\))[^}]*\}/);
  assert.match(finalIntel, /\.market-panel > \.intel-panel \.intel-cards\s*\{[^}]*background:\s*#0b1220/);
  assert.match(finalIntel, /\.market-panel > \.intel-panel \.intel-feed-row\s*\{(?=[^}]*border-color:\s*var\(--line-soft\))(?=[^}]*background:\s*var\(--bg-panel\))[^}]*\}/);
  assert.match(finalIntel, /\.market-panel > \.intel-panel \.intel-feed-card\s*\{(?=[^}]*border-color:\s*var\(--line-soft\))(?=[^}]*background:\s*var\(--bg-panel-2\))(?=[^}]*color:\s*var\(--text-sub\))[^}]*\}/);
});

test("final mobile controls, detail contrast and shell labels remain accessible", async () => {
  const [uiShell, mobileCss, i18n] = await Promise.all([
    readSource("ui-shell.js"),
    readFile(`${root}/mobile-first.css`, "utf8"),
    readFile(`${root}/i18n.js`, "utf8"),
  ]);
  assert.match(uiShell, /id="pause-button"/);
  assert.match(uiShell, /id="rules-button"/);

  const hiddenIconsIndex = mobileCss.lastIndexOf(".top-actions .connection,.top-actions .icon-button { display:none; }");
  const restoredControlsIndex = mobileCss.lastIndexOf("/* Restored mobile controls and contrast */");
  assert.ok(restoredControlsIndex > hiddenIconsIndex, "visible controls must follow the hidden legacy declaration");
  const finalControls = mobileCss.slice(restoredControlsIndex);
  assert.match(finalControls, /\.top-actions \.icon-button\s*\{(?=[^}]*display:\s*grid)(?=[^}]*width:\s*48px)(?=[^}]*height:\s*48px)[^}]*\}/);
  assert.match(finalControls, /@media \(min-width:\s*390px\)\s*\{[\s\S]*?\.topbar\s*\{[^}]*grid-template-columns:\s*40px minmax\(0,1fr\) auto/);
  assert.match(finalControls, /\.stock-detail-sector-switcher > div:first-child strong\s*\{[^}]*color:\s*var\(--text-main\)/);
  assert.match(finalControls, /\.stock-detail-sector-switcher > div:first-child small\s*\{[^}]*color:\s*var\(--text-sub\)/);
  assert.match(finalControls, /\.sector-ceo\s*\{(?=[^}]*background-color:\s*#0b1220)(?=[^}]*background-image:\s*linear-gradient\()[^}]*\}/);

  for (const selector of [
    "\\.stock-detail-actions button", "\\.chart-type-toggle button", "\\.stock-detail-body \\.chart-type-toggle button",
    "\\.stock-detail-body \\.side-toggle button", "\\.stock-detail-body \\.quick-amounts button",
    "\\.language-choice button", "\\.sector-rail-controls button", "\\.stock-detail-sector-list button",
  ]) {
    assert.match(finalControls, new RegExp(`${selector}\\s*\\{[^}]*min-height:\\s*(?:48|5[0-9]|6[0-4])px`), selector);
  }

  assert.match(i18n, /"주문 열기":\s*"Open order"/);
  assert.match(i18n, /"턴 행동":\s*"Turn actions"/);
});

test("checkpoint overlay and remaining transaction controls fit mobile touch targets", async () => {
  const [styles, mobileCss] = await Promise.all([
    readFile(`${root}/styles.css`, "utf8"),
    readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  assert.match(styles, /\.final-countdown\s*\{[^}]*min-width:\s*145px/);
  const oldCountdownIndex = mobileCss.lastIndexOf(".final-countdown { inset:");
  const finalTargetsIndex = mobileCss.lastIndexOf("/* Checkpoint HUD and final touch targets */");
  assert.ok(finalTargetsIndex > oldCountdownIndex, "checkpoint overlay must be the final countdown layout");

  const finalTargets = mobileCss.slice(finalTargetsIndex);
  assert.match(finalTargets, /\.final-countdown\s*\{(?=[^}]*position:\s*fixed)(?=[^}]*left:\s*50%)(?=[^}]*top:\s*0)(?=[^}]*width:\s*min\(100%,480px\))(?=[^}]*transform:\s*translateX\(-50%\))(?=[^}]*min-height:\s*60px)[^}]*\}/);
  assert.doesNotMatch(finalTargets, /\.final-countdown\s*\{[^}]*min-width:\s*145px/);
  assert.match(styles, /\.is-hidden\s*\{[^}]*display:\s*none\s*!important/);
  assert.match(finalTargets, /\.stock-detail-body \.tabs\s*\{(?=[^}]*height:\s*auto)(?=[^}]*min-height:\s*48px)(?=[^}]*overflow:\s*visible)[^}]*\}/);

  for (const selector of [
    "\\.trade-submit", "\\.stock-detail-body \\.trade-submit", "\\.trade-grid input",
    "\\.order-form input", "\\.order-form select", "\\.inline-form input",
    "\\.sector-open-button", "\\.intel-trade-link", "\\.holding-actions button",
    "\\.stock-detail-body \\.tab", "\\.market-panel > \\.intel-panel \\.intel-title-block #open-intel-messages",
  ]) {
    assert.match(finalTargets, new RegExp(`${selector}\\s*\\{[^}]*min-height:\\s*(?:48|5[0-9]|6[0-4])px`), selector);
  }
});
