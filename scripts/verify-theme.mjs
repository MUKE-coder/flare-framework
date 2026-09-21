// Verify the Flare monochrome theme actually renders in a real browser
// (computed style assertions, since we care about the cascade outcome).
// Usage: node scripts/verify-theme.mjs <baseUrl>
import { chromium } from "playwright-core";

const base = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
let failed = 0;

async function check(colorScheme) {
  const context = await browser.newContext({ colorScheme });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.goto(base + "/", { waitUntil: "load", timeout: 60_000 });
  await page.waitForTimeout(800);

  const tokens = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const linkColor = getComputedStyle(document.querySelector("main a") || document.body).color;
    const sidebarBg = getComputedStyle(document.querySelector(".sidebar-content") || document.body).backgroundColor;
    return {
      accent: root.getPropertyValue("--sl-color-accent").trim(),
      bg: root.getPropertyValue("--sl-color-bg").trim(),
      linkColor,
      sidebarBg,
    };
  });

  const isBlue = (v) => /#3d50f5|#3369ff|rgb\(51, 105, 255\)|rgb\(61, 80, 245\)/.test(v);
  const expectMonochrome = (label, value) => {
    const bad = !value || isBlue(value) || value === "transparent" || value === "";
    if (bad) { console.log(`FAIL [${colorScheme}] ${label}: ${value}`); failed++; }
    else console.log(`PASS [${colorScheme}] ${label}: ${value}`);
  };

  expectMonochrome("--sl-color-accent is monochrome", tokens.accent);
  expectMonochrome("content link color is monochrome", tokens.linkColor);
  expectMonochrome("sidebar background", tokens.sidebarBg);

  const expectedBg = colorScheme === "dark" ? "rgb(10, 10, 10)" : "rgb(255, 255, 255)";
  console.log(`INFO [${colorScheme}] --sl-color-bg = ${tokens.bg} (expect ± ${expectedBg})`);

  if (errors.length) { console.log(`FAIL [${colorScheme}] page errors:\n${errors.join("\n")}`); failed++; }
  await context.close();
}

await check("dark");
await check("light");
await browser.close();
process.exit(failed ? 1 : 0);