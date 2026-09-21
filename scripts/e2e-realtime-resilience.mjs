/**
 * Realtime resilience e2e (M4 exit criterion): the live deal board keeps working
 * through a connection drop and a Durable Object cold start.
 *
 *   node scripts/e2e-realtime-resilience.mjs <adminEmail:password> [appDir]
 *
 * Starts the app with `flare start` (appDir defaults to examples/demo, which must
 * be built), opens the board in two browser tabs as an admin, then kills the whole
 * server process tree. Every socket drops and every Durable Object instance is
 * gone. The server comes back after a pause, and both tabs must reconnect on
 * their own, rebuild presence, and receive a server publish again.
 */
import { spawn, execSync } from "node:child_process";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const [email, password] = (process.argv[2] ?? "").split(":");
if (!email || !password) {
  console.error("Usage: node scripts/e2e-realtime-resilience.mjs <adminEmail:password> [appDir]");
  process.exit(1);
}
const appDir = resolve(process.argv[3] ?? join(import.meta.dirname, "..", "examples", "demo"));
const base = "http://127.0.0.1:8787";
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

function startServer() {
  const child = spawn("npx flare start", { cwd: appDir, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((ready, fail) => {
    const timer = setTimeout(() => fail(new Error("server did not start within 120s")), 120_000);
    const watch = (chunk) => {
      if (/Ready on/.test(String(chunk))) {
        clearTimeout(timer);
        ready(child);
      }
    };
    child.stdout.on("data", watch);
    child.stderr.on("data", watch);
  });
}

function killServer(child) {
  // The server is npx → flare → wrangler → workerd; take down the whole tree.
  if (process.platform === "win32") execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" });
  else process.kill(-child.pid, "SIGKILL");
}

const statusOf = (page) => page.locator("[data-realtime-status]").getAttribute("data-realtime-status");
const viewersOf = async (page) => Number(await page.locator("[data-realtime-viewers]").getAttribute("data-realtime-viewers"));
async function waitFor(page, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate(page).catch(() => false)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

let server = await startServer();
const browser = await chromium.launch({ executablePath: CHROME });
const context = await browser.newContext();
const signin = await context.request.post(`${base}/api/auth/sign-in/email`, { data: { email, password }, headers: { origin: base } });
if (!signin.ok()) throw new Error(`sign-in failed: ${signin.status()}`);

const tabs = [await context.newPage(), await context.newPage()];
for (const tab of tabs) await tab.goto(`${base}/admin/realtime`, { waitUntil: "domcontentloaded", timeout: 120_000 });
for (const [i, tab] of tabs.entries()) {
  check(`tab ${i + 1} connects`, await waitFor(tab, async (p) => (await statusOf(p)) === "open", 30_000));
}
check("both tabs see each other", await waitFor(tabs[0], async (p) => (await viewersOf(p)) === 2, 10_000), `${await viewersOf(tabs[0])} viewers`);

// Drop every connection and every Durable Object instance.
killServer(server);
const dropped = await Promise.all(tabs.map((tab) => waitFor(tab, async (p) => (await statusOf(p)) === "reconnecting", 20_000)));
check("tabs notice the drop and show reconnecting", dropped.every(Boolean));
await new Promise((resolve) => setTimeout(resolve, 5000)); // stay down across a few backoff attempts

const restartedAt = Date.now();
server = await startServer();
const back = await Promise.all(tabs.map((tab) => waitFor(tab, async (p) => (await statusOf(p)) === "open", 60_000)));
check("both tabs reconnect on their own after the cold start", back.every(Boolean), `${Math.round((Date.now() - restartedAt) / 1000)}s after restart`);
check("presence is rebuilt with both tabs", await waitFor(tabs[0], async (p) => (await viewersOf(p)) === 2, 15_000), `${await viewersOf(tabs[0])} viewers`);

// The fresh Durable Object delivers server publishes to the reconnected sockets.
const published = await context.request.post(`${base}/api/realtime/broadcast`, {
  data: { e: "deal.updated", d: { note: "after cold start" } },
  headers: { origin: base },
});
const { recipients } = await published.json();
check("server publish reaches both reconnected tabs", published.status() === 200 && recipients === 2, `${published.status()}, ${recipients} recipient(s)`);
for (const [i, tab] of tabs.entries()) {
  const seen = await waitFor(tab, async (p) => (await p.getByText("after cold start").count()) > 0, 10_000);
  check(`tab ${i + 1} shows the event`, seen);
}

await browser.close();
killServer(server);
console.log(failures ? `\n${failures} check(s) failed.` : "\nRealtime survives drops and cold starts.");
process.exit(failures ? 1 : 0);
