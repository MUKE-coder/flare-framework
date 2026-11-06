// Refuse to deploy a build that would be wrong in one of two ways:
//
//   1. Pages referencing assets that weren't emitted — a stale or half-written
//      dist/ ships pages without their styles.
//   2. Pages missing from the sitemap. A page nothing links to and the sitemap
//      does not list is a page Google has no way to find, which is a silent
//      failure: the site looks fine and the page is simply never indexed.
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

// Every page the build emitted, as the URL it is served at. 404.html is not a page
// anybody should be sent to, so it is the one exclusion.
const SITE = "https://flare-docs.codetotech.com";
const served = pages
  .filter((page) => page.endsWith(`index.html`))
  .map((page) => {
    const relative = page.slice(dist.length).replace(/\\/g, "/").replace(/index\.html$/, "");
    return `${SITE}/${relative}`;
  });

const sitemapFile = join(dist, "sitemap-0.xml");
if (!existsSync(sitemapFile)) {
  console.error("dist/sitemap-0.xml is missing, so nothing would be indexed. Did the build finish?");
  process.exit(1);
}
const listed = new Set([...readFileSync(sitemapFile, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url));
const unlisted = served.filter((url) => !listed.has(url));
if (unlisted.length) {
  console.error(
    `${unlisted.length} page(s) are not in the sitemap, so Google has no way to find them:\n` +
      unlisted.map((url) => `  ${url}`).join("\n"),
  );
  process.exit(1);
}
console.log(`Checked the sitemap: all ${served.length} pages are listed.`);
