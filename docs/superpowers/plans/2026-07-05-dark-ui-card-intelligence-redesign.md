# Dark UI, Sector Card, and Intelligence Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the conflicting light/dark CSS cascade with one canonical dark mobile UI, improve unread badges, simplify sector cards, and render one latest keyword-only item in each intelligence row.

**Architecture:** Keep the existing DOM IDs, game state, server protocol, and command functions. Consolidate visual ownership into `styles.css` for tokens/components and `mobile-first.css` for layout only, then make small renderer changes in `app.js` for sector cards and the three-row intelligence feed.

**Tech Stack:** Vanilla JavaScript ES modules, semantic HTML, CSS custom properties, Node built-in test runner, existing Node HTTP/SSE server.

---

## File map

- Modify `styles.css`: canonical dark tokens and shared component surfaces; remove light-theme and duplicate cascade blocks.
- Modify `mobile-first.css`: mobile/desktop layout, safe-area, fixed navigation, sector-card positioning, compact intelligence rows.
- Modify `app.js`: remove the duplicate sector trade button, position the sector label as the first overlay, select one latest market/disclosure/rumor item, keep card and intelligence click flows.
- Modify `i18n.js`: add any new direction/empty-state labels required by the compact feed.
- Modify `tests/mobile-slg-ui.test.js`: dark-surface, badge, sector-card, latest-intelligence, responsive contracts.
- Modify `tests/ui-contract.test.js`: replace obsolete legacy-cascade assertions with canonical stylesheet assertions.
- Create `WORK_COMPLETION_REPORT_2026-07-05_25.md`: implementation, verification, and remaining browser limitations.

## Task 1: Lock the screenshot regression contract

**Files:**
- Modify: `tests/mobile-slg-ui.test.js`
- Modify: `tests/ui-contract.test.js`

- [ ] **Step 1: Add failing dark-surface and badge tests**

Append tests that assert the final styles own the visible surfaces instead of relying on a later override:

```js
test("canonical dark panels contain no light menu or header surface", async () => {
  const [styles, mobile] = await Promise.all([
    readFile(`${root}/styles.css`, "utf8"),
    readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  assert.doesNotMatch(styles, /\.panel\s*\{[^}]*background:\s*(?:white|#fff)/);
  assert.doesNotMatch(mobile, /\.panel-header\s*\{[^}]*background:\s*linear-gradient\([^}]*#fff/);
  assert.match(styles, /\.panel,\.game-card\s*\{[^}]*background:\s*var\(--bg-panel\)/);
  assert.match(styles, /\.panel-header\s*\{[^}]*background:\s*var\(--bg-panel-2\)/);
});

test("message and notification badges use a readable mobile size", async () => {
  const styles = await readFile(`${root}/styles.css`, "utf8");
  assert.match(styles, /#mail-unread,#notice-unread,#global-chat-unread\s*\{(?=[^}]*min-width:\s*18px)(?=[^}]*height:\s*18px)(?=[^}]*font-size:\s*11px)(?=[^}]*font-weight:\s*900)[^}]*\}/);
});
```

- [ ] **Step 2: Add failing sector-card and intelligence tests**

```js
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
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
node --test tests/mobile-slg-ui.test.js tests/ui-contract.test.js
```

Expected: failures for light surfaces, 18px badges, duplicate card button, and multi-item intelligence.

- [ ] **Step 4: Commit the failing contracts**

```powershell
git add tests/mobile-slg-ui.test.js tests/ui-contract.test.js
git commit -m "test: define dark mobile cleanup contract"
```

## Task 2: Replace the conflicting CSS cascade

**Files:**
- Replace: `styles.css`
- Replace: `mobile-first.css`
- Test: `tests/mobile-slg-ui.test.js`
- Test: `tests/ui-contract.test.js`

- [ ] **Step 1: Replace `styles.css` with canonical tokens and shared surfaces**

Keep every selector referenced by `ui-shell.js` and `app.js`, but define each component family once. The canonical top-level contract starts with:

```css
:root {
  color-scheme: dark;
  --bg-main:#070b14;
  --bg-panel:#101827;
  --bg-panel-2:#162033;
  --bg-input:#0b1220;
  --line-soft:rgba(255,255,255,.09);
  --text-main:#f8fafc;
  --text-sub:#a8b5c7;
  --text-muted:#718096;
  --red-main:#ef233c;
  --blue-main:#2f80ed;
  --gold-main:#f2b84b;
  --green-main:#2dd4bf;
  --warning:#f59e0b;
}

* { box-sizing:border-box; }
html,body { min-width:320px; min-height:100%; margin:0; background:#02050b; }
body { color:var(--text-main); font:500 14px/1.5 -apple-system,BlinkMacSystemFont,"Noto Sans KR","Segoe UI",sans-serif; }
.panel,.game-card { border:1px solid var(--line-soft); background:var(--bg-panel); color:var(--text-main); }
.panel-header { min-height:58px; padding:12px 14px; border-bottom:1px solid var(--line-soft); background:var(--bg-panel-2); color:var(--text-main); }
input,select,textarea { min-height:48px; border:1px solid var(--line-soft); background:var(--bg-input); color:var(--text-main); }
```

Delete all light declarations such as `.panel { background:white; }`, white panel-header gradients, `#fbfdff` portfolio cards, and legacy intelligence `#fff/#f8fbfe` surfaces. Preserve component behavior selectors for charts, modals, rankings, messages, cards, controls, onboarding, and fallback art.

- [ ] **Step 2: Replace `mobile-first.css` with layout-only rules**

Use one 480px shell and responsive rules without recoloring components:

```css
#stock-survival-root,.start-screen,.matchmaking-screen,.lobby-screen,.mobile-app-shell {
  width:min(100%,480px);
  margin-inline:auto;
}
.battle-hud { position:sticky; top:0; z-index:20; }
.game-bottom-nav { position:fixed; left:50%; bottom:0; width:min(100%,480px); transform:translateX(-50%); padding-bottom:env(safe-area-inset-bottom); }
.turn-action-bar { position:fixed; left:50%; bottom:calc(68px + env(safe-area-inset-bottom)); width:min(100%,480px); transform:translateX(-50%); }
@media (max-width:390px) { .screen-content { padding-inline:10px; } }
@media (min-width:391px) and (max-width:430px) { .screen-content { padding-inline:14px; } }
@media (min-width:481px) { body { background:radial-gradient(circle at 50% 0,#162033,#02050b 64%); } }
```

Retain safe-area, fixed action/nav offsets, modal sheet sizing, sector rail overflow, and 48px touch targets. Remove all duplicate light/dark cascade comments and rules.

- [ ] **Step 3: Add readable badge styling**

```css
.identity-actions { display:flex; gap:8px; }
.identity-actions button,.chat-fab { position:relative; }
#mail-unread,#notice-unread,#global-chat-unread {
  position:absolute;
  top:-7px;
  right:-7px;
  display:grid;
  place-items:center;
  min-width:18px;
  height:18px;
  padding:0 4px;
  border:2px solid var(--bg-panel);
  border-radius:999px;
  background:var(--red-main);
  color:#fff;
  font-size:11px;
  font-weight:900;
  line-height:1;
}
```

- [ ] **Step 4: Run focused and full tests**

```powershell
node --test tests/mobile-slg-ui.test.js tests/ui-contract.test.js
npm.cmd test
```

Expected: dark-surface and badge contracts pass; existing behavior tests remain green.

- [ ] **Step 5: Commit the canonical styles**

```powershell
git add styles.css mobile-first.css
git commit -m "refactor: consolidate dark mobile styles"
```

## Task 3: Simplify sector cards

**Files:**
- Modify: `app.js` in `renderMarket()`
- Modify: `styles.css`
- Modify: `mobile-first.css`
- Test: `tests/mobile-slg-ui.test.js`

- [ ] **Step 1: Verify the sector-card test is still RED**

```powershell
node --test --test-name-pattern="sector card owns" tests/mobile-slg-ui.test.js
```

Expected: FAIL because `.sector-open-button` still exists.

- [ ] **Step 2: Remove the duplicate button and make the heading the first overlay**

Replace the beginning of the card template with:

```js
return `
<article class="stock-row sector-card sector-${stock.sectorKey} mood-${ceo.mood} ${index === selectedStock ? "is-active" : ""}" data-stock-index="${index}" data-open-stock-detail="${index}" role="listitem" tabindex="0" aria-label="${escapeHtml(stock.sector)} · ${escapeHtml(stock.name)} · ${percent(change)} · ${getLanguage() === "en" ? "open trading window" : "거래창 열기"}">
  <span class="sector-card-heading"><em>${stock.icon || "▦"} ${escapeHtml(stock.sector)}</em>${owned ? `<i class="owned-badge">${getLanguage() === "en" ? "OWNED" : "보유중"}</i>` : ""}</span>
  <span class="sector-ceo ${ceo.className} ${sectorArtFallbackClass(stock)}" ...>${sectorArtProbeMarkup(stock)}</span>
`;
```

Do not introduce another nested action button. Preserve the existing delegated click and keyboard handlers that consume `[data-open-stock-detail]`.

- [ ] **Step 3: Position the heading without covering the CEO**

```css
.sector-card { position:relative; padding-top:54px; cursor:pointer; }
.sector-card-heading {
  position:absolute;
  top:12px;
  left:12px;
  z-index:4;
  display:flex;
  align-items:center;
  gap:7px;
  max-width:calc(100% - 24px);
  padding:7px 10px;
  border:1px solid rgba(255,255,255,.12);
  border-radius:9px;
  background:rgba(7,11,20,.86);
  color:var(--text-main);
  font-size:15px;
  font-weight:900;
}
.sector-card::before { content:""; position:absolute; inset:0 0 auto; height:86px; background:linear-gradient(180deg,rgba(0,0,0,.72),transparent); pointer-events:none; }
```

- [ ] **Step 4: Run focused and full tests**

```powershell
node --test --test-name-pattern="sector card owns" tests/mobile-slg-ui.test.js
npm.cmd test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app.js styles.css mobile-first.css tests/mobile-slg-ui.test.js
git commit -m "refactor: simplify sector card action"
```

## Task 4: Render one latest keyword-only intelligence item per row

**Files:**
- Modify: `app.js` in `renderIntelCards()`
- Modify: `styles.css`
- Modify: `mobile-first.css`
- Modify: `i18n.js`
- Test: `tests/mobile-slg-ui.test.js`

- [ ] **Step 1: Verify the intelligence test is RED**

```powershell
node --test --test-name-pattern="intelligence renders one latest" tests/mobile-slg-ui.test.js
```

Expected: FAIL because each category renders up to three entries.

- [ ] **Step 2: Select exactly one latest item for each category**

At the start of `renderIntelCards()` use:

```js
const price = stock.prices[Math.max(0, game.turn - 1)];
const previous = stock.prices[Math.max(0, game.turn - 2)] || price;
const marketChange = previous ? price / previous - 1 : 0;
const latestMarket = {
  turn: game.turn,
  change: marketChange,
  direction: marketChange > 0 ? "up" : marketChange < 0 ? "down" : "flat",
};

const reportTurn = Math.max(1, game.turn);
const templateIndex = Math.abs((Number(game.seed) + reportTurn * 17 + selectedStock * 31) % DISCLOSURE_TEMPLATES.length);
const latestDisclosure = {
  stockIndex: selectedStock,
  stock,
  reportTurn,
  disclosure: DISCLOSURE_TEMPLATES[templateIndex],
};

const latestRumor = [...(game.messages || [])]
  .filter((message) => message.system === "rumor" && message.toId === viewerId)
  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
```

- [ ] **Step 3: Render three compact keyword rows in fixed order**

```js
const directionLabel = (direction) => direction === "up"
  ? (english ? "UP" : "상승")
  : direction === "down" ? (english ? "DOWN" : "하락") : (english ? "FLAT" : "보합");
const rumorStock = latestRumor ? game.stocks[latestRumor.stockIndex] : null;
const rumorDirection = latestRumor?.direction === "up" ? "up" : latestRumor?.direction === "down" ? "down" : "flat";

$("#intel-cards").innerHTML = `
  <div class="intel-feed-row news"><b class="intel-category">${english ? "[MARKET]" : "[시장]"}</b><button class="intel-latest-card" type="button" data-intel-stock="${selectedStock}"><span>${escapeHtml(stock.sector)}</span><strong class="intel-change-value ${latestMarket.direction}">${directionLabel(latestMarket.direction)} · ${percent(latestMarket.change)}</strong></button></div>
  <div class="intel-feed-row report"><b class="intel-category">${english ? "[DISCLOSURE]" : "[공시]"}</b><button class="intel-latest-card" type="button" data-intel-stock="${selectedStock}"><span class="intel-report-tag">${english ? latestDisclosure.disclosure.tagEn : latestDisclosure.disclosure.tagKo}</span><strong>${escapeHtml(stock.sector)}</strong></button></div>
  <div class="intel-feed-row rumor"><b class="intel-category">${english ? "[RUMOR]" : "[찌라시]"}</b>${latestRumor ? `<button class="intel-latest-card" type="button" data-intel-rumor><span>${escapeHtml(rumorStock?.sector || (english ? "Market" : "시장"))}</span><strong class="intel-change-value ${rumorDirection}">${directionLabel(rumorDirection)} ${english ? "hint" : "암시"}</strong></button>` : `<div class="intel-latest-card is-empty"><span>${english ? "No new rumor" : "새 찌라시 없음"}</span></div>`}</div>`;
```

Keep the existing `#intel-cards` delegated handler for `data-intel-stock` and `data-intel-rumor`.

- [ ] **Step 4: Make each row 40–44px high**

```css
.intel-cards { display:grid; grid-template-rows:repeat(3,44px); gap:1px; padding:0; background:var(--line-soft); }
.intel-feed-row { min-width:0; display:grid; grid-template-columns:72px minmax(0,1fr); min-height:44px; background:var(--bg-panel); }
.intel-category { display:grid; place-items:center; padding:0 8px; font-size:11px; }
.intel-latest-card { min-width:0; min-height:44px; display:flex; align-items:center; gap:8px; padding:0 10px; border:0; background:var(--bg-panel-2); color:var(--text-main); text-align:left; }
.intel-latest-card > span,.intel-latest-card > strong { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.intel-latest-card > strong { margin-left:auto; }
```

- [ ] **Step 5: Run tests**

```powershell
node --test tests/mobile-slg-ui.test.js tests/ui-contract.test.js
npm.cmd test
```

Expected: all three rows render once, in order, and all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add app.js styles.css mobile-first.css i18n.js tests/mobile-slg-ui.test.js
git commit -m "feat: compact latest survival intelligence"
```

## Task 5: Build, browser verification, and completion report

**Files:**
- Create: `WORK_COMPLETION_REPORT_2026-07-05_25.md`
- Modify only if browser failures are reproduced: `styles.css`, `mobile-first.css`, `app.js`

- [ ] **Step 1: Run fresh automated verification**

```powershell
node --check app.js
node --check ui-shell.js
node --check ui-state.js
node --check i18n.js
npm.cmd test
npm.cmd run build
git diff --check
```

Expected: all commands exit 0 and the suite reports no failures.

- [ ] **Step 2: Verify screenshots at required widths**

Start `npm.cmd run dev`. At 390px, 412px, 430px, and 1280px verify:

- no white panel/menu/header/search surfaces;
- no horizontal page overflow;
- unread badges are readable and do not overlap icons;
- sector name occupies the former top-left button position without covering CEO art;
- no duplicate `거래창 열기` button appears;
- intelligence is exactly three 44px rows in market/disclosure/rumor order;
- each row contains only one latest keyword item;
- card click, Enter/Space, intelligence stock click, and rumor inbox still work;
- console errors and failed required image requests are zero.

- [ ] **Step 3: Fix any reproduced browser issue with a failing test first**

For each issue, add one minimal regression assertion to `tests/mobile-slg-ui.test.js`, verify RED, apply the smallest CSS/renderer fix, and re-run the focused test before continuing.

- [ ] **Step 4: Write the completion report**

Create `WORK_COMPLETION_REPORT_2026-07-05_25.md` containing:

- the five requested changes;
- root causes of the white cascade and oversized feed;
- automated test count and build result;
- viewport/browser results or an explicit NOT DONE limitation;
- preserved game/server behavior;
- remaining limitations.

- [ ] **Step 5: Final commit**

```powershell
git add WORK_COMPLETION_REPORT_2026-07-05_25.md
git commit -m "docs: report dark UI cleanup completion"
```
