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

test("모바일 메인 소개 영역은 컴팩트하고 언어 선택기가 잘리지 않는다", async () => {
  const css = await read("high-contrast-theme.css");
  assert.match(css, /\.start-card\s*\{[^}]*padding:\s*48px\s+14px\s+16px/i);
  assert.match(css, /\.hero-language\s*\{[^}]*top:\s*10px[^}]*right:\s*10px[^}]*max-width:\s*calc\(100%\s*-\s*20px\)/i);
  assert.match(css, /\.hero-language\s+button\s*\{[^}]*min-width:\s*38px[^}]*min-height:\s*34px/i);
  assert.match(css, /\.logo-lockup\s+h1\s*\{[^}]*font-size:\s*clamp\(2rem,\s*10vw,\s*3rem\)/i);
  assert.match(css, /\.feature-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)[^}]*margin-top:\s*12px/i);
  assert.match(css, /\.feature-grid\s+small\s*\{[^}]*display:\s*none/i);
  assert.match(css, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.feature-grid\s+small\s*\{[^}]*display:\s*block/i);
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

test("상단 HUD는 로고 겹침을 막고 상태 영역을 글자 높이에 맞춘다", async () => {
  const css = await read("high-contrast-theme.css");
  assert.match(css, /\.brand-mark\s*\{[^}]*flex:\s*0\s+0\s+40px/i);
  assert.match(css, /\.brand\s*>\s*span:last-child\s*\{[^}]*min-width:\s*0/i);
  assert.match(css, /\.survival-status\s*\{[^}]*min-height:\s*0/i);
  assert.match(css, /\.survival-status\s*>\s*div\s*\{[^}]*min-height:\s*58px/i);
  assert.match(css, /@media\s*\(min-width:\s*1180px\)[\s\S]*?\.topbar\s*\{[^}]*grid-template-columns:\s*minmax\(210px,\s*auto\)/i);
  assert.match(css, /@media\s*\(min-width:\s*1180px\)[\s\S]*?\.survival-status\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(132px,\s*1fr\)\)/i);
});

test("섹터 CEO 카드는 현재 감정 상태 프레임 하나만 표시한다", async () => {
  const css = await read("high-contrast-theme.css");
  assert.match(css, /\.stock-row\.sector-card\s*>\s*\.sector-ceo\s*\{[^}]*background-repeat:\s*no-repeat[^}]*background-size:\s*300%\s+100%/i);
  assert.match(css, /\.stock-row\.sector-card\s*>\s*\.sector-ceo\.ceo-technology\s*\{[^}]*background-size:\s*300%\s+auto/i);
  assert.match(css, /\.stock-detail-character\s*>\s*\.sector-ceo\s*\{[^}]*background-repeat:\s*no-repeat[^}]*background-size:\s*300%\s+100%/i);
});

test("메인 페이지는 화이트 혼합 없이 푸른색 계열로 통일된다", async () => {
  const css = await read("high-contrast-theme.css");
  assert.match(css, /\.start-screen\s*\{[^}]*background:[^}]*#081728/i);
  assert.match(css, /\.start-form,\s*\n\.active-survivals\s*\{[^}]*background:\s*#172b44[^}]*color:\s*#fff/i);
  assert.match(css, /\.start-rules\s*\{[^}]*background:\s*#172b44[^}]*color:\s*#fff/i);
  assert.match(css, /\.start-form\s+input,[\s\S]*?\.start-form\s+select\s*\{[^}]*background:\s*#10243c[^}]*color:\s*#fff/i);
  assert.match(css, /\.profile-open-button,[\s\S]*?\.game-mode-buttons\s+button\s*\{[^}]*background:\s*#203852[^}]*color:\s*#fff/i);
  assert.match(css, /\.profile-open-button\s+b\s*\{[^}]*color:\s*#fff/i);
  assert.match(css, /\.hall-row\s*\{[^}]*color:\s*#eef5fc[^}]*font-size:\s*\.75rem/i);
});
