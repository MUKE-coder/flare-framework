// Billing checks that need no Stripe account, against a running app built from
// `flare gen billing` (examples/demo):
//
//   node scripts/e2e-billing-offline.mjs <baseUrl> <adminEmail:password> <webhookSecret> [screenshotDir]
//
// 1. Policies: a user without a role can't read or rewrite billing records
//    through the REST API (the webhook alone writes subscription state).
// 2. Webhook signatures, verified on the Workers runtime: missing, forged and
//    stale signatures are refused; a correctly signed event is accepted.
// 3. The billing page renders subscription plans and one-time products, and
//    Stripe errors surface under the button instead of failing silently.
//
// The app's STRIPE_WEBHOOK_SECRET must equal <webhookSecret>, and its
// STRIPE_SECRET_KEY must be a placeholder (no Stripe calls are expected to succeed).
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const [base = "http://127.0.0.1:8787", login = "", secret = "", shots] = process.argv.slice(2);
const [adminEmail, adminPassword] = login.split(":");
if (!adminEmail || !secret) {
  console.error("Usage: node scripts/e2e-billing-offline.mjs <baseUrl> <adminEmail:password> <webhookSecret> [screenshotDir]");
  process.exit(1);
}
if (shots) mkdirSync(shots, { recursive: true });

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

const cookiesOf = (response) => response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
async function signUp() {
  const email = `billing-${Date.now()}@example.com`;
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, password: "billing-pass-123", name: "Billing Probe" }),
  });
  if (response.status !== 200) throw new Error(`sign-up failed: ${response.status}`);
  return { email, cookie: cookiesOf(response) };
}
const api = (path, cookie, init = {}) =>
  fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", origin: base, ...(cookie ? { cookie } : {}), ...init.headers } });

// ---- 1. Policies ---------------------------------------------------------------
const user = await signUp();
check("roleless user can't list customers", (await api("/api/customers", user.cookie)).status === 403);
check("roleless user can't create a customer", (await api("/api/customers", user.cookie, { method: "POST", body: JSON.stringify({ name: "x", email: "x@example.com" }) })).status === 403);
check("roleless user can read plans", (await api("/api/plans", user.cookie)).status === 200);
const editPlans = await api("/api/plans", user.cookie, { method: "POST", body: JSON.stringify({ name: "Free", slug: "free", stripePriceId: "price_free", amount: 0, currency: "usd" }) });
check("roleless user can't edit plans", editPlans.status === 403, `${editPlans.status} ${await editPlans.text()}`);
check("roleless user can't read purchases", (await api("/api/purchases", user.cookie)).status === 403);

const adminSignIn = await fetch(`${base}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
});
const admin = cookiesOf(adminSignIn);
check("admin can list customers", (await api("/api/customers", admin)).status === 200);

// ---- 2. Webhook signatures -----------------------------------------------------
// Stripe's scheme: HMAC-SHA256 over "<timestamp>.<payload>", sent as t=…,v1=…
const sign = (payload, timestamp = Math.floor(Date.now() / 1000), key = secret) =>
  `t=${timestamp},v1=${createHmac("sha256", key).update(`${timestamp}.${payload}`).digest("hex")}`;
// An event type the handler ignores, so acceptance proves only the signature check.
const event = JSON.stringify({ id: "evt_offline", object: "event", type: "product.created", api_version: "2026-08-26.dahlia", data: { object: { id: "prod_x", object: "product" } } });
const hook = (signature, body = event) =>
  fetch(`${base}/api/webhooks/stripe`, { method: "POST", headers: { "content-type": "application/json", ...(signature ? { "stripe-signature": signature } : {}) }, body });

check("webhook without a signature is refused", (await hook(null)).status === 400);
check("webhook signed with the wrong secret is refused", (await hook(sign(event, undefined, "whsec_wrong"))).status === 400);
check("webhook with a tampered body is refused", (await hook(sign(event), event.replace("prod_x", "prod_y"))).status === 400);
check("webhook older than the 5-minute tolerance is refused", (await hook(sign(event, Math.floor(Date.now() / 1000) - 3600))).status === 400);
const accepted = await hook(sign(event));
check("correctly signed webhook is accepted on Workers", accepted.status === 200, `${accepted.status} ${await accepted.text()}`);

// ---- 3. Billing page ------------------------------------------------------------
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addCookies(
  user.cookie.split("; ").map((pair) => {
    const [name, ...rest] = pair.split("=");
    return { name, value: rest.join("="), url: base };
  }),
);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(`${base}/dashboard/billing`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByRole("heading", { name: "Billing" }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(1500);
check("page shows subscription plans", (await page.getByRole("button", { name: "Subscribe" }).count()) === 2);
check("page shows one-time products", (await page.getByRole("button", { name: "Buy Credit pack" }).count()) === 1);
check("page reports no subscription yet", (await page.getByText("No subscription").count()) === 1);
if (shots) await page.screenshot({ path: join(shots, "billing-empty.png"), fullPage: true });

// With a placeholder key Stripe rejects the call; the user must see why, inline.
await page.getByRole("button", { name: "Subscribe" }).first().click();
const alert = page.getByRole("alert");
await alert.waitFor({ timeout: 30_000 });
check("a Stripe failure is shown under the button", /Stripe|reached|try again/i.test(await alert.innerText()), await alert.innerText());
if (shots) await page.screenshot({ path: join(shots, "billing-error.png"), fullPage: true });
check("no client errors", errors.length === 0, errors.join(" | "));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll offline billing checks passed.");
process.exit(failures ? 1 : 0);
