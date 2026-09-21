// Security checks against a running app built from `flare gen security` (examples/demo):
//
//   node scripts/e2e-security.mjs <baseUrl> <adminEmail:password> [screenshotDir]
//
// 1. A simulated login brute force from one IP is detected, logged as a
//    SecurityEvent and banned at the Worker layer; other IPs are unaffected.
// 2. The ban is visible on /admin/security with its blocked-request count.
// 3. An admin can unban and ban by hand from the dashboard.
// 4. A user without a role can't read security events or open the dashboard.
//
// Client IPs are simulated with CF-Connecting-IP, which local wrangler passes
// through (Cloudflare's edge sets it itself in production, so it can't be forged there).
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const [base = "http://127.0.0.1:8787", login = "", shots] = process.argv.slice(2);
const [adminEmail, adminPassword] = login.split(":");
if (!adminEmail) {
  console.error("Usage: node scripts/e2e-security.mjs <baseUrl> <adminEmail:password> [screenshotDir]");
  process.exit(1);
}
if (shots) mkdirSync(shots, { recursive: true });

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const octet = () => 1 + Math.floor(Math.random() * 250);
const attacker = `198.51.100.${octet()}`;
const bystander = `192.0.2.${octet()}`;
const adminIp = `203.0.113.${octet()}`;
const userIp = `203.0.113.${octet()}`;

const cookiesOf = (response) => response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
const request = (path, ip, init = {}) =>
  fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", origin: base, "cf-connecting-ip": ip, ...init.headers } });
const signIn = (email, password, ip) => request("/api/auth/sign-in/email", ip, { method: "POST", body: JSON.stringify({ email, password }) });

// Wait for waitUntil bookkeeping (detectors run after the response is sent).
async function until(label, probe, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    if (await probe()) return true;
    await sleep(250);
  }
  return false;
}

// ---- 1. Brute force -> detected, logged, banned ------------------------------------
const statuses = [];
for (let i = 0; i < 5; i++) statuses.push((await signIn("nobody@example.com", `wrong-password-${i}`, attacker)).status);
check("five failed sign-ins are refused normally", statuses.every((status) => status === 401), statuses.join(","));

const banned = await until("ban", async () => (await request("/api/health", attacker)).status === 403);
check("the attacker's IP is banned at the Worker layer", banned);
const denied = await request("/api/auth/sign-in/email", attacker, { method: "POST", body: JSON.stringify({ email: adminEmail, password: adminPassword }) });
check("a banned IP can't sign in even with valid credentials", denied.status === 403 && (await denied.text()) === "Access denied.");
check("other IPs are unaffected", (await request("/api/health", bystander)).status === 200);

const adminSignIn = await signIn(adminEmail, adminPassword, adminIp);
check("admin signs in from another IP", adminSignIn.status === 200, String(adminSignIn.status));
const adminCookie = cookiesOf(adminSignIn);
const eventsResponse = await request(`/api/security-events?sort=-createdAt&perPage=50`, adminIp, { headers: { cookie: adminCookie } });
const events = eventsResponse.ok ? (await eventsResponse.json()).data : [];
const event = events.find((row) => row.ip === attacker && row.kind === "login-brute-force");
check("the brute force is logged as a SecurityEvent", Boolean(event), `${eventsResponse.status}, ${events.length} events`);
check("the event records severity, count and the ban", event?.severity === "high" && event?.count === 5 && event?.banned === true, JSON.stringify(event ?? {}));

// ---- 4. Roleless user --------------------------------------------------------------
const email = `security-${Date.now()}@example.com`;
const signUp = await request("/api/auth/sign-up/email", userIp, { method: "POST", body: JSON.stringify({ email, password: "security-pass-123", name: "Security Probe" }) });
const userCookie = cookiesOf(signUp);
check("roleless user can't read security events", (await request("/api/security-events", userIp, { headers: { cookie: userCookie } })).status === 403);
const userPage = await request("/admin/security", userIp, { headers: { cookie: userCookie }, redirect: "manual" });
check("roleless user can't open the dashboard", userPage.status !== 200 || !(await userPage.text()).includes("Banned IPs"), String(userPage.status));

// ---- 2 & 3. Dashboard, unban, ban --------------------------------------------------
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const context = await browser.newContext({ extraHTTPHeaders: { "cf-connecting-ip": adminIp }, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await page.goto(`${base}/sign-in`);
await page.getByLabel("Email").fill(adminEmail);
await page.getByLabel("Password").fill(adminPassword);
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));

await page.goto(`${base}/admin/security`);
// Ban rows carry an Unban button; the same IP also shows up under recent events.
const banRow = (ip) => page.getByRole("row").filter({ hasText: ip }).filter({ has: page.getByRole("button", { name: `Unban ${ip}` }) });
const row = banRow(attacker);
check("the ban is listed on /admin/security", (await row.count()) === 1);
const blocked = Number((await row.getByRole("cell").nth(2).textContent())?.trim());
check("the ban shows its blocked-request count", blocked >= 2, String(blocked));
check("the event appears under recent events", (await page.getByRole("row").filter({ hasText: "login-brute-force" }).filter({ hasText: attacker }).count()) >= 1);
check("the sidebar links to Security", (await page.getByRole("link", { name: "Security", exact: true }).count()) >= 1);
if (shots) await page.screenshot({ path: join(shots, "security-dashboard.png"), fullPage: true });

await row.getByRole("button", { name: `Unban ${attacker}` }).click();
await row.waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
check("unban removes the row", (await row.count()) === 0);
check("the unbanned IP gets through again", (await request("/api/health", attacker)).status === 200);

const manual = `198.51.100.${octet()}`;
await page.getByLabel("IP address").fill(manual);
await page.getByLabel("Reason").fill("e2e manual ban");
await page.getByRole("button", { name: "Ban IP" }).click();
await page.getByRole("status").filter({ hasText: "Banned." }).waitFor({ timeout: 15000 }).catch(() => {});
check("a manual ban is listed", (await banRow(manual).count()) === 1);
check("the manually banned IP is refused", (await request("/api/health", manual)).status === 403);
await page.getByLabel("IP address").fill("not-an-ip");
await page.getByRole("button", { name: "Ban IP" }).click();
check("an invalid IP is rejected with a message", await page.getByRole("alert").filter({ hasText: "isn't an IP address" }).waitFor({ timeout: 15000 }).then(() => true, () => false));
check("the rejected value stays in the field", (await page.getByLabel("IP address").inputValue()) === "not-an-ip");
if (shots) await page.screenshot({ path: join(shots, "security-manual-ban.png"), fullPage: true });

// Leave no bans behind.
await banRow(manual).getByRole("button").click();
await until("cleanup", async () => (await request("/api/health", manual)).status === 200);
await browser.close();

console.log(failures ? `\n${failures} check(s) failed` : "\nAll security checks passed");
process.exit(failures ? 1 : 0);
