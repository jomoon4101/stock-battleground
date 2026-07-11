# Complete UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the main-page player-count control and redesign every stock-survival scene with one responsive, reusable mobile-first game-app design system.

**Architecture:** Preserve the existing DOM IDs and game flows, move user-facing player counts to mode-owned configuration, and load a final `design-system.css` layer after the legacy styles. The new layer owns tokens, typography, cards, navigation, sheets, responsive grids, and state styling so behavior stays in `app.js` while presentation becomes consistent.

**Tech Stack:** Vanilla JavaScript ES modules, semantic HTML templates, CSS Grid/Flexbox/custom properties, Node.js built-in test runner.

## Global Constraints

- Do not add a new runtime library.
- Keep quick/standard/long mode player counts at 3/5/6.
- Preserve all existing element IDs and API endpoints except `solo-player-count`, which must be removed.
- Preserve Korean/English localization, multiplayer room codes, mid-join, trading, messaging, elimination, and victory flows.
- Support widths from 360px mobile through desktop without horizontal page overflow or overlapping text.
- Keep every interactive target at least 44px where layout permits.

---

### Task 1: Mode-owned player count

**Files:**
- Modify: `tests/ui-redesign.test.js`
- Modify: `ui-shell.js`
- Modify: `app.js`

**Interfaces:**
- Consumes: `GAME_MODES[mode].playerCount` from `engine.js`.
- Produces: `selectedSetup(): { playerCount, difficulty, totalTurns }` and solo creation using the same selected mode.

- [ ] **Step 1: Write the failing contract tests**

```js
test("main setup has no player count control", async () => {
  const shell = await readFile(`${root}/ui-shell.js`, "utf8");
  assert.doesNotMatch(shell, /solo-player-count|플레이어 인원/);
});

test("all launch flows derive player count from the selected mode", async () => {
  const app = await readFile(`${root}/app.js`, "utf8");
  assert.doesNotMatch(app, /\$\("#solo-player-count"\)/);
  assert.match(app, /playerCount:\s*mode\.playerCount/);
  assert.match(app, /createSurvivalMvpGame\([\s\S]*playerCount:\s*mode\.playerCount/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test tests/ui-redesign.test.js`

Expected: FAIL because `solo-player-count` still exists in `ui-shell.js` and `app.js`.

- [ ] **Step 3: Remove the setup control and use mode configuration**

```js
const selectedSetup = () => {
  const mode = GAME_MODES[$("#game-speed").value] || GAME_MODES.standard;
  return { playerCount: mode.playerCount, difficulty: "hard", totalTurns: mode.totalTurns };
};

// inside beginSoloGame
const mode = GAME_MODES[$("#game-speed").value] || GAME_MODES.quick;
game = createSurvivalMvpGame({
  nickname,
  seed: Date.now(),
  language: getLanguage(),
  avatar: selectedAvatar,
  playerCount: mode.playerCount,
  totalTurns: mode.totalTurns,
  requireSkillSelection: true,
});
```

Delete the `<label class="solo-player-count">…</label>` markup. Add the automatic counts to each mode subtitle, such as `3명 · 10라운드 · 11섹터`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test tests/ui-redesign.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/ui-redesign.test.js ui-shell.js app.js
git commit -m "feat: derive player count from game mode"
```

### Task 2: Shared design system and shell copy

**Files:**
- Create: `design-system.css`
- Modify: `tests/ui-redesign.test.js`
- Modify: `index.html`
- Modify: `ui-shell.js`
- Modify: `scripts/build.mjs`
- Modify: `service-worker.js`

**Interfaces:**
- Produces CSS tokens `--ui-bg`, `--ui-surface`, `--ui-surface-raised`, `--ui-text`, `--ui-muted`, `--ui-up`, `--ui-down`, `--ui-gold`, `--ui-success`, and spacing/radius/shadow tokens.
- Consumes existing class names and IDs without changing event bindings.

- [ ] **Step 1: Add failing asset and token tests**

```js
test("the final shared design system is loaded and shipped", async () => {
  const [html, css, build, worker] = await Promise.all([
    readFile(`${root}/index.html`, "utf8"),
    readFile(`${root}/design-system.css`, "utf8"),
    readFile(`${root}/scripts/build.mjs`, "utf8"),
    readFile(`${root}/service-worker.js`, "utf8"),
  ]);
  assert.match(html, /design-system\.css/);
  for (const token of ["--ui-bg", "--ui-surface", "--ui-text", "--ui-up", "--ui-down", "--ui-gold"]) assert.match(css, new RegExp(token));
  assert.match(build, /design-system\.css/);
  assert.match(worker, /design-system\.css/);
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/ui-redesign.test.js`

Expected: FAIL because `design-system.css` does not exist.

- [ ] **Step 3: Create and load the design system**

Use a final stylesheet link after `mobile-first.css`:

```html
<link rel="stylesheet" href="design-system.css?v=20260711-01">
```

Start `design-system.css` with a versioned layer:

```css
@layer survival-redesign {
  :root {
    --ui-bg:#07101f;
    --ui-surface:#111d30;
    --ui-surface-raised:#17243a;
    --ui-text:#f6f8fc;
    --ui-muted:#a9b6ca;
    --ui-up:#ff3b5c;
    --ui-down:#2f8cff;
    --ui-gold:#f5b942;
    --ui-success:#20c997;
  }
}
```

Add `design-system.css` to `scripts/build.mjs` copy inputs and `service-worker.js` static cache.

- [ ] **Step 4: Rewrite shell copy for concise hierarchy**

Change decorative/duplicated labels to concise labels while preserving IDs. Examples: `AUTO MATCHMAKING` → `빠른 매칭`, `ONLINE MATCH LOBBY` → `친구 방`, `MY SURVIVAL BAG` → `내 포트폴리오`, and `SURVIVAL INTELLIGENCE` → `생존 정보`.

- [ ] **Step 5: Run focused test and verify GREEN**

Run: `node --test tests/ui-redesign.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add design-system.css tests/ui-redesign.test.js index.html ui-shell.js scripts/build.mjs service-worker.js
git commit -m "feat: add unified survival design system"
```

### Task 3: Redesign every scene responsively

**Files:**
- Modify: `design-system.css`
- Modify: `tests/ui-redesign.test.js`
- Modify: `ui-shell.js`

**Interfaces:**
- Consumes current scene selectors: `.start-screen`, `.matchmaking-screen`, `.lobby-screen`, `.app-shell`, `.battle-hud`, `.game-bottom-nav`, `.panel`, `.modal-backdrop`, `.sheet-card`, `.result-card`, `.elimination-card`.
- Produces a consistent visual layout for all scenes at mobile and desktop breakpoints.

- [ ] **Step 1: Add failing scene-coverage and responsive tests**

```js
test("all scenes are covered by the responsive design layer", async () => {
  const css = await readFile(`${root}/design-system.css`, "utf8");
  for (const selector of [
    ".start-screen", ".matchmaking-screen", ".lobby-screen", ".app-shell",
    ".battle-hud", ".game-bottom-nav", ".panel", ".modal-backdrop",
    ".sheet-card", ".result-card", ".elimination-card", ".toast"
  ]) assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(css, /@media\s*\(min-width:\s*768px\)/);
  assert.match(css, /@media\s*\(min-width:\s*1180px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test tests/ui-redesign.test.js`

Expected: FAIL until all scene selectors and breakpoints exist.

- [ ] **Step 3: Implement mobile foundations**

Define body overflow, 16px body typography, 44px controls, card padding, fixed safe-area bottom navigation, bottom-sheet modals, non-wrapping financial values, empty/loading states, and focus-visible rings.

- [ ] **Step 4: Implement screen-specific layouts**

Style main, matchmaking, lobby, HUD, status cards, home assets, market cards, intelligence rows, trade chart/order form, rank rows, log rows, chat, direct messages, notifications, profile picker, rules, items, elimination, victory, and toast feedback using the same tokens.

- [ ] **Step 5: Implement adaptive desktop layouts**

At 768px, widen sheets and use multi-column setup/cards. At 1180px, convert the game shell to a centered desktop dashboard, use a left navigation rail where possible, and place compatible panels side-by-side without changing DOM order.

- [ ] **Step 6: Add reduced motion and long-copy protection**

Use `min-width:0`, `overflow-wrap:anywhere`, `font-variant-numeric:tabular-nums`, `text-overflow:ellipsis` only where full text is available elsewhere, and disable nonessential transitions under reduced motion.

- [ ] **Step 7: Run focused and full tests**

Run: `node --test tests/ui-redesign.test.js`

Expected: PASS.

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 8: Commit**

```bash
git add design-system.css tests/ui-redesign.test.js ui-shell.js
git commit -m "feat: redesign all survival game scenes"
```

### Task 4: Runtime QA, build, and completion report

**Files:**
- Create: `WORK_COMPLETION_REPORT_2026-07-11_29.md`
- Modify only if runtime defects are reproduced: `design-system.css`, `ui-shell.js`, `app.js`

**Interfaces:**
- Consumes the production server and in-app browser.
- Produces verified screenshots/observations for mobile and desktop, plus a completion report.

- [ ] **Step 1: Build production assets**

Run: `npm run build`

Expected: exit 0 and `dist/design-system.css` exists.

- [ ] **Step 2: Start the server and inspect mobile scenes**

Run: `npm run dev`

Inspect at 390×844: main, matchmaking/lobby where available, home, market, trade, rank, logs, one modal, and result/elimination using test controls or existing flows. Verify no horizontal page overflow, overlap, clipped primary buttons, or unreadable text.

- [ ] **Step 3: Inspect desktop scenes**

Inspect at 1440×900. Verify the start screen uses balanced columns, gameplay panels use available width, navigation is stable, and sheets are centered with readable line lengths.

- [ ] **Step 4: Run final verification**

Run: `npm test`

Expected: zero failures.

Run: `npm run build`

Expected: exit 0.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 5: Write the completion report**

Document changed files, removed player-count UI, mode-owned counts, scene coverage, responsive QA, test counts, build result, limitations, and deployment instructions in `WORK_COMPLETION_REPORT_2026-07-11_29.md`.

- [ ] **Step 6: Commit**

```bash
git add WORK_COMPLETION_REPORT_2026-07-11_29.md design-system.css ui-shell.js app.js
git commit -m "docs: report complete UI redesign"
```

