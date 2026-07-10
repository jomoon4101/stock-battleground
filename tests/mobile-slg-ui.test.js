import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

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

test("ranking renderer localizes Survivors for direct timer and search renders", async () => {
  const app = await readFile(`${root}/app.js`, "utf8");
  const renderRanking = functionSource(app, "renderRanking");
  const markupIndex = renderRanking.indexOf('$("#ranking-list").innerHTML');
  const localizeIndex = renderRanking.indexOf('localizeDocument($("#tab-survivors"))');

  assert.ok(markupIndex >= 0 && localizeIndex > markupIndex, "ranking markup must be localized after insertion");
  assert.match(renderRanking, /localizeDocument\(\$\("#tab-survivors"\)\);\s*}$/);
  assert.equal((renderRanking.match(/localizeDocument\(/g) || []).length, 1);
  assert.doesNotMatch(renderRanking, /activateAppView\(/);
  assert.equal((app.match(/getActiveAppTab\(\) === "survivors"\) renderRanking\(\)/g) || []).length, 2);
  assert.match(app, /\$\("#rank-search"\)\.addEventListener\("input", renderRanking\)/);
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
  assert.match(app, /stock-survival:sheet-close[\s\S]*global-chat-sheet[\s\S]*renderGlobalChat\(\)/);
  assert.match(app, /#global-chat-sheet[\s\S]*classList\.contains\("is-hidden"\)/);
  assert.doesNotMatch(app, /globalChatCollapsed|is-collapsed/);
});

test("shared sheet controller exclusively owns close controls and backdrop dismissal", async () => {
  const app = await readFile(`${root}/app.js`, "utf8");
  assert.doesNotMatch(app, /\$\((?:"|')\[data-close-[^\]]+\](?:"|')\)\.addEventListener\("click"/);
  assert.doesNotMatch(app, /\$\("#(?:stock-detail|rules|item|rank-detail|holdings|message|notifications|board|profile)-modal"\)\.addEventListener\("click"/);
  assert.doesNotMatch(app, /\$\("#onboarding-sheet"\)\.addEventListener\("click"/);
  assert.equal((app.match(/document\.addEventListener\("stock-survival:sheet-close"/g) || []).length, 1);
  const closeStockDetail = functionSource(app, "closeStockDetail");
  assert.match(closeStockDetail, /closeSheet\("stock-detail-modal"\)/);
  assert.doesNotMatch(closeStockDetail, /restoreStockDetailPanels\(\)/);
  assert.match(app, /stock-survival:sheet-close[\s\S]*stock-detail-modal[\s\S]*restoreStockDetailPanels\(\)[\s\S]*global-chat-sheet[\s\S]*renderGlobalChat\(\)/);
});

test("every mobile sheet exposes dialog semantics, an interior card, and a shared close control", async () => {
  const uiShell = await readSource("ui-shell.js");
  const sheetIds = [...uiShell.matchAll(/<(?:div|aside) class="[^"]*(?:modal-backdrop|global-chat-sheet)[^"]*" id="([^"]+)"/g)]
    .map((match) => match[1]);

  assert.ok(sheetIds.includes("global-chat-sheet"));
  for (const id of sheetIds) {
    const start = uiShell.indexOf(`id="${id}"`);
    const nextSheet = uiShell.slice(start + id.length).search(/<(?:div|aside) class="[^"]*(?:modal-backdrop|global-chat-sheet)/);
    const fragment = uiShell.slice(start, nextSheet < 0 ? undefined : start + id.length + nextSheet);
    assert.match(fragment, /role="dialog"/i, `${id} must be a dialog`);
    assert.match(fragment, /aria-modal="true"/i, `${id} must be modal`);
    assert.match(fragment, /class="[^"]*sheet-card[^"]*"/i, `${id} must expose an interior card`);
    assert.match(fragment, /data-sheet-close/i, `${id} must expose the shared close control`);
  }
});

test("mobile HUD exposes live connected, reconnecting, and disconnected states", async () => {
  const [uiShell, app, mobileCss] = await Promise.all([
    readSource("ui-shell.js"),
    readFile(`${root}/app.js`, "utf8"),
    readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  assert.match(uiShell, /id="connection-status"[^>]*class="connection-status"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);

  const setter = functionSource(app, "setConnectionStatus");
  for (const state of ["connected", "reconnecting", "disconnected", "offline"]) {
    assert.match(setter, new RegExp(`${state}:`));
  }
  assert.match(setter, /dataset\.connectionState = state/);
  const connect = functionSource(app, "connectToRoom");
  assert.match(connect, /const stream = new EventSource/);
  assert.match(connect, /eventStream = stream/);
  assert.equal((connect.match(/if \(eventStream !== stream\) return;/g) || []).length, 3);
  assert.match(connect, /stream\.onopen/);
  assert.match(connect, /stream\.onmessage/);
  assert.match(connect, /stream\.onerror[\s\S]*stream\.readyState === EventSource\.CLOSED/);
  assert.doesNotMatch(connect, /eventStream\.readyState/);

  const hiddenLegacyIndex = mobileCss.lastIndexOf(".top-actions .connection { display:none; }");
  const visibleStatusIndex = mobileCss.lastIndexOf(".connection-status {");
  assert.ok(visibleStatusIndex > hiddenLegacyIndex, "visible connection status must win after legacy connection hiding");
  const visibleStatus = mobileCss.slice(visibleStatusIndex, mobileCss.indexOf("}", visibleStatusIndex) + 1);
  assert.match(visibleStatus, /display:\s*block/);
  assert.doesNotMatch(visibleStatus, /display:\s*none/);
});

test("active-room and portfolio empty states provide direct actions through existing flows", async () => {
  const app = await readFile(`${root}/app.js`, "utf8");
  const activeRooms = functionSource(app, "loadActiveRooms");
  const portfolio = functionSource(app, "renderPortfolioPanel");
  assert.match(activeRooms, /data-create-active-room/);
  assert.match(activeRooms, />방 만들기</);
  assert.match(app, /#active-survival-list[\s\S]*data-create-active-room[\s\S]*createOnlineRoom\(\)/);
  assert.match(portfolio, /data-open-market/);
  assert.match(portfolio, />시장 보기</);
  assert.match(portfolio, /localizeDocument\(\$\("#portfolio-list"\)\)/);
  assert.match(app, /#portfolio-list[\s\S]*data-open-market[\s\S]*activateAppView\("market"\)/);
});

test("canonical dark panels contain no light menu or header surface", async () => {
  const [styles, mobileCss] = await Promise.all([
    readFile(`${root}/styles.css`, "utf8"),
    readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  assert.doesNotMatch(styles, /\.panel\s*\{[^}]*background:\s*(?:white|#fff)/);
  assert.doesNotMatch(mobileCss, /\.panel-header\s*\{[^}]*background:\s*linear-gradient\([^}]*#fff/);
  assert.match(styles, /\.panel,\s*\.game-card\s*\{[^}]*background:\s*var\(--bg-panel\)/);
  assert.match(styles, /\.panel-header\s*\{[^}]*background:\s*var\(--bg-panel-2\)/);
});

test("message and notification badges use a readable mobile size", async () => {
  const styles = await readFile(`${root}/styles.css`, "utf8");
  assert.match(styles, /#mail-unread,\s*#notice-unread,\s*#global-chat-unread\s*\{(?=[^}]*min-width:\s*18px)(?=[^}]*height:\s*18px)(?=[^}]*font-size:\s*11px)(?=[^}]*font-weight:\s*900)[^}]*\}/);
});

test("sector card owns the trade action without a duplicate button", async () => {
  const app = await readFile(`${root}/app.js`, "utf8");
  const market = functionSource(app, "renderMarket");
  assert.doesNotMatch(market, /class="sector-open-button"/);
  const card = market.indexOf('<article class="stock-row sector-card');
  const heading = market.indexOf('<span class="sector-card-heading">');
  const portrait = market.indexOf('<span class="sector-ceo');
  assert.ok(card >= 0 && heading > card && portrait > heading);
  assert.match(market, /role="listitem" tabindex="0"/);
});

test("intelligence renders one latest keyword item in three ordered rows", async () => {
  const app = await readFile(`${root}/app.js`, "utf8");
  const intel = functionSource(app, "renderIntelCards");
  assert.match(intel, /const latestMarket/);
  assert.match(intel, /const latestDisclosure/);
  assert.match(intel, /const latestRumor/);
  assert.doesNotMatch(intel, /slice\(0,\s*3\)/);
  assert.match(intel, /intel-feed-row news[\s\S]*intel-feed-row report[\s\S]*intel-feed-row rumor/);
  assert.equal((intel.match(/class="intel-latest-card/g) || []).length, 3);
});

test("final mobile controls, detail contrast and shell labels remain accessible", async () => {
  const [uiShell, mobileCss, i18n] = await Promise.all([
    readSource("ui-shell.js"),
    readFile(`${root}/mobile-first.css`, "utf8"),
    readFile(`${root}/i18n.js`, "utf8"),
  ]);
  assert.match(uiShell, /id="pause-button"/);
  assert.match(uiShell, /id="rules-button"/);

  const finalControls = mobileCss;
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

test("mobile SLG shell labels and empty states localize to exact English copy", async () => {
  const previousDocument = globalThis.document;
  globalThis.document = { documentElement: { lang: "ko" }, body: null };
  try {
    const { setLanguage, translateText } = await import(`${pathToFileURL(`${root}/i18n.js`).href}?mobile-shell-localization`);
    setLanguage("en");
    const expected = {
      "홈": "Home",
      "시장": "Market",
      "거래": "Trade",
      "생존자": "Survivors",
      "로그": "Log",
      "거래장 열기": "Open Trade Desk",
      "보유 종목 없음": "No holdings yet",
      "시장 스캔에서 첫 종목을 선택하세요.": "Choose your first stock from Market Scan.",
      "현재 열린 생존전이 없습니다.": "No survival match is open right now.",
      "현재 참여 가능한 서바이벌이 없습니다.": "There are no survival games available to join.",
      "시장 보기": "Open Market",
      "연결 상태": "Connection status",
      "오프라인": "Offline",
      "연결됨": "Connected",
      "재연결 중": "Reconnecting",
      "연결 끊김": "Disconnected",
      "전체 채팅 열기": "Open room chat",
      "전체 채팅 닫기": "Close room chat",
      "게임 메뉴": "Game menu",
      "생존 상태바": "Survival status",
      "섹터 카드 이동": "Sector card navigation",
      "이전 섹터": "Previous sector",
      "다음 섹터": "Next sector",
      "거래 섹터 선택": "Choose trading sector",
      "선택 섹터 CEO": "Selected sector CEO",
      "생존 거래를 시작하세요": "Start survival trading",
      "섹터를 확인하세요.": "Review the sectors.",
      "종목을 매수/매도하세요.": "Buy or sell a stock.",
      "턴을 종료하세요.": "End your turn.",
      "마지막까지 생존하세요.": "Survive to the end.",
      "게임 시작": "Start game",
      "안전": "Safe",
      "찌라시 쪽지함 →": "Open rumor inbox →",
      "방 코드 보기·복사": "View or copy room code",
      "종목명을 누르면 차트로 이동합니다. 매수·매도 버튼을 누르면 해당 주문 화면이 바로 열립니다.": "Tap a stock name to view its chart. Use Buy or Sell to open that order screen.",
    };
    for (const [korean, english] of Object.entries(expected)) {
      assert.equal(translateText(korean), english, korean);
      assert.doesNotMatch(translateText(korean), /[가-힣]/, korean);
    }
  } finally {
    globalThis.document = previousDocument;
  }
});

test("localizeDocument restores composed and new shell aria labels after English to Korean switch", async () => {
  const previousDocument = globalThis.document;
  const previousNodeFilter = globalThis.NodeFilter;
  const elements = ["Technology 거래창 열기", "Alice 상세 정보", "연결 상태", "시장 보기"].map((label) => {
    const attributes = new Map([["aria-label", label]]);
    return {
      hasAttribute: (name) => attributes.has(name),
      getAttribute: (name) => attributes.get(name),
      setAttribute: (name, value) => attributes.set(name, value),
    };
  });
  const body = { querySelectorAll: () => elements };
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  globalThis.document = {
    documentElement: { lang: "ko" },
    body,
    createTreeWalker: () => ({ nextNode: () => null }),
  };
  try {
    const { setLanguage } = await import(`${pathToFileURL(`${root}/i18n.js`).href}?reversible-composed-labels`);
    setLanguage("en");
    assert.equal(elements[0].getAttribute("aria-label"), "Technology Open trading window");
    assert.equal(elements[1].getAttribute("aria-label"), "Alice details");
    assert.equal(elements[2].getAttribute("aria-label"), "Connection status");
    assert.equal(elements[3].getAttribute("aria-label"), "Open Market");
    setLanguage("ko");
    assert.equal(elements[0].getAttribute("aria-label"), "Technology 거래창 열기");
    assert.equal(elements[1].getAttribute("aria-label"), "Alice 상세 정보");
    assert.equal(elements[2].getAttribute("aria-label"), "연결 상태");
    assert.equal(elements[3].getAttribute("aria-label"), "시장 보기");
  } finally {
    globalThis.document = previousDocument;
    globalThis.NodeFilter = previousNodeFilter;
  }
});

test("dynamic aria renderers provide stable Korean originals to localizeDocument", async () => {
  const app = await readFile(`${root}/app.js`, "utf8");
  const renderMarket = functionSource(app, "renderMarket");
  assert.match(renderMarket, /aria-label="\$\{escapeHtml\(stock\.sector\)\} · \$\{escapeHtml\(stock\.name\)\} · \$\{percent\(change\)\}/);
  assert.match(renderMarket, /open trading window" : "거래창 열기/);
  assert.ok(renderMarket.indexOf("localizeDocument(stockList)") > renderMarket.indexOf("stockList.innerHTML"));
  assert.match(functionSource(app, "renderRanking"), /aria-label="\$\{escapeHtml\(entry\.nickname\)\} 상세 정보"/);
});

test("holdings empty-state translation has one canonical dictionary entry", async () => {
  const i18n = await readFile(`${root}/i18n.js`, "utf8");
  assert.equal((i18n.match(/"보유 종목 없음"\s*:/g) || []).length, 1);
  assert.match(i18n, /"보유 종목 없음":\s*"No holdings yet"/);
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
    "\\.intel-trade-link", "\\.holding-actions button",
    "\\.stock-detail-body \\.tab", "\\.market-panel > \\.intel-panel \\.intel-title-block #open-intel-messages",
  ]) {
    assert.match(finalTargets, new RegExp(`${selector}\\s*\\{[^}]*min-height:\\s*(?:48|5[0-9]|6[0-4])px`), selector);
  }
});

test("balanced readability system prevents compressed mobile game content", async () => {
  const mobileCss = await readFile(`${root}/mobile-first.css`, "utf8");
  const marker = mobileCss.lastIndexOf("/* Balanced readability system */");
  assert.ok(marker >= 0, "final balanced readability layer must exist");
  const balanced = mobileCss.slice(marker);

  assert.match(balanced, /--ui-body:\s*15px/);
  assert.match(balanced, /--ui-label:\s*12px/);
  assert.match(balanced, /--ui-title:\s*18px/);
  assert.match(balanced, /--ui-metric:\s*24px/);

  assert.match(balanced, /\.survival-status\s*\{[^}]*grid-template-columns:\s*repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(balanced, /\.survival-status small\s*\{[^}]*font-size:\s*var\(--ui-label\)[^}]*white-space:\s*nowrap/);
  assert.match(balanced, /\.survival-status strong\s*\{[^}]*font-size:\s*15px[^}]*white-space:\s*nowrap/);

  assert.match(balanced, /\.identity-card\s*\{[^}]*grid-template-columns:\s*52px minmax\(0,1fr\) auto/);
  assert.match(balanced, /\.my-goal-panel\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*width:\s*100%/);
  assert.match(balanced, /\.asset-panel \.panel-header,\s*\.portfolio-panel \.panel-header\s*\{[^}]*min-height:\s*64px/);

  assert.match(balanced, /\.stock-row\.sector-card\s*\{(?=[^}]*height:\s*auto)(?=[^}]*min-height:\s*520px)(?=[^}]*overflow:\s*hidden)[^}]*\}/);
  assert.match(balanced, /\.sector-stats small\s*\{[^}]*font-size:\s*11px/);
  assert.match(balanced, /\.sector-position small\s*\{[^}]*font-size:\s*11px/);

  assert.match(balanced, /\.trade-panel \.tab\s*\{[^}]*min-width:\s*max-content[^}]*font-size:\s*14px/);
  assert.match(balanced, /\.trade-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/);
  assert.match(balanced, /\.turn-action-bar button,\s*\.game-bottom-nav button\s*\{[^}]*min-height:\s*48px/);
});
