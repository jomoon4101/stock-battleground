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

test("앱이 참조하는 정적 ID가 HTML에 존재한다", async () => {
  const [html, app] = await Promise.all([readMarkup(), readFile(`${root}/app.js`, "utf8")]);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
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
  assert.match(styles, /@media \(max-width: 520px\)/);
  assert.match(styles, /position: fixed; left: 0; right: 0; bottom: 0/);
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
  assert.match(styles, /color-scheme: light/);
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
  assert.match(mobileCss, /@media \(min-width: 900px\)/);
  assert.doesNotMatch(mobileCss.split("@media (min-width: 900px)")[0], /@media \(max-width:/);
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
  assert.match(mobileCss, /grid-auto-flow: column/);
  assert.match(app, /scrollSectorRail/);
});

test("대형 드래그 섹터 카드·등급 색상·뉴스 티커·종목 상세 거래창이 존재한다", async () => {
  const [html, app, mobileCss] = await Promise.all([
    readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  for (const id of ["stock-detail-modal", "stock-detail-ceo", "stock-detail-body", "detail-buy", "detail-sell", "intel-panel", "intel-cards"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /NOW VIEWING/);
  assert.match(app, /initializeIntegratedLayout/);
  assert.match(app, /openStockDetail/);
  assert.match(app, /pointerdown/);
  assert.match(app, /setPointerCapture/);
  assert.match(app, /sectorLevelClass/);
  assert.match(app, /intel-ticker-item/);
  assert.match(mobileCss, /\.level-high[^}]*border-color: #f13b4f/);
  assert.match(mobileCss, /\.level-mid[^}]*border-color: #29c987/);
  assert.match(mobileCss, /\.level-low[^}]*border-color: #3c8ff0/);
  assert.match(mobileCss, /--sector-art:url/);
  assert.match(mobileCss, /\.stock-detail-body/);
});

test("섹터 거래창·순위 모달·정보 패널 동행 배치와 매 턴 찌라시 계약이 존재한다", async () => {
  const [html, app, engine, server, mobileCss] = await Promise.all([
    readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/engine.js`, "utf8"),
    readFile(`${root}/server.mjs`, "utf8"), readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  for (const id of ["ranking-modal", "ranking-modal-body", "rank-search", "ranking-list"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.doesNotMatch(html, /data-nav-target="chart"/);
  assert.equal((html.match(/data-nav-target="ranking"/g) || []).length, 1);
  assert.ok(html.indexOf('id="ranking-modal"') > html.indexOf('</main>'));
  assert.match(app, /data-stock-index[\s\S]*sector-open-button/);
  assert.match(app, /target === "ranking"[\s\S]*openRankingModal/);
  assert.match(app, /target === "trade"[\s\S]*openStockDetail/);
  assert.match(app, /if \(!result\.finished && !myPlayer\(\)\.eliminated\) deliverLocalRumor/);
  assert.match(engine, /const isAccurate = rng\.next\(\) < 0\.68/);
  assert.doesNotMatch(server, /player\.rumorImmune\) return false/);
  assert.match(server, /if \(!result\.finished\)[\s\S]*room\.members\.forEach[\s\S]*deliverRumor/);
  assert.match(mobileCss, /\.ranking-modal-card/);
  assert.match(mobileCss, /grid-template-columns: minmax\(0,1fr\) 370px/);
  assert.match(mobileCss, /\.game-bottom-nav \{ grid-template-columns: repeat\(6/);
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
  assert.match(app, /#stock-detail-modal[\s\S]*data-close-stock-detail/);
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
  assert.match(app, /Math\.min\(3, game\.stocks\.length\)/);
  assert.match(app, /disclosureEntries\.map/);
  assert.match(app, /intel-trade-link/);
  assert.match(app, /"\[시장\]"/);
  assert.match(app, /"\[공시\]"/);
  assert.match(app, /"\[찌라시\]"/);
  assert.match(app, /data-stock-index="\$\{index\}" data-open-stock-detail="\$\{index\}"/);
  assert.match(app, /if \(sectorRailClickSuppressed\)[\s\S]*closest\("\[data-open-stock-detail\]"\)/);
  assert.match(app, /shouldOpenCard[\s\S]*openStockDetail\(drag\.stockIndex\)/);
  assert.match(mobileCss, /\.intel-report-tag/);
  assert.match(app, /OVERTAKE #/);
  assert.match(mobileCss, /\.sector-open-button[\s\S]*top: 12px;[\s\S]*left: 12px/);
  assert.match(mobileCss, /\.modal-backdrop \{ z-index: 110/);
  assert.match(mobileCss, /\.sector-company b \{ font-size: 23px/);
  assert.match(mobileCss, /\.sector-position small[^}]*font-size: 10px/);
  assert.match(mobileCss, /\.intel-change-value\.up[^}]*#d5233b/);
  assert.match(mobileCss, /\.intel-change-value\.down[^}]*#1768d4/);
  assert.match(app, /intel-feed-row news[\s\S]*intel-feed-row report[\s\S]*intel-feed-row rumor/);
  assert.match(mobileCss, /\.intel-feed-card\.age-1[^}]*opacity: \.82/);
  assert.match(mobileCss, /\.intel-feed-card\.age-2[^}]*opacity: \.68/);
  assert.match(mobileCss, /grid-template-rows: repeat\(3,minmax\(58px,auto\)\)/);
  assert.match(html, /class="intel-title-block"[\s\S]*생존 정보 센터[\s\S]*id="open-intel-messages"/);
  assert.match(mobileCss, /\.holding-actions \.quick-buy[^}]*background: #fff0f2/);
  assert.match(mobileCss, /\.holding-actions \.quick-sell[^}]*background: #edf5ff/);
  assert.match(mobileCss, /\.holding-flag[^}]*background: #e8f1fa/);
  assert.match(mobileCss, /\.stock-detail-character \{[\s\S]*min-height: 108px/);
  assert.match(mobileCss, /\.stock-detail-body \.chart-wrap \{ height: 210px/);
});

test("모든 참가자가 공유하는 하단 전체 채팅 계약이 존재한다", async () => {
  const [html, app, server, mobileCss, aiChat] = await Promise.all([
    readMarkup(), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/server.mjs`, "utf8"), readFile(`${root}/mobile-first.css`, "utf8"), readFile(`${root}/ai-chat.js`, "utf8"),
  ]);
  for (const id of ["global-chat", "global-chat-toggle", "global-chat-unread", "global-chat-messages", "global-chat-input", "global-chat-send"]) assert.match(html, new RegExp(`id="${id}"`));
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
  assert.match(mobileCss, /\.global-chat \{ position: fixed/);
  assert.match(mobileCss, /\.global-chat\.is-collapsed/);
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
