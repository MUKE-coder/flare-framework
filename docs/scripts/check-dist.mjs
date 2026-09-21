// Refuse to deploy a build whose pages reference assets that weren't emitted
// (a stale or half-written dist/ ships pages without their styles).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const pages = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".html")) pages.push(path);
  }
};
walk(dist);

const missing = new Set();
for (const page of pages) {
  for (const [, ref] of readFileSync(page, "utf8").matchAll(/(?:href|src)="(\/_astro\/[^"]+)"/g)) {
    if (!existsSync(join(dist, ref))) missing.add(ref);
  }
}
if (missing.size) {
  console.error(`dist/ references ${missing.size} missing asset(s): ${[...missing].join(", ")}\nDelete dist/ and build again.`);
  process.exit(1);
}
console.log(`Checked ${pages.length} pages: every /_astro asset exists.`);
