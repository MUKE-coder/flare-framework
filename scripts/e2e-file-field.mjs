// End-to-end check of the admin file widget against a running app: client-side checks,
// real uploads with progress, the server's content sniffing (with the browser's check
// bypassed), and key scoping on save.
//
// Usage: node scripts/e2e-file-field.mjs <baseUrl> <email:password> [screenshotDir]
// Needs a resource "Deal" with `contract: file:[pdf,image]` (examples/demo).
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const [base = "http://127.0.0.1:8787", login = "owner@flare.test:owner-password-123", shots] = process.argv.slice(2);
const [email, password] = login.split(":");
if (shots) mkdirSync(shots, { recursive: true });

/** A real, decodable PNG of the given size and color. */
function png(width, height, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).map((_, i) => [r, g, b][i % 3])]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", pixels), chunk("IEND", Buffer.alloc(0))]);
}

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const signin = await page.request.post(`${base}/api/auth/sign-in/email`, { data: { email, password }, headers: { origin: base } });
if (!signin.ok()) throw new Error(`sign-in failed: ${signin.status()}`);

// The field label ("Contract") names the drop zone; the native input is hidden from assistive tech.
const zone = () => page.locator("button#field-contract");
const fieldError = () => page.locator('p[role="alert"]');
const pick = (name, mimeType, buffer) => page.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
const shot = (name) => shots && page.screenshot({ path: join(shots, `${name}.png`), fullPage: false });

await page.goto(`${base}/admin/deals/new`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await zone().waitFor({ timeout: 60_000 });
await page.waitForTimeout(1500); // hydration
check("empty state shows what the field accepts", /PDF or image, up to 10\sMB/.test(await zone().innerText()), await zone().innerText());
await shot("1-empty");

// Client-side checks: nothing is uploaded, the reason appears under the field.
let puts = 0;
page.on("request", (request) => request.method() === "PUT" && request.url().includes("/api/storage") && puts++);

await pick("notes.txt", "text/plain", Buffer.from("hello"));
await fieldError().waitFor();
check("wrong type is refused inline", (await fieldError().innerText()) === "Contract accepts PDF or image files.", await fieldError().innerText());

await pick("fake.png", "image/png", Buffer.from("<html><script>alert(1)</script></html>"));
await page.waitForFunction(() => /isn't a valid PNG/.test(document.querySelector('p[role="alert"]')?.textContent ?? ""));
check("HTML disguised as a PNG is refused before upload", true, await fieldError().innerText());
await shot("2-error");

await pick("huge.pdf", "application/pdf", Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(11 * 1024 * 1024)]));
await page.waitForFunction(() => /is 11\sMB; the limit is 10\sMB/.test(document.querySelector('p[role="alert"]')?.textContent ?? ""));
check("oversize file is refused before upload", true, await fieldError().innerText());
check("none of those reached storage", puts === 0, `${puts} PUT(s)`);

// Server gate: swap a real PNG's bytes for HTML in flight, as a hostile client could.
await page.route("**/api/storage?token=*", (route) =>
  route.request().method() === "PUT"
    ? route.continue({ postData: Buffer.from("<html><script>alert(1)</script>....................") })
    : route.continue(),
);
await pick("sneaky.png", "image/png", png(8, 8, [200, 30, 30]));
await page.waitForFunction(() => /contents don't match its type/.test(document.querySelector('p[role="alert"]')?.textContent ?? ""), null, { timeout: 30_000 });
check("server refuses bytes that contradict the type", true, await fieldError().innerText());
await page.unroute("**/api/storage?token=*");

// A real upload, slowed down so the progress state is visible.
await page.route("**/api/storage?token=*", async (route) => {
  if (route.request().method() === "PUT") await new Promise((resolve) => setTimeout(resolve, 1500));
  await route.continue();
});
await pick("logo.png", "image/png", png(96, 96, [37, 99, 235]));
await page.getByRole("progressbar").waitFor({ timeout: 10_000 });
check("progress bar shows while uploading", true);
await shot("3-uploading");
await page.getByRole("button", { name: "Replace contract file" }).waitFor({ timeout: 30_000 });
await page.unroute("**/api/storage?token=*");
check("upload succeeds and the error clears", (await fieldError().count()) === 0);
const thumb = page.locator('img[src^="blob:"], img[src*="/api/storage"]').first();
check("image shows a thumbnail", (await thumb.count()) === 1);
await shot("4-uploaded");

// Save, then reopen: the stored image loads through a signed read URL.
await page.locator("#field-title").fill(`File field e2e ${Date.now()}`);
await page.getByRole("combobox").first().click();
await page.getByRole("option").first().click();
await page.getByRole("button", { name: /^Create/ }).click();
await page.waitForURL(/\/admin\/deals(\?|$)/, { timeout: 60_000 });
const list = await (await page.request.get(`${base}/api/deals?perPage=100&sort=-createdAt`)).json();
const saved = list.data.find((deal) => deal.contract?.endsWith("-logo.png"));
check("record saved with a key under deals/contract/", saved?.contract?.startsWith("deals/contract/"), saved?.contract);

await page.goto(`${base}/admin/deals/${saved.id}/edit`, { waitUntil: "domcontentloaded", timeout: 120_000 });
const stored = page.locator('img[src*="/api/storage"]');
await stored.waitFor({ timeout: 30_000 });
check("edit page shows the stored image", await stored.evaluate((img) => img.complete && img.naturalWidth === 96));
await shot("5-edit");
const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Open" }).click()]);
await popup.waitForLoadState("domcontentloaded");
const opened = await page.request.get(popup.url());
check("Open serves the file", opened.status() === 200 && opened.headers()["content-type"] === "image/png", `${opened.status()} ${opened.headers()["content-type"]}`);
await popup.close();

// Key scoping: a record can't point at another field's (or resource's) file.
const patch = await page.request.patch(`${base}/api/deals/${saved.id}`, {
  data: { contract: "contacts/avatar/2026/09/00000000-0000-0000-0000-000000000000-secret.png" },
  headers: { origin: base, "content-type": "application/json" },
});
const patchBody = await patch.json();
check("API refuses a key from another field", patch.status() === 422 && JSON.stringify(patchBody).includes("wasn't uploaded for this field"), `${patch.status()}`);

// Clean up the record this run created.
await page.request.delete(`${base}/api/deals/${saved.id}`, { headers: { origin: base } });

check("no client errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll file field checks passed.");
process.exit(failures ? 1 : 0);
