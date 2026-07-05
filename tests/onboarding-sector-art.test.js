import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

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

test("first-game onboarding is an accessible four-step shared bottom sheet", async () => {
  const [shell, app, mobileCss] = await Promise.all([
    readFile(`${root}/ui-shell.js`, "utf8"),
    readFile(`${root}/app.js`, "utf8"),
    readFile(`${root}/mobile-first.css`, "utf8"),
  ]);

  assert.match(shell, /class="modal-backdrop onboarding-sheet is-hidden" id="onboarding-sheet" role="dialog" aria-modal="true" aria-labelledby="onboarding-title"/);
  assert.match(shell, /data-close-onboarding[^>]*aria-label="닫기"/);
  assert.match(shell, /id="onboarding-title"/);
  assert.match(shell, /id="onboarding-confirm"/);
  for (const [number, label] of [
    ["1", "섹터를 확인하세요."],
    ["2", "종목을 매수\/매도하세요."],
    ["3", "턴을 종료하세요."],
    ["4", "마지막까지 생존하세요."],
  ]) {
    assert.match(shell, new RegExp(`<li[^>]*>\\s*<b>${number}</b>\\s*<span>${label}</span>`));
  }

  assert.equal((shell.match(/id="onboarding-sheet"/g) || []).length, 1);
  assert.equal((shell.match(/id="onboarding-title"/g) || []).length, 1);
  assert.equal((shell.match(/id="onboarding-confirm"/g) || []).length, 1);
  const shellIds = [...shell.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(shellIds).size, shellIds.length, "mounted shell IDs must be unique");
  assert.match(app, /const ONBOARDING_KEY = "stock-survival-onboarding-seen"/);
  assert.match(app, /localStorage\.getItem\(ONBOARDING_KEY\) !== "1"/);
  assert.match(app, /localStorage\.setItem\(ONBOARDING_KEY, "1"\)[\s\S]*closeSheet\("onboarding-sheet"\)/);
  assert.match(app, /data-close-onboarding[\s\S]*closeSheet\("onboarding-sheet"\)/);
  assert.doesNotMatch(app, /\$\("#onboarding-sheet"\)\.classList\.(?:add|remove)\("is-hidden"\)/);
  assert.match(functionSource(app, "resetToStart"), /closeSheet\("onboarding-sheet"\)/);
  assert.match(app, /event\.key === "Escape"[\s\S]*closeSheet\("onboarding-sheet"\)/);
  assert.match(mobileCss, /\.onboarding-sheet-card\s*\{/);
  assert.match(mobileCss, /\.onboarding-steps\s*\{/);
});

test("onboarding opens once per app entry source and does not reopen on running SSE updates", async () => {
  const app = await readFile(`${root}/app.js`, "utf8");
  const showOnboarding = functionSource(app, "showFirstGameOnboarding");
  const beginSolo = functionSource(app, "beginSoloGame");
  const applyServerState = functionSource(app, "applyServerState");

  assert.match(showOnboarding, /localStorage\.getItem\(ONBOARDING_KEY\) !== "1"[\s\S]*openSheet\("onboarding-sheet"\)/);
  assert.match(beginSolo, /#app-shell[\s\S]*classList\.remove\("is-hidden"\)[\s\S]*renderAll\(\)[\s\S]*showFirstGameOnboarding\(\)/);
  assert.match(applyServerState, /const firstRunningState = state\.room\.status === "running" && !onlineGameEntered/);
  assert.match(applyServerState, /if \(state\.room\.status === "running"\) onlineGameEntered = true/);
  assert.match(applyServerState, /if \(firstRunningState\) showFirstGameOnboarding\(\)/);
  assert.equal((applyServerState.match(/showFirstGameOnboarding\(\)/g) || []).length, 1);
});

test("sector art probes use build-backed paths and safe fallback metadata", async () => {
  const [app, helper, build] = await Promise.all([
    readFile(`${root}/app.js`, "utf8"),
    readFile(`${root}/sector-art.js`, "utf8").catch(() => ""),
    readFile(`${root}/scripts/build.mjs`, "utf8"),
  ]);
  assert.match(helper, /export function sectorArtPath/);
  const { SECTOR_ART_KEYS, sectorArtPath } = await import(`../sector-art.js?probe-paths=${Date.now()}`);

  for (const key of SECTOR_ART_KEYS) {
    const path = `assets/sector-ceo-${key}-v2.webp`;
    assert.equal(sectorArtPath(key), path);
    await access(`${root}/${path}`);
  }
  assert.equal(sectorArtPath("../../secrets"), "");
  assert.equal(sectorArtPath("made-up-sector"), "");
  assert.equal(sectorArtPath("future-sector", ["future-sector"]), "assets/sector-ceo-future-sector-v2.webp");
  assert.match(build, /sector-ceo-.+-v2\\\.webp/);
  assert.match(app, /<img class="sector-art-probe" data-sector-art="\$\{escapeHtml\(stock\.sectorKey\)\}" src="\$\{escapeHtml\(artPath\)\}" alt="" aria-hidden="true">/);
  assert.match(app, /data-sector-fallback="\$\{escapeHtml\(sectorFallbackLabel\(stock\)\)\}"/);
  assert.match(functionSource(app, "renderSelectedStock"), /detailCeo\.dataset\.sectorFallback = sectorFallbackLabel\(stock\)/);
  assert.match(functionSource(app, "renderSelectedStock"), /detailCeo\.innerHTML = sectorArtProbeMarkup\(stock\)/);
});

test("delegated sector art state changes are scoped to probe image events", async () => {
  const source = await readFile(`${root}/sector-art.js`, "utf8").catch(() => "");
  assert.match(source, /export function applySectorArtProbeState/);
  const { applySectorArtProbeState } = await import(`../sector-art.js?probe-state=${Date.now()}`);
  const classes = new Set();
  const container = {
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
    },
  };
  const probe = {
    hidden: false,
    matches: (selector) => selector === "img[data-sector-art]",
    closest: (selector) => selector === ".sector-ceo" ? container : null,
  };

  assert.equal(applySectorArtProbeState({ target: { matches: () => false } }, true), false);
  assert.deepEqual([...classes], []);
  assert.equal(applySectorArtProbeState({ target: probe }, true), true);
  assert.equal(probe.hidden, true);
  assert.equal(classes.has("sector-art-fallback"), true);
  assert.equal(classes.has("has-image-error"), true);
  assert.equal(applySectorArtProbeState({ target: probe }, false), true);
  assert.equal(probe.hidden, false);
  assert.equal(classes.has("sector-art-fallback"), false);
  assert.equal(classes.has("has-image-error"), false);
});

test("app installs one capture-phase probe error handler and CSS keeps probes requestable", async () => {
  const [app, mobileCss] = await Promise.all([
    readFile(`${root}/app.js`, "utf8"),
    readFile(`${root}/mobile-first.css`, "utf8"),
  ]);
  const errorHandlers = app.match(/document\.addEventListener\("error",[\s\S]*?, true\);/g) || [];
  assert.equal(errorHandlers.length, 1);
  assert.match(errorHandlers[0], /applySectorArtProbeState\(event, true\)/);
  assert.match(app, /document\.addEventListener\("load",[\s\S]*applySectorArtProbeState\(event, false\)[\s\S]*, true\);/);

  const probeRule = mobileCss.match(/\.sector-art-probe\s*\{[^}]*\}/)?.[0] || "";
  assert.match(probeRule, /position:\s*absolute/);
  assert.match(probeRule, /opacity:\s*0/);
  assert.doesNotMatch(probeRule, /display:\s*none/);
  assert.match(mobileCss, /\.sector-ceo\.sector-art-fallback[^{]*\{(?=[^}]*radial-gradient\()(?=[^}]*linear-gradient\()[^}]*\}/);
  assert.match(mobileCss, /\.mood-up \.sector-ceo\s*\{[^}]*transform:/);
  assert.match(mobileCss, /\.sector-ceo\.ceo-technology\s*\{[^}]*background-image:[^}]*sector-ceo-technology-v2\.webp/);
  assert.match(mobileCss, /\.sector-ceo\.sector-art-fallback::after\s*\{[^}]*content:\s*attr\(data-sector-fallback\)/);
  assert.doesNotMatch(mobileCss, /\.sector-ceo\.sector-art-fallback\s*\{[^}]*background:\s*(?:#fff|white|#000|black)/);
});
