import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function readMarkup() {
  const [html, uiShell] = await Promise.all([
    readFile(`${root}/index.html`, "utf8"),
    readFile(`${root}/ui-shell.js`, "utf8"),
  ]);
  return `${html}\n${uiShell}`;
}

function tabPanelSource(uiShell, tabName) {
  const panelStart = uiShell.indexOf(`id="tab-${tabName}"`);
  assert.notEqual(panelStart, -1, `tab-${tabName} must exist`);
  const nextPanelStart = uiShell.indexOf('<section class="battle-tab-panel"', panelStart + 1);
  const mainEnd = uiShell.indexOf("</main>", panelStart);
  const panelEnd = nextPanelStart === -1 ? mainEnd : Math.min(nextPanelStart, mainEnd);
  assert.ok(panelEnd > panelStart, `tab-${tabName} must have a bounded panel range`);
  return uiShell.slice(panelStart, panelEnd);
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

test("앱 마운트 루트는 main 랜드마크를 중첩하지 않는다", async () => {
  const html = await readFile(`${root}/index.html`, "utf8");
  assert.match(html, /<div id="stock-survival-root"><\/div>/);
  assert.doesNotMatch(html, /<main id="stock-survival-root"/);
});

test("다섯 앱 탭은 각 게임 패널을 정적 마크업 범위 안에 정확히 소유한다", async () => {
  const uiShell = await readFile(`${root}/ui-shell.js`, "utf8");
  const home = tabPanelSource(uiShell, "home");
  const market = tabPanelSource(uiShell, "market");
  const trade = tabPanelSource(uiShell, "trade");
  const survivors = tabPanelSource(uiShell, "survivors");
  const logs = tabPanelSource(uiShell, "logs");

  for (const token of ['id="identity-card"', 'class="panel asset-panel"', 'id="portfolio-panel"', 'id="my-goal-title"', 'id="my-goal-progress"']) {
    assert.ok(home.indexOf(token) >= 0, `Home must contain ${token}`);
  }
  for (const token of ['class="panel market-panel"', 'id="intel-panel"', 'id="stock-list"']) {
    assert.ok(market.indexOf(token) >= 0, `Market must contain ${token}`);
  }
  const chartIndex = trade.indexOf('class="panel chart-panel"');
  const tradePanelIndex = trade.indexOf('class="panel trade-panel"');
  assert.ok(chartIndex >= 0, "Trade must contain the chart panel");
  assert.ok(tradePanelIndex > chartIndex, "Trade panel must follow the chart panel");
  for (const token of ['class="panel ranking-panel"', 'id="rank-search"', 'id="ranking-list"']) {
    assert.ok(survivors.indexOf(token) >= 0, `Survivors must contain ${token}`);
  }
  for (const token of ['class="panel log-panel"', 'id="log-list"']) {
    assert.ok(logs.indexOf(token) >= 0, `Logs must contain ${token}`);
  }

  assert.doesNotMatch(home, /chart-panel|trade-panel|market-panel|ranking-panel|log-panel/);
  assert.doesNotMatch(survivors, /identity-card|asset-panel|portfolio-panel/);
});

test("전투 탭 콘텐츠를 재배치하는 통합 레이아웃 초기화가 없다", async () => {
  const app = await readFile(`${root}/app.js`, "utf8");
  assert.doesNotMatch(app, /function initializeIntegratedLayout\(/);
  assert.doesNotMatch(app, /rankingBody\.append\(rankingPanel\)/);
});

test("종목 상세 패널은 열 때 임시 마운트되고 모든 닫기 경로에서 원위치로 복원된다", async () => {
  const [app, uiState] = await Promise.all([
    readFile(`${root}/app.js`, "utf8"),
    readFile(`${root}/ui-state.js`, "utf8"),
  ]);
  assert.match(app, /const stockDetailPanelOrigins = new Map\(\)/);
  assert.match(app, /function mountStockDetailPanels\(\)[\s\S]*stockDetailPanelOrigins\.has\(panel\)[\s\S]*parent: panel\.parentNode[\s\S]*nextSibling: panel\.nextSibling[\s\S]*detailBody\.append\(panel\)/);
  assert.match(app, /function restoreStockDetailPanels\(\)[\s\S]*parent\.insertBefore\(panel, nextSibling\)[\s\S]*stockDetailPanelOrigins\.clear\(\)/);
  assert.match(app, /function closeStockDetail\(\)[\s\S]*closeSheet\("stock-detail-modal"\)/);
  assert.doesNotMatch(functionSource(app, "closeStockDetail"), /restoreStockDetailPanels\(\)/);
  assert.match(app, /function openStockDetail[\s\S]*mountStockDetailPanels\(\)[\s\S]*openSheet\("stock-detail-modal"\)/);
  assert.doesNotMatch(app, /data-close-stock-detail[\s\S]*closeStockDetail\(\)/);
  assert.match(uiState, /event\.key === "Escape"[\s\S]*closeSheet\(sheet\.id\)/);
  assert.match(app, /stock-survival:sheet-close[\s\S]*stock-detail-modal[\s\S]*restoreStockDetailPanels\(\)/);
  assert.match(app, /#detail-buy[\s\S]*setTradeSide\("buy"\)[\s\S]*renderTradePanel\(\)/);
  assert.match(app, /#detail-sell[\s\S]*setTradeSide\("sell"\)[\s\S]*renderTradePanel\(\)/);
  assert.equal((app.match(/\$\("#stock-detail-modal"\)\.classList\.add\("is-hidden"\)/g) || []).length, 0);
});

test("앱이 참조하는 정적 ID가 HTML에 존재한다", async () => {
  const [html, app] = await Promise.all([readMarkup(), readFile(`${root}/app.js`, "utf8")]);
  const idMatches = [...html.matchAll(/\bid="([^"]+)"/g)];
  const allIds = idMatches.map((match) => match[1]);
  const duplicateIds = allIds.filter((id, index) => allIds.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicateIds)], []);
  const ids = new Set(allIds);
  const dynamic = new Set(["item-stock", "item-target", "item-rank"]);
  const used = new Set([...app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]));
  assert.deepEqual([...used].filter((id) => !ids.has(id) && !dynamic.has(id)), []);
});

test("고지문·체크포인트 제한시간·종목 바로가기 계약이 존재한다", async () => {
  const [html, app] = await Promise.all([readMarkup(), readFile(`${root}/app.js`, "utf8")]);
  assert.match(html, /본 서비스는 가상 주식 시뮬레이션 게임이며/);
  assert.match(app, /game\.turn % 10 === 0/);
  assert.match(app, /data-log-stock/);
  assert.match(app, /data-rank-stock/);
  assert.match(app, /amount > 0 \? "increase" : "decrease"/);
});

test("언어·프로필·쪽지·명예의 전당·탈락 UI와 밈 스프라이트가 존재한다", async () => {
  const [html, app, i18n, avatar] = await Promise.all([
    readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/i18n.js`, "utf8"), readFile(`${root}/assets/stock-meme-avatars.png`),
  ]);
  for (const id of ["language-choice", "profile-open-button", "profile-preview", "profile-modal", "profile-picker", "profile-upload", "profile-confirm", "mailbox-button", "message-modal", "hall-of-fame-list", "developer-board-button", "elimination-modal", "matchmaking-screen"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /Array\.from\(\{ length: 10 \}/);
  assert.match(app, /profile-open-button/);
  assert.match(app, /data-message-player/);
  assert.match(app, /drawHistoryChart/);
  assert.match(i18n, /MULTIPLAYER/);
  assert.ok(avatar.length > 100_000);
});

test("대화형 쪽지함·거래량 신호·달러 환산·게임 알림 계약이 존재한다", async () => {
  const [html, app, server] = await Promise.all([readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/server.mjs`, "utf8")]);
  for (const id of ["message-new", "message-recipient-panel", "message-recipient-search", "message-recipient-list", "volume-alert"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /const USD_KRW_RATE = 1_500/);
  assert.match(app, /conversationIds/);
  assert.match(app, /volumeSignal/);
  assert.match(server, /if \(!result\.finished\)[\s\S]*deliverRumor/);
  assert.match(server, /room\.game\.turn === 15/);
  assert.match(server, /깡통을 찼습니다/);
  assert.match(server, /\["waiting", "running"\]/);
});

test("모바일 메인·게임 모드·하단 메뉴·방 코드 UI가 존재하고 글자 크기 조절은 없다", async () => {
  const [html, app, styles] = await Promise.all([readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/styles.css`, "utf8")]);
  for (const id of ["game-mode-buttons", "game-room-code", "game-bottom-nav", "stock-count-title", "selected-stock-icon"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /font-controls|font-increase|font-decrease/);
  assert.doesNotMatch(app, /applyFontScale|uiScale|stock-survival-font-scale/);
  assert.doesNotMatch(styles, /\.font-controls/);
  assert.match(html, /주식 서바이벌/);
  assert.match(html, /jomoon4101@gmail\.com/);
  assert.match(app, /randomNickname/);
  assert.match(app, /stockStreak/);
  assert.match(styles, /\.logo-lockup h1 \{[^}]*white-space: nowrap/);
  assert.match(styles, /\.button-primary\s*\{[^}]*min-height:\s*56px/);
});

test("생존 상태·선택 종목·보유 종목·정보 카드와 명확한 거래 계약이 존재한다", async () => {
  const [html, app, styles, engine, server] = await Promise.all([
    readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/styles.css`, "utf8"), readFile(`${root}/engine.js`, "utf8"), readFile(`${root}/server.mjs`, "utf8"),
  ]);
  for (const id of ["survival-status", "survival-round", "survival-rank", "survival-assets", "survival-cash", "survival-risk", "survival-time", "end-turn-button", "selected-sector", "selected-owned", "selected-average", "selected-pnl", "portfolio-panel", "portfolio-list", "intel-panel", "intel-cards"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /id="player-count"|id="stock-difficulty"|id="market-filter"/);
  assert.match(html, /정보는 힘이다, 전략은 생존이다!/);
  assert.match(html, /시장 분석[\s\S]*투자 전략[\s\S]*섹터 정보[\s\S]*커뮤니티/);
  assert.match(app, /매도 불가 · 보유 수량 없음/);
  assert.match(app, /data-portfolio-stock/);
  assert.match(app, /owned-badge/);
  assert.match(app, /renderIntelCards/);
  assert.doesNotMatch(styles, /color-scheme:\s*light/);
  assert.match(engine, /playerMin: 3/);
  assert.match(engine, /playerMax: 7/);
  assert.match(engine, /playerCount: 5/);
  assert.match(engine, /quick: Object\.freeze\(\{ totalTurns: 10/);
  assert.match(engine, /standard: Object\.freeze\(\{ totalTurns: 20/);
  assert.match(engine, /long: Object\.freeze\(\{ totalTurns: 30[\s\S]*playerCount: 7[\s\S]*stockCount: 11/);
  assert.match(server, /case "end-turn"/);
});

test("모바일 우선 섹터 카드·CEO 3상태·자동 모드 계약이 존재한다", async () => {
  const ceoAssetNames = ["technology", "financials", "health-care", "consumer-discretionary", "consumer-staples", "industrials", "communication-services", "materials", "energy", "utilities", "real-estate"];
  const [html, app, engine, mobileCss, ...ceoAssets] = await Promise.all([
    readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/engine.js`, "utf8"),
    readFile(`${root}/mobile-first.css`, "utf8"), ...ceoAssetNames.map((name) => readFile(`${root}/assets/sector-ceo-${name}-v2.webp`)),
  ]);
  assert.match(html, /id="language-choice"[\s\S]*>ko<[\s\S]*>En</);
  assert.match(html, /3명 · 10라운드 · 5섹터/);
  assert.match(html, /5명 · 20라운드 · 8섹터/);
  assert.match(html, /7명 · 30라운드 · 11섹터/);
  assert.match(html, /주식 섹터/);
  assert.doesNotMatch(html, /🇺🇸|🇰🇷|🇯🇵|🇨🇳|🇪🇺/);
  assert.match(app, /ceoPresentation/);
  assert.match(app, /sectorMiniChart/);
  assert.match(app, /sector-position/);
  assert.match(app, /mood-\$\{ceo\.mood\}/);
  assert.match(mobileCss, /\.mood-up \.sector-ceo/);
  assert.match(mobileCss, /Mobile-first shell/);
  assert.match(mobileCss, /@media \(min-width: 481px\)/);
  assert.match(engine, /startPrice: 120/);
  assert.match(engine, /startPrice: 75/);
  assert.equal((engine.match(/Object\.freeze\(\{ key:/g) || []).length, 11);
  assert.equal(ceoAssets.length, 11);
  for (const asset of ceoAssets) assert.ok(asset.length > 100_000);
  for (const name of ceoAssetNames) assert.match(mobileCss, new RegExp(`sector-ceo-${name}-v2\\.webp`));
});

test("게임은 이전 버전 제한시간과 자동 턴 진행을 사용한다", async () => {
  const [html, app, engine, server, mobileCss] = await Promise.all([
    readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/engine.js`, "utf8"), readFile(`${root}/server.mjs`, "utf8"), readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  assert.match(html, /id="final-countdown"/);
  assert.match(html, /id="timer"[^>]*>01:30</);
  assert.match(app, /function renderClock/);
  assert.match(app, /setInterval\(tickClock, 100\)/);
  assert.match(server, /room\.deadline|nextTurnDeadline|TEST_TURN_MS/);
  assert.match(server, /case "end-turn"[\s\S]*allReady[\s\S]*advanceRoom/);
  assert.match(engine, /turnSeconds: 45/);
  assert.match(engine, /checkpointBonusSeconds: 30/);
  assert.match(mobileCss, /--refine-navy/);
  assert.match(mobileCss, /\.timer-wrap #turn-progress/);
  assert.match(mobileCss, /grid-auto-flow:\s*column/);
  assert.match(app, /scrollSectorRail/);
});

test("대형 드래그 섹터 카드·등급 색상·뉴스 티커·종목 상세 거래창이 존재한다", async () => {
  const [html, app, mobileCss] = await Promise.all([
    readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  for (const id of ["stock-detail-modal", "stock-detail-ceo", "stock-detail-body", "detail-buy", "detail-sell", "intel-panel", "intel-cards"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /NOW VIEWING/);
  assert.doesNotMatch(app, /initializeIntegratedLayout/);
  assert.match(app, /openStockDetail/);
  assert.match(app, /pointerdown/);
  assert.match(app, /setPointerCapture/);
  assert.match(app, /sectorLevelClass/);
  assert.match(app, /intel-feed-row/);
  assert.match(mobileCss, /\.level-high[^}]*border-color:\s*#f13b4f/);
  assert.match(mobileCss, /\.level-mid[^}]*border-color:\s*#29c987/);
  assert.match(mobileCss, /\.level-low[^}]*border-color:\s*#3c8ff0/);
  assert.match(mobileCss, /--sector-art:url/);
  assert.match(mobileCss, /\.stock-detail-body/);
});

test("섹터 거래창·생존자 순위 탭·정보 패널 동행 배치와 매 턴 찌라시 계약이 존재한다", async () => {
  const [html, app, engine, server, mobileCss] = await Promise.all([
    readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/engine.js`, "utf8"),
    readFile(`${root}/server.mjs`, "utf8"), readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  for (const id of ["rank-search", "ranking-list"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /ranking-modal|ranking-modal-body|ranking-modal-title|data-close-ranking/);
  assert.doesNotMatch(html, /data-nav-target="chart"/);
  assert.equal((html.match(/data-nav-target="ranking"/g) || []).length, 1);
  assert.doesNotMatch(app, /openRankingModal|closeSheet\("ranking-modal"\)/);
  assert.match(app, /data-stock-index[\s\S]*data-open-stock-detail/);
  assert.doesNotMatch(app, /sector-open-button/);
  assert.match(app, /activateAppView\(button\.dataset\.appTab\)/);
  assert.match(app, /case "survivors":[\s\S]*renderRanking\(\)/);
  assert.match(app, /case "trade":[\s\S]*renderTradePanel\(\)[\s\S]*renderOrders\(\)[\s\S]*renderFinance\(\)[\s\S]*renderItems\(\)/);
  assert.match(app, /if \(!result\.finished && !myPlayer\(\)\.eliminated\) deliverLocalRumor/);
  assert.match(engine, /const isAccurate = rng\.next\(\) < 0\.68/);
  assert.doesNotMatch(server, /player\.rumorImmune\) return false/);
  assert.match(server, /if \(!result\.finished\)[\s\S]*room\.members\.forEach[\s\S]*deliverRumor/);
  assert.doesNotMatch(mobileCss, /\.ranking-modal-card/);
  assert.match(mobileCss, /\.game-bottom-nav\s*\{[^}]*grid-template-columns:\s*repeat\(5/);
});

test("거래 섹터 전환·명시적 카드 버튼·찌라시 알림·공시 링크·내 목표가 존재한다", async () => {
  const [html, app, mobileCss] = await Promise.all([
    readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  for (const id of ["stock-detail-sector-list", "my-goal-kicker", "my-goal-title", "my-goal-detail", "my-goal-progress"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /<article class="stock-row sector-card/);
  assert.match(app, /data-open-stock-detail/);
  assert.match(app, /function renderStockDetailSectorPicker/);
  assert.match(app, /data-detail-stock-index/);
  assert.match(html, /id="stock-detail-modal"[\s\S]*data-close-stock-detail/);
  assert.match(html, /app\.js\?v=20260704-01/);
  assert.match(app, /function announceNewRumorMessages/);
  assert.match(app, /새 찌라시가 도착했습니다/);
  assert.match(app, /data-intel-stock/);
  assert.match(app, /data-intel-rumor/);
  assert.equal((app.match(/tagKo:/g) || []).length, 12);
  assert.equal((html.match(/id="intel-panel"/g) || []).length, 1);
  assert.ok(html.indexOf('id="intel-panel"') > html.indexOf('class="market-tools"'));
  assert.ok(html.indexOf('id="intel-panel"') < html.indexOf('class="stock-table-head"'));
  assert.doesNotMatch(app, /intelPanel[\s\S]*insertAdjacentElement/);
  assert.match(app, /const latestMarket/);
  assert.match(app, /const latestDisclosure/);
  assert.match(app, /const latestRumor/);
  assert.match(app, /"\[시장\]"/);
  assert.match(app, /"\[공시\]"/);
  assert.match(app, /"\[찌라시\]"/);
  assert.match(app, /data-stock-index="\$\{index\}" data-open-stock-detail="\$\{index\}"/);
  assert.match(app, /if \(sectorRailClickSuppressed\)[\s\S]*closest\("\[data-open-stock-detail\]"\)/);
  assert.match(app, /shouldOpenCard[\s\S]*openStockDetail\(drag\.stockIndex\)/);
  assert.match(mobileCss, /\.intel-report-tag/);
  assert.match(app, /OVERTAKE #/);
  assert.doesNotMatch(mobileCss, /\.sector-open-button/);
  assert.match(mobileCss, /\.sector-card-heading[^}]*position:\s*absolute/);
  assert.match(mobileCss, /\.modal-backdrop\s*\{[^}]*z-index:\s*110/);
  assert.match(mobileCss, /\.sector-company b\s*\{[^}]*font-size:\s*23px/);
  assert.match(mobileCss, /\.sector-position small[^}]*font-size:\s*10px/);
  assert.match(mobileCss, /\.intel-change-value\.up[^}]*#d5233b/);
  assert.match(mobileCss, /\.intel-change-value\.down[^}]*#1768d4/);
  assert.match(app, /intel-feed-row news[\s\S]*intel-feed-row report[\s\S]*intel-feed-row rumor/);
  assert.match(mobileCss, /grid-template-rows:\s*repeat\(3,\s*44px\)/);
  assert.match(html, /class="intel-title-block"[\s\S]*생존 정보 센터[\s\S]*id="open-intel-messages"/);
  assert.match(mobileCss, /\.holding-actions \.quick-buy[^}]*background:\s*var\(--red-main\)/);
  assert.match(mobileCss, /\.holding-actions \.quick-sell[^}]*background:\s*var\(--blue-main\)/);
  assert.match(mobileCss, /\.holding-flag[^}]*background:\s*var\(--bg-panel-2\)/);
  assert.match(mobileCss, /\.stock-detail-character\s*\{[^}]*min-height:\s*108px/);
  assert.match(mobileCss, /\.stock-detail-body \.chart-wrap\s*\{[^}]*height:\s*210px/);
});

test("모든 참가자가 공유하는 하단 전체 채팅 계약이 존재한다", async () => {
  const [html, app, server, mobileCss, aiChat] = await Promise.all([
    readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/server.mjs`, "utf8"), readFile(`${root}/mobile-first.css`, "utf8"), readFile(`${root}/ai-chat.js`, "utf8"),
  ]);
  for (const id of ["global-chat", "global-chat-toggle", "global-chat-unread", "global-chat-sheet", "global-chat-messages", "global-chat-input", "global-chat-send"]) {
    assert.equal((html.match(new RegExp(`id="${id}"`, "g")) || []).length, 1);
  }
  assert.match(app, /function renderGlobalChat/);
  assert.match(app, /function sendGlobalChatMessage/);
  assert.match(app, /sendAction\("send-global-message"/);
  assert.match(app, /message\.system === "global" \|\| message\.toId === "ALL"/);
  assert.match(server, /function sendGlobalMessage/);
  assert.match(server, /case "send-global-message"/);
  assert.match(server, /message\.toId === "ALL"/);
  assert.match(server, /function scheduleAiConversation/);
  assert.match(app, /function scheduleLocalAiConversation/);
  assert.match(aiChat, /truthful = random\(\) < 0\.62/);
  assert.match(aiChat, /createAiConversationPlan/);
  assert.match(mobileCss, /\.global-chat\s*\{[^}]*position:\s*fixed/);
  assert.match(mobileCss, /\.global-chat-sheet\s*\{/);
});

test("진행 중 서바이벌 바로 참여 목록과 한 줄 차트 타이틀이 존재한다", async () => {
  const [html, app, styles, server] = await Promise.all([
    readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/styles.css`, "utf8"), readFile(`${root}/server.mjs`, "utf8"),
  ]);
  for (const id of ["active-survival-title", "active-survival-list", "active-survival-refresh"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<h1 id="start-title"><em>주식<\/em>서바이벌<\/h1>/);
  assert.doesNotMatch(html, /<h1 id="start-title">[^<]*<em>주식<\/em><br>/);
  assert.match(html, /logo-mark[^>]*>[\s\S]*?<svg/);
  assert.match(styles, /\.logo-lockup h1 \{[^}]*white-space: nowrap/);
  assert.match(app, /joinOnlineRoom\(button\.dataset\.activeRoomCode\)/);
  assert.match(app, /setInterval\([\s\S]*loadActiveRooms/);
  assert.match(app, /Array\.isArray\(data\)[\s\S]*Array\.isArray\(data\?\.rooms\)/);
  assert.match(app, /현재 참여 가능한 서바이벌이 없습니다/);
  assert.match(app, /방 목록을 불러오지 못했습니다\. 새로고침 후 다시 시도해주세요/);
  assert.match(app, /DEFAULT_RENDER_API_BASE_URL/);
  assert.match(server, /pathname === "\/api\/rooms\/active"/);
  assert.match(server, /reservedRoomPaths/);
  assert.match(server, /존재하지 않는 API 경로입니다/);
  assert.match(server, /room\.status === "running"/);
});

test("dark mobile SLG tokens and readable control sizes exist", async () => {
  const [styles, mobileCss] = await Promise.all([
    readFile(`${root}/styles.css`, "utf8"),
    readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  assert.match(styles, /--bg-main:\s*#070b14/);
  assert.match(styles, /--text-main:\s*#f8fafc/);
  assert.match(styles, /--red-main:\s*#ef233c/);
  assert.match(styles, /body\s*\{[^}]*\bfont:\s*[^;}]*\b14px\b/);
  assert.match(mobileCss, /\.app-tab\s*\{[^}]*\bmin-height:\s*48px/);
});
