// Screenshots of the auth screens (and optionally other pages) in every theme, by
// running `flare dev` once per theme with FLARE_THEME set:
//
//   node scripts/theme-shots.mjs <appDir> <outDir> [paths=/sign-in,/sign-up] [themes=all]
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const [appDir = "examples/demo", outDir = "theme-shots", pathArg = "/sign-in,/sign-up", themeArg = "default,coral,amber,sky,mono,emerald"] = process.argv.slice(2);
const paths = pathArg.split(",");
const themes = themeArg.split(",");
const port = 3100;
const cli = resolve("packages/cli/dist/index.js");
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
async function waitFor(url, timeoutMs = 180000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {}
    await sleep(1500);
  }
  throw new Error(`${url} didn't come up`);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
for (const theme of themes) {
  const server = spawn(process.execPath, [cli, "dev", "--port", String(port)], { cwd: appDir, env: { ...process.env, FLARE_THEME: theme }, stdio: "ignore" });
  try {
    await waitFor(`http://localhost:${port}${paths[0]}`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    for (const path of paths) {
      await page.goto(`http://localhost:${port}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      const file = join(outDir, `${theme}${path.replaceAll("/", "-")}.png`);
      await page.screenshot({ path: file, fullPage: process.env.FULL === "1" });
      console.log(`shot ${file}`);
    }
    await page.close();
  } finally {
    if (process.platform === "win32") execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" });
    else server.kill("SIGTERM");
    await sleep(1500);
  }
}
await browser.close();
