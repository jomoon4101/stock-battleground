import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("npm scripts와 Vercel dist·SPA 설정이 존재한다", async () => {
  const [pkg, vercel] = await Promise.all([readFile(`${root}/package.json`, "utf8").then(JSON.parse), readFile(`${root}/vercel.json`, "utf8").then(JSON.parse)]);
  for (const script of ["dev", "build", "preview", "start"]) assert.equal(typeof pkg.scripts[script], "string");
  assert.equal(vercel.buildCommand, "npm run build");
  assert.equal(vercel.outputDirectory, "dist");
  assert.ok(vercel.routes.some((route) => route.handle === "filesystem"));
  assert.ok(vercel.routes.some((route) => route.dest === "/index.html"));
});

test("환경변수 예시는 이름만 포함하고 Supabase 변수는 사용하지 않는다", async () => {
  const env = await readFile(`${root}/.env.example`, "utf8");
  for (const name of ["VITE_API_BASE_URL", "PORT", "ALLOWED_ORIGINS"]) assert.match(env, new RegExp(`^${name}=$`, "m"));
  assert.doesNotMatch(env, /VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY/);
});

