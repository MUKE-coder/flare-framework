// Screenshot pages of a running app with the locally installed Chrome (no browser download).
// Usage: node scripts/screenshot.mjs <baseUrl> <outDir> "<path>[|name]"... [--login email:password] [--dark] [--width 1440]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i === -1) return undefined; const [, value] = args.splice(i, 2); return value; };
const bool = (name) => { const i = args.indexOf(name); if (i === -1) return false; args.splice(i, 1); return true; };
const login = flag("--login");
const dark = bool("--dark");
const width = Number(flag("--width") ?? 1440);
const [base, outDir, ...pages] = args;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: dark ? "dark" : "light" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });

if (login) {
  const [email, password] = login.split(":");
  const response = await page.request.post(`${base}/api/auth/sign-in/email`, { data: { email, password }, headers: { origin: base } });
  if (!response.ok()) throw new Error(`login failed: ${response.status()} ${await response.text()}`);
}

for (const entry of pages) {
  const [path, name = path.replace(/[^\w]+/g, "_") || "root"] = entry.split("|");
  const response = await page.goto(base + path, { waitUntil: "load", timeout: 120_000 });
  await page.waitForTimeout(1500);
  const file = join(outDir, `${name}${dark ? "-dark" : ""}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`${response?.status()} ${page.url()} -> ${file}`);
}
if (errors.length) console.log(errors.join("\n"));
await browser.close();
