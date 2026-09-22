// Every sign-in method end to end, against a running demo whose email goes to the
// console. Use http://localhost:PORT, not 127.0.0.1: WebAuthn refuses IP addresses,
// so passkeys only work on localhost or a real domain. The demo's email goes to the
// console (no RESEND_API_KEY), so links and codes are read from the server log:
//
//   node scripts/e2e-auth.mjs <baseUrl> <serverLogFile> [screenshotDir]
//
// Covers: sign-up, two-step password sign-in, magic link, email code, password reset,
// authenticator 2FA (setup, sign-in, backup code), email 2FA, the "email sign-in is
// off" notice for 2FA accounts, passkeys (Chrome's virtual authenticator), sessions.
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const [base = "http://127.0.0.1:8787", logFile, shots] = process.argv.slice(2);
if (!logFile) {
  console.error("Usage: node scripts/e2e-auth.mjs <baseUrl> <serverLogFile> [screenshotDir]");
  process.exit(1);
}
if (shots) mkdirSync(shots, { recursive: true });

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The newest console email to `to` whose subject starts with `subject`, after `since` log bytes. */
async function mail(to, subject, since) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const text = readFileSync(logFile, "utf8").slice(since);
    const blocks = text.split("[flare/mail]").slice(1).reverse();
    const found = blocks.find((block) => block.includes(`To: ${to}`) && block.includes(`Subject: ${subject}`));
    if (found) return found;
    await sleep(250);
  }
  throw new Error(`No "${subject}" email to ${to} in the log.`);
}
const logSize = () => readFileSync(logFile, "utf8").length;
const linkIn = (block) => block.match(/https?:\/\/\S+/)?.[0];
const codeIn = (block) => block.match(/Subject: [^\n]*?(\d{6})/)?.[1];

/** RFC 6238 TOTP from a base32 secret. */
function totp(secret, offset = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const at = hmac[hmac.length - 1] & 0xf;
  return String(((hmac.readUInt32BE(at) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const email = `auth-${Date.now()}@example.com`;
let password = "first-password-1";

const signOut = async () => {
  await page.evaluate(() => fetch("/api/auth/sign-out", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
  await context.clearCookies();
};
const startSignIn = async () => {
  await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Password").waitFor();
};
/** Waits (up to 10s) for text to appear. */
const shows = (text) => page.getByText(text).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
const onDashboard = async () => {
  await page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 20000 }).catch(() => {});
  return new URL(page.url()).pathname.startsWith("/dashboard");
};

// ---- Sign-up and password sign-in --------------------------------------------------
let mark = logSize();
await page.goto(`${base}/sign-up`, { waitUntil: "networkidle" });
if (shots) await page.screenshot({ path: join(shots, "auth-sign-up.png") });
await page.getByLabel("Name").fill("Auth Probe");
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Create account" }).click();
check("sign-up lands on the dashboard", await onDashboard(), page.url());
check("sign-up sends a verification email", Boolean(linkIn(await mail(email, "Verify your email", mark))));

await signOut();
await startSignIn();
if (shots) await page.screenshot({ path: join(shots, "auth-password-step.png") });
await page.getByLabel("Password").fill("wrong-password-9");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
check("a wrong password gets a clear message", await shows("That email and password don't match."));
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
check("the right password signs in", await onDashboard());

// ---- Magic link ---------------------------------------------------------------------
await signOut();
mark = logSize();
await startSignIn();
await page.getByRole("button", { name: "Email me a sign-in link" }).click();
check("the magic link step says to check email", await shows("Check your email"));
await page.goto(linkIn(await mail(email, "Your sign-in link", mark)));
check("the magic link signs in", await onDashboard());

// ---- Email code ---------------------------------------------------------------------
await signOut();
mark = logSize();
await startSignIn();
await page.getByRole("button", { name: "Email me a code" }).click();
const signInCode = codeIn(await mail(email, "Your sign-in code", mark));
await page.getByLabel("Code").fill("000000");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
check("a wrong code gets a clear message", await shows("That code isn't right"));
await page.getByLabel("Code").fill(signInCode);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
check("the emailed code signs in", await onDashboard());

// ---- Password reset -----------------------------------------------------------------
await signOut();
mark = logSize();
await page.goto(`${base}/forgot-password?email=${encodeURIComponent(email)}`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Send reset link" }).click();
await page.goto(linkIn(await mail(email, "Reset your password", mark)), { waitUntil: "networkidle" });
password = "second-password-2";
await page.getByLabel("New password").fill(password);
await page.getByLabel("Confirm it").fill(password);
await page.getByRole("button", { name: "Set new password" }).click();
await page.waitForURL((url) => url.pathname === "/sign-in");
check("after a reset, sign-in says the password changed", await page.getByText("Your password is changed").isVisible().catch(() => false));
await startSignIn();
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
check("the new password signs in", await onDashboard());

// ---- Authenticator 2FA ----------------------------------------------------------------
await page.goto(`${base}/dashboard/account`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Set up an authenticator app" }).click();
await page.locator("#two-factor-password").fill(password);
await page.getByRole("button", { name: "Continue" }).click();
await page.getByText("Can't scan it?").click();
const secret = (await page.locator("details p").textContent())?.trim();
check("setup shows a QR code and the secret", (await page.getByRole("img", { name: /QR code/ }).count()) === 1 && Boolean(secret));
if (shots) await page.screenshot({ path: join(shots, "auth-2fa-setup.png"), fullPage: true });
await page.locator("#totp-code").fill(totp(secret));
await page.getByRole("button", { name: "Turn on" }).click();
await page.getByText("Save these backup codes").waitFor({ timeout: 15000 });
const backupCodes = (await page.locator("ul.font-mono li").allTextContents()).map((code) => code.trim());
check("turning on 2FA shows backup codes", backupCodes.length >= 8, String(backupCodes.length));

await signOut();
await startSignIn();
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL((url) => url.pathname === "/two-factor", { timeout: 15000 }).catch(() => {});
check("a correct password on a 2FA account continues to /two-factor", new URL(page.url()).pathname === "/two-factor");
if (shots) await page.screenshot({ path: join(shots, "auth-2fa-challenge.png") });
await page.getByLabel("Code").fill(totp(secret));
await page.getByRole("button", { name: "Verify" }).click();
check("the authenticator code completes sign-in", await onDashboard());

await signOut();
await startSignIn();
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL((url) => url.pathname === "/two-factor");
await page.getByRole("tab", { name: "Backup code" }).click();
await page.getByLabel("Backup code").fill(backupCodes[0]);
await page.getByRole("button", { name: "Verify" }).click();
check("a backup code completes sign-in", await onDashboard());

await signOut();
await startSignIn();
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL((url) => url.pathname === "/two-factor");
mark = logSize();
await page.getByRole("tab", { name: "Email code" }).click();
await page.getByRole("button", { name: "Email me a code" }).click();
await page.getByLabel("Code").fill(codeIn(await mail(email, "Your verification code", mark)));
await page.getByRole("button", { name: "Verify" }).click();
check("an emailed second-factor code completes sign-in", await onDashboard());

// A one-step email sign-in would skip the second factor: it's refused, without saying so on screen.
await signOut();
mark = logSize();
await startSignIn();
await page.getByRole("button", { name: "Email me a sign-in link" }).click();
const notice = await mail(email, "Sign in with your password or a passkey", mark);
check("a 2FA account gets a notice instead of a sign-in link", !notice.includes("magic-link/verify"));
check("the screen doesn't reveal that the account uses 2FA", await page.getByText("Check your email").isVisible().catch(() => false));

// ---- Passkeys -----------------------------------------------------------------------
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
await startSignIn();
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL((url) => url.pathname === "/two-factor");
await page.getByLabel("Code").fill(totp(secret));
await page.getByRole("button", { name: "Verify" }).click();
await onDashboard();
await page.goto(`${base}/dashboard/account`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Add a passkey" }).click();
await page.getByText("Added").first().waitFor({ timeout: 15000 }).catch(() => {});
check("a passkey can be added", (await page.getByRole("button", { name: /^Remove / }).count()) === 1);
check("the account page lists this device's session", await page.getByText("This device").isVisible().catch(() => false));
if (shots) await page.screenshot({ path: join(shots, "auth-account.png"), fullPage: true });

await signOut();
await page.goto(`${base}/sign-in`, { waitUntil: "networkidle" });
if (!new URL(page.url()).pathname.startsWith("/dashboard")) {
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
}
check("the passkey signs in (no password, no second factor)", await onDashboard());

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll auth checks passed");
process.exit(failures ? 1 : 0);
