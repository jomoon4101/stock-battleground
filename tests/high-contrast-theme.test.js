import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("고대비 테마는 기존 디자인 시스템 다음에 로드된다", async () => {
  const html = await read("index.html");
  const designSystem = html.indexOf("design-system.css");
  const contrastTheme = html.indexOf("high-contrast-theme.css");
  assert.ok(designSystem >= 0);
  assert.ok(contrastTheme > designSystem);
});

test("고대비 테마는 빌드와 오프라인 캐시에 포함된다", async () => {
  const build = await read("scripts/build.mjs");
  const serviceWorker = await read("service-worker.js");
  assert.match(build, /high-contrast-theme\.css/);
  assert.match(serviceWorker, /high-contrast-theme\.css/);
});

test("고대비 테마는 메인, 게임, 오버레이와 선택 색상을 모두 정의한다", async () => {
  const css = await read("high-contrast-theme.css");
  for (const selector of [
    "::selection",
    ".start-screen",
    ".start-form",
    ".start-rules",
    ".app-shell",
    ".battle-hud",
    ".panel",
    ".game-bottom-nav",
    ".modal",
    ".sheet-card",
  ]) {
    assert.ok(css.includes(selector), `${selector} 스타일이 필요합니다.`);
  }
  assert.match(css, /--contrast-mint:\s*#00c98b/i);
  assert.match(css, /--ui-muted:\s*#d7e0eb/i);
  assert.match(css, /@media\s*\(min-width:\s*768px\)/i);
  assert.match(css, /@media\s*\(min-width:\s*1180px\)/i);
});
