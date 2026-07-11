import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("reference-image infographic theme and icon tooltips are shipped", async () => {
  const [css, shell] = await Promise.all([readFile(`${root}/mobile-first.css`, "utf8"), readFile(`${root}/ui-shell.js`, "utf8")]);
  await stat(`${root}/assets/stock-survival-theme-reference.png`);
  assert.match(css, /stock-survival-theme-reference\.png/);
  assert.match(css, /--arena-navy:#061a3a/);
  assert.match(css, /\[data-tooltip\]:hover::after/);
  assert.match(shell, /data-app-tab="market" data-nav-target="market" data-tooltip="섹터 시장" aria-label="섹터 시장"/);
  assert.match(shell, /data-mvp-action="interfere" data-tooltip="견제" aria-label="견제"/);
});

test("latest mobile battle UI exposes every remaining PDF system", async () => {
  const [shell, app, server] = await Promise.all([readFile(`${root}/ui-shell.js`, "utf8"), readFile(`${root}/app.js`, "utf8"), readFile(`${root}/server.mjs`, "utf8")]);
  for (const id of ["alternative-assets", "skill-hand", "hidden-objective", "coin-all-in", "emergency-sell-button", "event-reveal"]) assert.match(shell, new RegExp(`id="${id}"`));
  for (const action of ["buy", "sell", "interfere", "defend", "gamble", "all-in"]) assert.match(shell, new RegExp(`data-mvp-action="${action}"`));
  for (const endpoint of ["mvp-action", "mvp-progress", "mvp-skill", "mvp-skill-draft", "mvp-skill-confirm", "mvp-emergency-sell"]) assert.match(server, new RegExp(`case "${endpoint}"`));
  assert.match(app, /calculateMajorShareholders/);
  assert.match(app, /hidden-safe-asset-king/);
  assert.match(app, /sendAction\("mvp-action", action,[\s\S]*Asset action locked/);
  assert.match(server, /queuedInsideInfoCard:\s*_privateQueuedEvent/);
});

test("PWA and Android packaging artifacts target the production dist", async () => {
  const [manifest, worker, capacitor] = await Promise.all([
    readFile(`${root}/manifest.webmanifest`, "utf8").then(JSON.parse),
    readFile(`${root}/service-worker.js`, "utf8"),
    readFile(`${root}/capacitor.config.json`, "utf8").then(JSON.parse),
  ]);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "portrait-primary");
  assert.match(worker, /survival-mvp\/game-logic\.js/);
  assert.match(worker, /survival-mvp\/event-effects\.js/);
  assert.equal(capacitor.webDir, "dist");
});
