import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (!existsSync(join(root, "dist", "index.html"))) {
  throw new Error("dist가 없습니다. 먼저 npm run build를 실행하세요.");
}

process.env.STATIC_ROOT = "dist";
process.env.PORT ||= "4174";
await import("../server.mjs");

