import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const publicFiles = ["index.html", "styles.css", "app.js", "engine.js"];

async function loadLocalEnv() {
  const file = join(root, ".env");
  if (!existsSync(file)) return;
  const contents = await readFile(file, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1] in process.env) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

await loadLocalEnv();
const apiBaseUrl = String(process.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
if (apiBaseUrl && !/^https?:\/\//.test(apiBaseUrl)) {
  throw new Error("VITE_API_BASE_URL은 http:// 또는 https:// 주소여야 합니다.");
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all(publicFiles.map((file) => copyFile(join(root, file), join(dist, file))));
await writeFile(join(dist, "config.js"), `export const API_BASE_URL = ${JSON.stringify(apiBaseUrl)};\n`, "utf8");
await copyFile(join(root, "index.html"), join(dist, "404.html"));

console.log(`Build complete: dist (${apiBaseUrl ? `API ${apiBaseUrl}` : "same-origin API"})`);

