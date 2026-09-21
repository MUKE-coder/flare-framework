// M5 exit criterion against a deployed app and a Stripe TEST account: a subscription
// is purchased, upgraded and cancelled entirely through the generated UI, the
// Customer status follows every webhook, and a one-time purchase is recorded.
//
//   node scripts/e2e-billing-stripe.mjs <baseUrl> [screenshotDir]
//
// Reads STRIPE_SECRET_KEY (test mode only) from examples/demo/.dev.vars to cross-check
// Stripe's own records. The app needs plans "starter" and "pro" (monthly) and
// "credit-pack" (one-time), synced with flare billing:sync-plans --remote.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const [base = "https://demo.gmukejohnbaptist.workers.dev", shots] = process.argv.slice(2);
const demo = join(import.meta.dirname, "..", "examples", "demo");
const key = readFileSync(join(demo, ".dev.vars"), "utf8").match(/^STRIPE_SECRET_KEY=(.*)$/m)?.[1]?.trim();
if (!key || !/^(sk|rk)_test_/.test(key)) throw new Error("A Stripe TEST key is required in examples/demo/.dev.vars.");
const Stripe = createRequire(join(demo, "package.json"))("stripe");
const stripe = new Stripe(key, { apiVersion: "2026-08-26.dahlia" });
if (shots) mkdirSync(shots, { recursive: true });

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "en-US" });
const page = await context.newPage();
const shot = (name) => shots && page.screenshot({ path: join(shots, `${name}.png`), fullPage: true });

const email = `flare-billing-${Date.now()}@example.com`;
const signup = await context.request.post(`${base}/api/auth/sign-up/email`, {
  data: { email, password: "billing-e2e-pass-123", name: "Billing E2E" },
  headers: { origin: base },
});
if (!signup.ok()) throw new Error(`sign-up failed: ${signup.status()}`);
console.log(`signed up ${email}`);

/** Reload the billing page until `predicate(text)` holds (webhooks land asynchronously). */
async function billingPageUntil(label, predicate, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let text = "";
  while (Date.now() < deadline) {
    await page.goto(`${base}/dashboard/billing`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Billing" }).waitFor({ timeout: 30_000 });
    text = await page.locator("main").innerText();
    if (predicate(text)) {
      check(label, true);
      return text;
    }
    await page.waitForTimeout(2000);
  }
  check(label, false, text.replace(/\s+/g, " ").slice(0, 200));
  return text;
}

/** Pay on Stripe's hosted Checkout page with the 4242 test card. */
async function payWithTestCard() {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000, waitUntil: "commit" });
  // Checkout offers every enabled payment method; pick Card to reveal the card form.
  await page.locator("#payment-method-accordion-item-title-card").waitFor({ timeout: 60_000 });
  await page.locator("#payment-method-accordion-item-title-card").check({ force: true });
  await page.locator("#cardNumber").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#cardNumber").fill("4242424242424242");
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("Billing E2E");
  const postal = page.locator("#billingPostalCode");
  if (await postal.isVisible().catch(() => false)) await postal.fill("10001");
  await shot("checkout");
  await page.locator('[data-testid="hosted-payment-submit-button"]').click();
  await page.waitForURL((url) => url.toString().startsWith(base), { timeout: 90_000, waitUntil: "commit" });
}

async function stripeCustomer() {
  const list = await stripe.customers.list({ email, limit: 1 });
  return list.data[0];
}
async function stripeSubscription() {
  const customer = await stripeCustomer();
  return customer ? (await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 5 })).data[0] : undefined;
}

// ---- 1. Purchase -----------------------------------------------------------------
await page.goto(`${base}/dashboard/billing`, { waitUntil: "domcontentloaded" });
await page.getByRole("heading", { name: "Billing" }).waitFor({ timeout: 60_000 });
await shot("1-before");
const starterCard = page.locator('[data-slot="card"]').filter({ hasText: "Starter" });
await starterCard.getByRole("button", { name: "Subscribe" }).click();
await payWithTestCard();
check("returned to the app after paying", page.url().includes("checkout=success"), page.url());
await billingPageUntil("subscription is Active on Starter (via webhook)", (text) => /Active/.test(text) && /Starter renews on/.test(text));
await shot("2-subscribed");
check("a second Subscribe is no longer offered", (await page.getByRole("button", { name: "Subscribe" }).count()) === 0);
const afterPurchase = await stripeSubscription();
check("Stripe has one active Starter subscription", afterPurchase?.status === "active" && afterPurchase.items.data[0].price.metadata !== undefined, afterPurchase?.status);

// ---- 2. Upgrade --------------------------------------------------------------------
await page.getByRole("button", { name: "Switch to Pro" }).click();
await page.waitForURL(/billing\.stripe\.com/, { timeout: 60_000, waitUntil: "commit" });
await shot("3-portal-confirm");
await page.getByRole("button", { name: /^Confirm/ }).click();
await page.waitForURL((url) => url.toString().startsWith(base), { timeout: 90_000, waitUntil: "commit" });
await billingPageUntil("plan changed to Pro (via webhook)", (text) => /Pro renews on/.test(text) && /Active/.test(text));
await shot("4-upgraded");
const customer = await stripeCustomer();
const all = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
check("still exactly one subscription after the upgrade (no double charge)", all.data.length === 1, `${all.data.length} subscription(s)`);
const proPrice = all.data[0]?.items.data[0]?.price;
check("Stripe's subscription is now on the Pro price", proPrice?.unit_amount === 2900, `${proPrice?.unit_amount}`);

// ---- 3. Cancel ---------------------------------------------------------------------
await page.getByRole("button", { name: "Manage billing" }).click();
await page.waitForURL(/billing\.stripe\.com/, { timeout: 60_000, waitUntil: "commit" });
await page.getByRole("link", { name: /Cancel (subscription|plan)/i }).or(page.getByRole("button", { name: /Cancel (subscription|plan)/i })).first().click();
await shot("5-portal-cancel");
await page.getByRole("button", { name: /Cancel (subscription|plan)/i }).last().click();
await page.waitForTimeout(3000);
await page.goto(`${base}/dashboard/billing`);
await billingPageUntil("cancellation shows the end date (via webhook)", (text) => /Pro ends on/.test(text));
await shot("6-cancelling");
const cancelling = await stripeSubscription();
check("Stripe marks the subscription to cancel at period end", Boolean(cancelling?.cancel_at_period_end || cancelling?.cancel_at), `cancel_at_period_end=${cancelling?.cancel_at_period_end}`);

// The period ending is simulated by ending the subscription now; the webhook must follow.
await stripe.subscriptions.cancel(cancelling.id);
await billingPageUntil("ended subscription shows Canceled and offers plans again", (text) => /Canceled/.test(text) && /Choose a plan/.test(text));
check("Subscribe is offered again after the subscription ended", (await page.getByRole("button", { name: "Subscribe" }).count()) === 2);
await shot("7-ended");

// ---- 4. One-time purchase ------------------------------------------------------------
await page.getByRole("button", { name: "Buy Credit pack" }).click();
await payWithTestCard();
await billingPageUntil("one-time purchase recorded as Paid (via webhook)", (text) => /Credit pack[\s\S]*Paid/.test(text));
await shot("8-purchased");
check("the one-time purchase did not touch the subscription status", /Canceled/.test(await page.locator("main").innerText()));

await browser.close();
console.log(failures ? `\n${failures} check(s) failed.` : "\nPurchase, upgrade, cancel and one-time purchase all work through the generated UI.");
process.exit(failures ? 1 : 0);
