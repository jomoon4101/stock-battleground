import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("npm scripts와 Vercel dist·SPA 설정이 존재한다", async () => {
  const [pkg, vercel, build] = await Promise.all([readFile(`${root}/package.json`, "utf8").then(JSON.parse), readFile(`${root}/vercel.json`, "utf8").then(JSON.parse), readFile(`${root}/scripts/build.mjs`, "utf8")]);
  for (const script of ["dev", "build", "preview", "start"]) assert.equal(typeof pkg.scripts[script], "string");
  assert.equal(vercel.buildCommand, "npm run build");
  assert.equal(vercel.outputDirectory, "dist");
  assert.ok(vercel.routes.some((route) => route.handle === "filesystem"));
  assert.ok(vercel.routes.some((route) => route.dest === "/index.html"));
  assert.match(build, /mobile-first\.css/);
  assert.match(build, /publicFiles\s*=\s*\[[^\]]*"ui-shell\.js"/);
  assert.match(build, /sector-ceo-.+v2/);
});

test("환경변수 예시는 이름만 포함하고 Supabase 변수는 사용하지 않는다", async () => {
  const [env, config, build] = await Promise.all([
    readFile(`${root}/.env.example`, "utf8"), readFile(`${root}/config.js`, "utf8"), readFile(`${root}/scripts/build.mjs`, "utf8"),
  ]);
  for (const name of ["VITE_API_BASE_URL", "PORT", "ALLOWED_ORIGINS", "DATA_ROOT"]) assert.match(env, new RegExp(`^${name}=$`, "m"));
  assert.doesNotMatch(env, /VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY/);
  assert.match(config, /DEFAULT_RENDER_API_BASE_URL = "https:\/\/stock-battleground-server\.onrender\.com"/);
  assert.match(build, /DEFAULT_RENDER_API_BASE_URL/);
});

test("Windows 게임 실행 도우미가 Node를 찾고 서버 수명을 유지한다", async () => {
  const [cmd, scriptBytes] = await Promise.all([
    readFile(`${root}/게임실행.cmd`, "utf8"), readFile(`${root}/start-game.ps1`),
  ]);
  const script = scriptBytes.toString("utf8");
  assert.deepEqual([...scriptBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(cmd, /powershell\.exe[\s\S]*start-game\.ps1/);
  assert.match(cmd, /STOCK_SURVIVAL_NO_BROWSER/);
  assert.match(script, /function Find-NodeExecutable/);
  assert.match(script, /ProcessStartInfo/);
  assert.match(script, /serverProcess\.WaitForExit/);
  assert.match(script, /실행 도우미 진단을 통과했습니다/);
});

test("Render Docker 이미지가 서버·AI 대화·정적 자산 전체를 포함한다", async () => {
  const requiredFiles = [
    "server.mjs", "ai-chat.js", "app.js", "engine.js", "config.js", "i18n.js",
    "index.html", "styles.css", "mobile-first.css", "assets", "data",
  ];
  const [dockerfile, dockerignore, ...requiredStats] = await Promise.all([
    readFile(`${root}/Dockerfile`, "utf8"),
    readFile(`${root}/.dockerignore`, "utf8"),
    ...requiredFiles.map((name) => stat(`${root}/${name}`)),
  ]);
  assert.match(dockerfile, /FROM node:24-alpine/);
  assert.match(dockerfile, /COPY package\*\.json \.\//);
  assert.match(dockerfile, /RUN npm ci --omit=dev/);
  assert.match(dockerfile, /COPY \. \./);
  assert.match(dockerfile, /CMD \["node", "server\.mjs"\]/);
  for (const name of requiredFiles) assert.doesNotMatch(dockerignore, new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  assert.equal(requiredStats.length, requiredFiles.length);
});
