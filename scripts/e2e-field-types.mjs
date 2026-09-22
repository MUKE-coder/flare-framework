// Field types end to end, against a running demo with the Vendor resource:
//
//   node scripts/e2e-field-types.mjs <baseUrl> <adminEmail:password> [screenshotDir]
//
// Fills every format through the admin form the way a person would (searching the
// country pickers, pasting a URL into a domain, typing a title into a slug), then
// checks what was stored and that the API refuses bad values with clear messages.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const [base = "http://127.0.0.1:8787", login = "", shots] = process.argv.slice(2);
const [adminEmail, adminPassword] = login.split(":");
if (!adminEmail) {
  console.error("Usage: node scripts/e2e-field-types.mjs <baseUrl> <adminEmail:password> [screenshotDir]");
  process.exit(1);
}
if (shots) mkdirSync(shots, { recursive: true });

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "en-US" });
const page = await context.newPage();
await page.goto(`${base}/sign-in`);
await page.getByLabel("Email").fill(adminEmail);
await page.getByLabel("Password").fill(adminPassword);
await page.getByRole("button", { name: /sign in/i }).click();
await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));

const handle = `acme-${Date.now()}`;
await page.goto(`${base}/admin/vendors/new`, { waitUntil: "networkidle" });
await page.getByLabel("Name").fill("Acme Studio");
await page.getByLabel("Email").fill("hello@acme.example");

// Phone: pick Uganda by searching its name, then type a local number.
await page.getByRole("combobox", { name: /Country code for Phone/ }).click();
await page.getByPlaceholder("Search country or code…").fill("uganda");
await page.getByRole("option", { name: /Uganda/ }).click();
check("the phone picker shows Uganda's code", (await page.getByRole("combobox", { name: /Country code for Phone/ }).textContent())?.includes("+256"));
await page.getByLabel("Phone", { exact: true }).fill("0772 123456");

await page.getByLabel("Website").fill("https://acme.example/about");
const domain = page.getByLabel("Domain");
await domain.fill("HTTPS://Acme.Example.com/pricing?x=1");
await domain.blur();
check("a pasted URL becomes a bare domain", (await domain.inputValue()) === "acme.example.com", await domain.inputValue());

// Country: search by ISO code.
await page.getByLabel("Country", { exact: true }).click();
await page.getByPlaceholder("Search countries…").fill("KE");
await page.getByRole("option", { name: /Kenya/ }).click();
check("the country picker shows the choice with its flag", (await page.getByRole("combobox").filter({ hasText: "Kenya" }).count()) === 1);

await page.getByLabel("Brand color", { exact: true }).fill("#1A2B3C");
const slug = page.getByLabel("Handle");
await slug.fill(`Acme Studio ${handle.slice(5)}!`);
await slug.blur();
check("the slug input slugifies what was typed", (await slug.inputValue()) === `acme-studio-${handle.slice(5)}`, await slug.inputValue());

await page.getByRole("radio", { name: "Silver" }).check();
await page.getByRole("checkbox", { name: "Design" }).check();
await page.getByRole("checkbox", { name: "Hosting" }).check();
if (shots) await page.screenshot({ path: join(shots, "field-types-form.png"), fullPage: true });

await page.getByRole("button", { name: "Create vendor" }).click();
await page.waitForURL((url) => !url.pathname.endsWith("/new"), { timeout: 20000 }).catch(() => {});
if (shots) await page.screenshot({ path: join(shots, "field-types-after-submit.png"), fullPage: true });
console.log("after submit:", new URL(page.url()).pathname, "|", (await page.locator("[data-slot=field-error], [role=alert]").allTextContents()).join(" / "));

const api = (path, init = {}) => page.request.fetch(`${base}${path}`, { ...init, headers: { "content-type": "application/json", origin: base, ...init.headers } });
const list = await (await api(`/api/vendors?q=${encodeURIComponent(`acme-studio-${handle.slice(5)}`)}`)).json();
const vendor = list.data?.[0];
check("the vendor was created", Boolean(vendor), JSON.stringify(list).slice(0, 200));
if (vendor) {
  check("phone stored as E.164", vendor.phone === "+256772123456", vendor.phone);
  check("country stored as its ISO code", vendor.country === "KE", vendor.country);
  check("domain stored bare and lowercase", vendor.domain === "acme.example.com", vendor.domain);
  check("colour stored lowercase", vendor.brandColor === "#1a2b3c", vendor.brandColor);
  check("radio choice stored", vendor.tier === "silver", vendor.tier);
  check("multiselect stored as an array in option order", JSON.stringify(vendor.services) === JSON.stringify(["design", "hosting"]), JSON.stringify(vendor.services));
}

await page.goto(`${base}/admin/vendors`);
const row = page.getByRole("row").filter({ hasText: "Acme Studio" }).first();
check("the list shows the phone as a formatted tel: link", (await row.locator('a[href="tel:+256772123456"]').textContent())?.includes("+256 772 123456"));
check("the list shows multiselect values as badges", (await row.getByText("Hosting").count()) >= 1);
if (shots) await page.screenshot({ path: join(shots, "field-types-list.png") });

// The API refuses bad values, with a message per field.
const bad = await api("/api/vendors", {
  method: "POST",
  data: { name: "Bad", email: "bad@example.com", tier: "gold", phone: "+1 123", country: "XX", domain: "not a domain", brandColor: "orange", handle: "Not A Slug", services: ["design", "catering"] },
});
const body = await bad.json().catch(() => ({}));
const messages = JSON.stringify(body);
check("invalid values are refused", bad.status() === 400 || bad.status() === 422, String(bad.status()));
for (const [field, text] of [
  ["phone", "valid phone number"],
  ["country", "Choose a country"],
  ["domain", "domain such as"],
  ["brandColor", "colour such as"],
  ["handle", "lowercase letters"],
  ["services", "listed options"],
]) {
  check(`${field} gets a clear message`, messages.includes(text), messages.slice(0, 160));
}

// Clean up.
if (vendor) await api(`/api/vendors/${vendor.id}`, { method: "DELETE" });
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll field-type checks passed");
process.exit(failures ? 1 : 0);
