import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const publicFiles = ["index.html", "styles.css", "mobile-first.css", "design-system.css", "app.js", "ui-shell.js", "ui-state.js", "onboarding-state.js", "sector-art.js", "engine.js", "i18n.js", "ai-chat.js", "manifest.webmanifest", "service-worker.js", "capacitor.config.json"];

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
const defaultRenderApiBaseUrl = "https://stock-battleground-server.onrender.com";
if (apiBaseUrl && !/^https?:\/\//.test(apiBaseUrl)) {
  throw new Error("VITE_API_BASE_URL은 http:// 또는 https:// 주소여야 합니다.");
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all(publicFiles.map((file) => copyFile(join(root, file), join(dist, file))));
await mkdir(join(dist, "survival-mvp"), { recursive: true });
const survivalMvpFiles = (await readdir(join(root, "survival-mvp"))).filter((file) => file.endsWith(".js"));
await Promise.all(survivalMvpFiles.map((file) => copyFile(join(root, "survival-mvp", file), join(dist, "survival-mvp", file))));
await mkdir(join(dist, "assets"), { recursive: true });
const assetFiles = (await readdir(join(root, "assets"))).filter((file) => file === "stock-meme-avatars.png" || file === "stock-survival-theme-reference.png" || file === "app-icon.svg" || /^sector-ceo-.+-v2\.webp$/.test(file));
await Promise.all(assetFiles.map((file) => copyFile(join(root, "assets", file), join(dist, "assets", file))));
await writeFile(
  join(dist, "config.js"),
  `export const API_BASE_URL = ${JSON.stringify(apiBaseUrl)};\nexport const DEFAULT_RENDER_API_BASE_URL = ${JSON.stringify(defaultRenderApiBaseUrl)};\n`,
  "utf8",
);
await copyFile(join(root, "index.html"), join(dist, "404.html"));

console.log(`Build complete: dist (${apiBaseUrl ? `API ${apiBaseUrl}` : "same-origin API"})`);
