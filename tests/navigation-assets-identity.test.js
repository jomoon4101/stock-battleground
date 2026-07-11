import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("다섯 고정 메뉴는 서로 다른 SVG 아이콘을 사용한다", async () => {
  const shell = await read("ui-shell.js");
  for (const name of ["home", "market", "trade", "ranking", "logs"]) {
    assert.match(shell, new RegExp(`class="nav-icon nav-icon-${name}"`));
  }
  assert.doesNotMatch(shell, /data-app-tab="home"[^>]*>[\s\S]{0,80}<span>⌂<\/span>/);
});

test("금 구리 코인과 세무조사 공매도는 고유 아이콘을 사용한다", async () => {
  const shell = await read("ui-shell.js");
  const app = await read("app.js");
  for (const name of ["gold", "copper", "coin"]) {
    assert.match(shell, new RegExp(`class="asset-icon asset-icon-${name}"`));
  }
  assert.match(app, /function skillIconMarkup\(skillId\)/);
  assert.match(app, /"tax-audit"[\s\S]{0,240}skill-icon-tax-audit/);
  assert.match(app, /"short-sell"[\s\S]{0,240}skill-icon-short-sell/);
  assert.match(app, /\$\{skillIconMarkup\(id\)\}/);
});

test("데스크톱 메뉴와 MY TRADER는 상단에 고정되고 프로필 이미지는 복원된다", async () => {
  const css = await read("high-contrast-theme.css");
  assert.match(css, /\.identity-card\s*>\s*\.avatar\.profile-image\.meme\s*\{[^}]*background-image:\s*url\("assets\/stock-meme-avatars\.png"\)/i);
  assert.match(css, /@media\s*\(min-width:\s*1180px\)[\s\S]*?\.game-bottom-nav\s*\{[^}]*align-content:\s*start[^}]*padding-top:\s*84px/i);
  assert.match(css, /@media\s*\(min-width:\s*1180px\)[\s\S]*?#tab-home\s+\.identity-card\s*\{[^}]*position:\s*sticky[^}]*top:\s*142px/i);
});

test("보유 종목과 대체자산의 0개 상태는 선명한 최소 글자 크기를 가진다", async () => {
  const css = await read("high-contrast-theme.css");
  assert.match(css, /#portfolio-summary\s*\{[^}]*color:\s*#fff[^}]*font-size:\s*\.875rem/i);
  assert.match(css, /\.portfolio-empty\s+strong\s*\{[^}]*color:\s*#fff[^}]*font-size:\s*1rem/i);
  assert.match(css, /\.alternative-assets\s+b\s*\{[^}]*color:\s*#fff[^}]*font-size:\s*\.875rem/i);
  assert.match(css, /\.skill-hand\s*>\s*small\s*\{[^}]*color:\s*#d7e0eb[^}]*font-size:\s*\.8125rem/i);
});
