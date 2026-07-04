# Mobile SLG Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing bright dashboard UI with a max-480px dark mobile SLG app shell while preserving every game, multiplayer, trading, messaging, and localization behavior.

**Architecture:** Keep `engine.js`, `server.mjs`, network payloads, and game-state semantics unchanged. Mount a new static UI shell before `app.js` attaches events, move presentation-only tab/sheet state into focused UI modules, and adapt the existing render and command functions to the new five-tab interface.

**Tech Stack:** Vanilla ES modules, semantic HTML, CSS custom properties, Node built-in test runner, existing Node HTTP/SSE server.

---

## File map

- Create `ui-shell.js`: complete static markup for start, matchmaking, lobby, battle tabs, sheets, and modals.
- Create `ui-state.js`: active tab and open-sheet state with DOM visibility and accessibility synchronization.
- Create `tests/mobile-slg-ui.test.js`: structural, accessibility, image-fallback, and build-contract tests.
- Modify `index.html`: reduce to document metadata, app root, stylesheet links, and app module entry.
- Modify `app.js`: mount the shell, route existing renderers to new containers, use five-tab state, and connect chat/sheets.
- Replace `styles.css`: dark SLG design tokens and common app/card/control/sheet styles.
- Replace `mobile-first.css`: 390/412/430/480 viewport, safe-area, tab, HUD, action bar, and fallback-image rules.
- Modify `i18n.js`: translations for new labels, tabs, empty states, and sheet controls.
- Modify `scripts/build.mjs`: copy the two new UI modules into `dist`.
- Modify `tests/ui-contract.test.js`: remove obsolete bright-dashboard contracts and retain feature behavior contracts.
- Modify `README.md`: describe the new mobile app shell and controls.
- Create `WORK_COMPLETION_REPORT_2026-07-04_24.md`: final implementation and verification report.

## Task 1: Lock the new UI contract

**Files:**
- Create: `tests/mobile-slg-ui.test.js`
- Modify: `tests/ui-contract.test.js`

- [ ] **Step 1: Write the failing app-shell test**

Create `tests/mobile-slg-ui.test.js` with these assertions:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("mobile SLG shell exposes the five real battle tabs", async () => {
  const [html, shell, state] = await Promise.all([
    readFile(`${root}/index.html`, "utf8"),
    readFile(`${root}/ui-shell.js`, "utf8"),
    readFile(`${root}/ui-state.js`, "utf8"),
  ]);
  assert.match(html, /id="stock-survival-root"/);
  for (const tab of ["home", "market", "trade", "survivors", "logs"]) {
    assert.match(shell, new RegExp(`data-app-tab="${tab}"`));
    assert.match(shell, new RegExp(`data-tab-panel="${tab}"`));
  }
  assert.match(state, /aria-current/);
  assert.match(state, /hidden = panel\.dataset\.tabPanel !== activeTab/);
});

test("battle HUD, action bar, compact chat and image fallback contracts exist", async () => {
  const [shell, mobileCss] = await Promise.all([
    readFile(`${root}/ui-shell.js`, "utf8"),
    readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  for (const id of ["battle-hud", "end-turn-button", "open-trade-button", "global-chat-toggle", "global-chat-sheet"]) {
    assert.match(shell, new RegExp(`id="${id}"`));
  }
  assert.match(mobileCss, /max-width: 480px/);
  assert.match(mobileCss, /width: 44px;[\s\S]*height: 44px/);
  assert.match(mobileCss, /sector-art-fallback/);
  assert.match(mobileCss, /env\(safe-area-inset-bottom\)/);
});
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run:

```powershell
node --test tests/mobile-slg-ui.test.js
```

Expected: FAIL because `ui-shell.js` and `ui-state.js` do not exist.

- [ ] **Step 3: Replace obsolete light-theme assertions**

In `tests/ui-contract.test.js`, replace the final `v2 밝은 입력 표면...` test with:

```js
test("dark mobile SLG tokens and readable control sizes exist", async () => {
  const [styles, mobileCss] = await Promise.all([
    readFile(`${root}/styles.css`, "utf8"),
    readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  assert.match(styles, /--bg-main: #070b14/);
  assert.match(styles, /--text-main: #f8fafc/);
  assert.match(styles, /--red-main: #ef233c/);
  assert.match(styles, /font-size: 14px/);
  assert.match(mobileCss, /min-height: 48px/);
});
```

- [ ] **Step 4: Confirm both contract files still fail only for missing implementation**

Run:

```powershell
node --test tests/mobile-slg-ui.test.js tests/ui-contract.test.js
```

Expected: FAIL on the new mobile SLG contracts, with existing behavior tests still passing.

## Task 2: Mount a complete mobile app shell

**Files:**
- Create: `ui-shell.js`
- Modify: `index.html`
- Modify: `app.js`
- Modify: `scripts/build.mjs`
- Test: `tests/mobile-slg-ui.test.js`

- [ ] **Step 1: Add the root and template anchor to `index.html`**

Keep the current metadata and replace the body markup with:

```html
<body>
  <main id="stock-survival-root"></main>
  <template id="stock-survival-template"></template>
  <div class="toast-region" id="toast-region" aria-live="polite"></div>
  <script type="module" src="app.js?v=20260704-01"></script>
</body>
```

Update both stylesheet query versions to `20260704-01`.

- [ ] **Step 2: Create `ui-shell.js` with deterministic mounting**

Use a `<template>` in `index.html` so the complete static markup remains inspectable while the shell is mounted before event binding. Create `ui-shell.js` with:

```js
export function mountAppShell(root = document.querySelector("#stock-survival-root")) {
  if (!root) throw new Error("주식서바이벌 앱 루트를 찾을 수 없습니다.");
  const template = document.querySelector("#stock-survival-template");
  if (!(template instanceof HTMLTemplateElement)) throw new Error("주식서바이벌 UI 템플릿을 찾을 수 없습니다.");
  root.replaceChildren(template.content.cloneNode(true));
  template.remove();
  return root;
}
```

In `index.html`, place the rewritten start, matchmaking, lobby, battle, and modal markup inside `<template id="stock-survival-template">`. Move every control currently referenced by `app.js` into that template without changing its ID. The battle section must contain these exact panels:

```html
<section class="battle-tab-panel" id="tab-home" data-tab-panel="home"></section>
<section class="battle-tab-panel" id="tab-market" data-tab-panel="market" hidden></section>
<section class="battle-tab-panel" id="tab-trade" data-tab-panel="trade" hidden></section>
<section class="battle-tab-panel" id="tab-survivors" data-tab-panel="survivors" hidden></section>
<section class="battle-tab-panel" id="tab-logs" data-tab-panel="logs" hidden></section>
```

The complete shell must preserve every ID referenced by `app.js`; verify using the existing static-ID contract after mounting-source parsing is updated.

- [ ] **Step 3: Mount before any DOM lookup or listener**

At the top of `app.js`:

```js
import { mountAppShell } from "./ui-shell.js";

mountAppShell();

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
```

- [ ] **Step 4: Include the new module in production builds**

Change `scripts/build.mjs`:

```js
const publicFiles = [
  "index.html", "styles.css", "mobile-first.css", "app.js", "ui-shell.js", "ui-state.js",
  "engine.js", "i18n.js", "ai-chat.js",
];
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
node --test tests/mobile-slg-ui.test.js tests/deployment.test.js
```

Expected: the root and build-copy assertions pass; tab-state assertions remain pending until Task 3.

## Task 3: Implement real tab and sheet state

**Files:**
- Create: `ui-state.js`
- Modify: `app.js`
- Test: `tests/mobile-slg-ui.test.js`

- [ ] **Step 1: Add failing state-transition tests**

Append source-contract assertions:

```js
test("UI state defines app tabs, modal sheets and scroll locking", async () => {
  const state = await readFile(`${root}/ui-state.js`, "utf8");
  assert.match(state, /const APP_TABS = Object\.freeze\(\["home", "market", "trade", "survivors", "logs"\]\)/);
  assert.match(state, /document\.body\.classList\.toggle\("has-open-sheet"/);
  assert.match(state, /dispatchEvent\(new CustomEvent\("stock-survival:tab-change"/);
});
```

- [ ] **Step 2: Verify the state test fails**

Run `node --test tests/mobile-slg-ui.test.js`.

Expected: FAIL because the state functions are absent.

- [ ] **Step 3: Implement `ui-state.js`**

```js
const APP_TABS = Object.freeze(["home", "market", "trade", "survivors", "logs"]);
let activeTab = "home";

export function setActiveAppTab(nextTab) {
  if (!APP_TABS.includes(nextTab)) return activeTab;
  activeTab = nextTab;
  document.querySelectorAll("[data-app-tab]").forEach((button) => {
    const active = button.dataset.appTab === activeTab;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== activeTab;
  });
  document.dispatchEvent(new CustomEvent("stock-survival:tab-change", { detail: { tab: activeTab } }));
  return activeTab;
}

export function openSheet(id) {
  const sheet = document.getElementById(id);
  if (!sheet) return false;
  sheet.classList.remove("is-hidden");
  document.body.classList.toggle("has-open-sheet", true);
  return true;
}

export function closeSheet(id) {
  document.getElementById(id)?.classList.add("is-hidden");
  const anyOpen = [...document.querySelectorAll(".modal-backdrop")].some((sheet) => !sheet.classList.contains("is-hidden"));
  document.body.classList.toggle("has-open-sheet", anyOpen);
}
```

- [ ] **Step 4: Replace legacy navigation routing in `app.js`**

Import `setActiveAppTab`, `openSheet`, and `closeSheet`. Replace legacy `activateTab` calls with these mappings:

```js
const legacyTabMap = Object.freeze({ chart: "market", trade: "trade", orders: "trade", finance: "home", items: "home" });

function activateTab(tab) {
  const next = legacyTabMap[tab] || tab;
  setActiveAppTab(next);
  if (next === "market") renderMarket();
  if (next === "trade") { renderTradePanel(); requestAnimationFrame(drawChart); }
  if (next === "survivors") renderRanking();
  if (next === "logs") renderLogs();
}
```

- [ ] **Step 5: Run focused tests**

Run:

```powershell
node --test tests/mobile-slg-ui.test.js tests/ui-contract.test.js
```

Expected: PASS.

## Task 4: Replace the visual system with the dark 480px SLG shell

**Files:**
- Replace: `styles.css`
- Replace: `mobile-first.css`
- Test: `tests/mobile-slg-ui.test.js`

- [ ] **Step 1: Add the responsive CSS contract**

Add assertions for `390px`, `412px`, `430px`, `480px`, the safe area, sticky HUD, and 14px body text.

- [ ] **Step 2: Verify the CSS contract fails**

Run `node --test tests/mobile-slg-ui.test.js`.

Expected: FAIL on missing dark tokens and viewport contracts.

- [ ] **Step 3: Replace `styles.css` with shared design tokens**

Start with:

```css
:root {
  color-scheme: dark;
  --bg-main: #070b14;
  --bg-panel: #101827;
  --bg-panel-2: #162033;
  --line-soft: rgba(255,255,255,.08);
  --text-main: #f8fafc;
  --text-sub: #94a3b8;
  --text-muted: #64748b;
  --red-main: #ef233c;
  --red-dark: #b80f28;
  --blue-main: #2f80ed;
  --gold-main: #f2b84b;
  --green-main: #2dd4bf;
  --safe: #22c55e;
  --warning: #f59e0b;
  --danger: #ef4444;
}

* { box-sizing: border-box; }
html, body { min-width: 320px; min-height: 100%; margin: 0; background: #02050b; }
body { color: var(--text-main); font: 500 14px/1.5 -apple-system, BlinkMacSystemFont, "Noto Sans KR", "Segoe UI", sans-serif; }
.mobile-app-shell { width: min(100%, 480px); min-height: 100dvh; margin: 0 auto; background: var(--bg-main); }
.game-card { padding: 16px; border: 1px solid var(--line-soft); border-radius: 18px; background: linear-gradient(180deg,rgba(20,30,48,.96),rgba(12,18,30,.96)); box-shadow: 0 12px 32px rgba(0,0,0,.32); }
.button-primary { min-height: 60px; border-radius: 16px; background: linear-gradient(135deg,var(--red-main),var(--red-dark)); color: white; font-size: 17px; font-weight: 900; }
```

Reimplement all existing component selectors used by the mounted shell; do not retain the legacy `@layer legacy` block.

- [ ] **Step 4: Replace `mobile-first.css` with layout rules**

Include:

```css
.battle-hud { position: sticky; top: 0; z-index: 20; background: rgba(8,14,26,.94); backdrop-filter: blur(12px); }
.game-bottom-nav { position: fixed; left: 50%; bottom: 0; width: min(100%,480px); transform: translateX(-50%); padding-bottom: env(safe-area-inset-bottom); }
.turn-action-bar { position: fixed; left: 50%; bottom: calc(68px + env(safe-area-inset-bottom)); width: min(100%,480px); transform: translateX(-50%); }
.chat-fab { position: fixed; right: max(calc((100vw - 480px) / 2 + 14px),14px); bottom: calc(132px + env(safe-area-inset-bottom)); width: 44px; height: 44px; }
.sector-art-fallback { background: radial-gradient(circle at 30% 20%,rgba(239,35,60,.28),transparent 35%),linear-gradient(135deg,#172033,#080d18); }
@media (max-width: 390px) { .game-card { padding: 14px; } }
@media (min-width: 391px) and (max-width: 412px) { .mobile-app-shell { --screen-gutter: 14px; } }
@media (min-width: 413px) and (max-width: 430px) { .mobile-app-shell { --screen-gutter: 16px; } }
@media (min-width: 431px) { body { background: radial-gradient(circle at 50% 0,#162033,#02050b 64%); } }
```

- [ ] **Step 5: Run CSS and contract tests**

Run `node --test tests/mobile-slg-ui.test.js tests/ui-contract.test.js`.

Expected: PASS.

## Task 5: Adapt all game renderers to the five tabs

**Files:**
- Modify: `app.js`
- Test: `tests/ui-contract.test.js`
- Test: `tests/mobile-slg-ui.test.js`

- [ ] **Step 1: Add failing renderer-placement assertions**

Assert that shell source places these existing IDs under their new panels:

```js
assert.ok(shell.indexOf('data-tab-panel="market"') < shell.indexOf('id="stock-list"'));
assert.ok(shell.indexOf('data-tab-panel="trade"') < shell.indexOf('id="trade-submit"'));
assert.ok(shell.indexOf('data-tab-panel="survivors"') < shell.indexOf('id="ranking-list"'));
assert.ok(shell.indexOf('data-tab-panel="logs"') < shell.indexOf('id="log-list"'));
```

- [ ] **Step 2: Verify renderer-placement tests fail**

Run the two UI test files and confirm the failure is structural.

- [ ] **Step 3: Route existing render functions**

Keep the current implementations of `renderMarket`, `renderTradePanel`, `renderOrders`, `renderFinance`, `renderItems`, `renderRanking`, and `renderLogs`, but change their target containers to the new tab panel elements. Update `renderAll()` to call only lightweight HUD/home functions plus the active tab renderer:

```js
function renderAll() {
  if (!game) return;
  renderHeader();
  renderSurvivalStatus();
  renderAssets();
  renderPortfolioPanel();
  renderGlobalChat();
  renderMessageBadges();
  renderActiveBattleTab();
  announceNewRumorMessages();
}
```

- [ ] **Step 4: Move ranking into its tab**

Change `openRankingModal()` to:

```js
function openRankingModal() {
  setActiveAppTab("survivors");
  renderRanking();
}
```

Keep the player detail sheet for profile, holdings, charts, and messaging.

- [ ] **Step 5: Keep trade calls state-safe**

All existing `buyStock`, `sellStock`, `placeLimitOrder`, `borrow`, `repay`, `buyBond`, `useSpecialItem`, and `useRandomItem` calls remain unchanged. Only update which sheet or tab is shown after completion.

- [ ] **Step 6: Run the complete automated suite**

Run `npm.cmd test`.

Expected: all engine, multiplayer, deployment, AI-chat, and UI tests pass.

## Task 6: Implement sheets, compact chat, onboarding, and image fallback

**Files:**
- Modify: `ui-shell.js`
- Modify: `ui-state.js`
- Modify: `app.js`
- Modify: `mobile-first.css`
- Test: `tests/mobile-slg-ui.test.js`

- [ ] **Step 1: Add failing chat and fallback tests**

Assert:

```js
assert.match(shell, /class="chat-fab" id="global-chat-toggle"/);
assert.match(shell, /id="global-chat-sheet"[\s\S]*id="global-chat-messages"/);
assert.match(shell, /id="onboarding-sheet"[\s\S]*섹터를 확인하세요[\s\S]*턴을 종료하세요/);
assert.match(app, /addEventListener\("error"[\s\S]*sector-art-fallback/);
assert.match(app, /stock-survival-onboarding-seen/);
assert.match(state, /event\.key === "Escape"/);
```

- [ ] **Step 2: Verify the tests fail**

Run `node --test tests/mobile-slg-ui.test.js`.

- [ ] **Step 3: Connect the compact chat button**

Use the existing `renderGlobalChat` and `sendGlobalChatMessage`; change only visibility:

```js
$("#global-chat-toggle").addEventListener("click", () => openSheet("global-chat-sheet"));
$("[data-close-global-chat]").addEventListener("click", () => closeSheet("global-chat-sheet"));
```

The unread count remains `#global-chat-unread` and the sheet contains the existing message/input/send IDs.

- [ ] **Step 4: Add one delegated image fallback handler**

```js
document.addEventListener("error", (event) => {
  const image = event.target.closest?.("img[data-sector-art]");
  if (!image) return;
  image.hidden = true;
  image.parentElement?.classList.add("sector-art-fallback", "has-image-error");
}, true);
```

Each sector image wrapper contains an icon and company name beneath the image so the fallback remains meaningful.

- [ ] **Step 5: Add shared close behavior**

In `ui-state.js`, register `Escape` and backdrop dismissal while excluding clicks inside `.sheet-card`.

- [ ] **Step 6: Show onboarding only on the first game**

Add `#onboarding-sheet` to the shell with the four steps from the approved request. After game start, use:

```js
const ONBOARDING_KEY = "stock-survival-onboarding-seen";

function showFirstGameOnboarding() {
  if (localStorage.getItem(ONBOARDING_KEY) === "1") return;
  openSheet("onboarding-sheet");
}

$("#onboarding-confirm").addEventListener("click", () => {
  localStorage.setItem(ONBOARDING_KEY, "1");
  closeSheet("onboarding-sheet");
});
```

Call `showFirstGameOnboarding()` after the first successful transition into `#app-shell`.

- [ ] **Step 7: Run focused and full tests**

Run:

```powershell
node --test tests/mobile-slg-ui.test.js tests/ui-contract.test.js
npm.cmd test
```

Expected: PASS.

## Task 7: Complete localization and build integrity

**Files:**
- Modify: `i18n.js`
- Modify: `app.js`
- Modify: `scripts/build.mjs`
- Modify: `tests/deployment.test.js`
- Test: `tests/mobile-slg-ui.test.js`

- [ ] **Step 1: Add failing localization and dist assertions**

Assert that `i18n.js` contains English mappings for `홈`, `시장`, `거래`, `생존자`, `로그`, `거래장 열기`, and the new empty states. Assert `dist/ui-shell.js` and `dist/ui-state.js` are produced.

- [ ] **Step 2: Verify tests fail**

Run:

```powershell
node --test tests/mobile-slg-ui.test.js tests/deployment.test.js
```

- [ ] **Step 3: Add translations**

Extend the existing dictionary with:

```js
"홈": "Home",
"시장": "Market",
"거래": "Trade",
"생존자": "Survivors",
"로그": "Log",
"거래장 열기": "Open Trade Desk",
"보유 종목 없음": "No holdings yet",
"시장 스캔에서 첫 종목을 선택하세요.": "Choose your first stock from Market Scan.",
"현재 열린 생존전이 없습니다.": "No survival match is open right now.",
```

- [ ] **Step 4: Build and inspect output**

Run:

```powershell
npm.cmd run build
Get-Item dist\index.html, dist\app.js, dist\ui-shell.js, dist\ui-state.js, dist\styles.css, dist\mobile-first.css
```

Expected: build exits 0 and every file exists.

## Task 8: Browser verification at required widths

**Files:**
- Modify after observed browser failures: `styles.css`, `mobile-first.css`, `app.js`, `ui-shell.js`
- Test: browser at local server

- [ ] **Step 1: Start the application**

Run `npm.cmd run dev` and open `http://127.0.0.1:4173/`.

- [ ] **Step 2: Verify the main screen at 390px**

Confirm one-line title, readable 14px+ text, 48px+ controls, visible room create/join actions, no horizontal overflow, and no failed images.

- [ ] **Step 3: Verify 412px and 430px**

Confirm cards use the available width without changing the 5-tab information hierarchy.

- [ ] **Step 4: Verify the 480px frame on desktop**

At a 1280px browser viewport, confirm the app remains 480px, centered, and the outside background is decorative only.

- [ ] **Step 5: Run one complete game flow**

Use solo mode and verify: start → HUD → each of five tabs → select stock → open trade → buy → turn end → open compact chat → close with Escape.

- [ ] **Step 6: Check runtime health**

Confirm browser console errors are 0, failed CEO image requests are 0, and `document.documentElement.scrollWidth === document.documentElement.clientWidth` at 390/412/430px.

## Task 9: Documentation, report, and final verification

**Files:**
- Modify: `README.md`
- Create: `WORK_COMPLETION_REPORT_2026-07-04_24.md`

- [ ] **Step 1: Update README**

Replace the bright-dashboard feature line with the dark mobile SLG app shell, five real tabs, compact chat sheet, and PC 480px frame. Retain all deployment and game-rule documentation.

- [ ] **Step 2: Run fresh verification**

Run:

```powershell
node --check app.js
node --check ui-shell.js
node --check ui-state.js
npm.cmd test
npm.cmd run build
git diff --check
```

Expected: all commands exit 0, all tests pass, and build reports `Build complete: dist`.

- [ ] **Step 3: Write the completion report**

Record implemented screens, preserved features, automated test count, browser viewport results, build result, and any remaining limitations in `WORK_COMPLETION_REPORT_2026-07-04_24.md`.

- [ ] **Step 4: Review the final diff without discarding existing user changes**

Run `git status --short` and `git diff --stat`. Confirm no server/engine rule changes are present unless required to fix an observed regression.
