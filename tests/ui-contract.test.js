import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("앱이 참조하는 정적 ID가 HTML에 존재한다", async () => {
  const [html, app] = await Promise.all([readFile(`${root}/index.html`, "utf8"), readFile(`${root}/app.js`, "utf8")]);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const dynamic = new Set(["item-stock", "item-target", "item-rank"]);
  const used = new Set([...app.matchAll(/\$\("#([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]));
  assert.deepEqual([...used].filter((id) => !ids.has(id) && !dynamic.has(id)), []);
});

test("고지문·체크포인트 카운트다운·종목 바로가기 계약이 존재한다", async () => {
  const [html, app] = await Promise.all([readFile(`${root}/index.html`, "utf8"), readFile(`${root}/app.js`, "utf8")]);
  assert.match(html, /본 서비스는 가상 주식 시뮬레이션 게임이며/);
  assert.match(app, /game\?\.turn % 10 === 0/);
  assert.match(app, /data-log-stock/);
  assert.match(app, /data-rank-stock/);
  assert.match(app, /amount > 0 \? "increase" : "decrease"/);
});

