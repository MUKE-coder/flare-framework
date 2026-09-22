// The generated API reference, against a running demo:
//
//   node scripts/e2e-api-reference.mjs <baseUrl> <adminEmail:password> [screenshotDir]
//
// Signed out, /api/openapi.json lists only sign-in; signed in as admin, every resource.
// /api/reference renders Scalar and its "Try it" request works with the session cookie.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const [base = "http://127.0.0.1:8787", login = "", shots] = process.argv.slice(2);
const [adminEmail, adminPassword] = login.split(":");
if (shots) mkdirSync(shots, { recursive: true });
let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

const anon = await (await fetch(`${base}/api/openapi.json`)).json();
check("a visitor sees only the sign-in endpoints", Object.keys(anon.paths).every((path) => path.startsWith("/api/auth/")), Object.keys(anon.paths).length);

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${base}/sign-in`);
await page.getByLabel("Email").fill(adminEmail);
await page.getByLabel("Password").fill(adminPassword);
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));

const spec = await (await page.request.get(`${base}/api/openapi.json`)).json();
check("an admin sees every resource", ["/api/vendors", "/api/deals", "/api/security-events"].every((path) => path in spec.paths), Object.keys(spec.paths).length);
check("the spec is private to the viewer", (await page.request.get(`${base}/api/openapi.json`)).headers()["cache-control"] === "private, no-store");

await page.goto(`${base}/admin`);
check("the admin sidebar links to the API reference", (await page.getByRole("link", { name: "API reference" }).getAttribute("href")) === "/api/reference");

await page.goto(`${base}/api/reference`, { waitUntil: "networkidle" });
await page.getByText("demo API").first().waitFor({ timeout: 30000 });
check("Scalar renders the reference", (await page.getByText("Vendors").count()) > 0);
if (shots) await page.screenshot({ path: join(shots, "api-reference.png") });

// The same request Scalar's client sends: same origin, cookie attached.
const listed = await page.evaluate(async () => (await fetch("/api/vendors?perPage=1")).status);
check("requests from the reference page are authorized by the session", listed === 200, String(listed));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll API reference checks passed");
process.exit(failures ? 1 : 0);
