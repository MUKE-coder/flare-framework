/**
 * Realtime e2e: exercises the M4 primitive and its access rules against a running
 * demo app (`flare start` or a deployed worker).
 *
 *   node scripts/e2e-realtime.mjs <baseUrl> <adminEmail:password>
 *
 * The admin account must have the admin or staff role (the demo's "deals" channel
 * allows only those). A throwaway roleless user is signed up to check refusals.
 *
 *   1. access: anonymous, cross-site and roleless upgrades are refused
 *   2. protocol: two admin sockets share the channel (hello, presence, ping/pong,
 *      client broadcast, leave)
 *   3. server publish: 401 signed out, 403 without the role, delivered for an admin
 */
import { strict as assert } from "node:assert";

const base = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const [adminEmail, adminPassword] = (process.argv[3] ?? "").split(":");
if (!adminEmail || !adminPassword) {
  console.error("Usage: node scripts/e2e-realtime.mjs <baseUrl> <adminEmail:password>");
  process.exit(1);
}
const wsUrl = `${base.replace(/^http/, "ws")}/realtime/deals/ws`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (line) => console.log(line);

async function poll(frames, pick, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = frames.find(pick);
    if (hit) return hit;
    await wait(50);
  }
  return undefined;
}

async function signIn(email, password) {
  const response = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `sign-in for ${email} (got ${response.status})`);
  return cookiesOf(response);
}

const cookiesOf = (response) => response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");

/** Open a socket (Node's WebSocket accepts headers, unlike a browser's). Resolves null if refused. */
function connect({ cookie, origin = base } = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket(wsUrl, { headers: { ...(cookie ? { cookie } : {}), origin } });
    const frames = [];
    let opened = false;
    ws.onmessage = (event) => frames.push(JSON.parse(event.data));
    ws.onopen = () => {
      opened = true;
      resolve({ ws, frames });
    };
    ws.onerror = () => !opened && resolve(null);
    ws.onclose = () => !opened && resolve(null);
    setTimeout(() => !opened && resolve(null), 8000);
  });
}

// ---- 1. Who may connect -------------------------------------------------------
const admin = await signIn(adminEmail, adminPassword);

assert.equal(await connect(), null, "anonymous upgrade must be refused");
log("PASS anonymous upgrade refused");

assert.equal(await connect({ cookie: admin, origin: "https://evil.example" }), null, "cross-site upgrade must be refused");
log("PASS cross-site upgrade refused (even with a valid admin cookie)");

const probeEmail = `rt-${Date.now()}@example.com`;
const signup = await fetch(`${base}/api/auth/sign-up/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ email: probeEmail, password: "probe-pass-123", name: "Realtime Probe" }),
});
assert.equal(signup.status, 200, `sign-up (got ${signup.status})`);
const roleless = cookiesOf(signup);
assert.equal(await connect({ cookie: roleless }), null, "a user without admin/staff must be refused");
log("PASS roleless user refused");

// ---- 2. Protocol over a shared channel ----------------------------------------
const a = await connect({ cookie: admin });
assert.ok(a, "admin A connects");
const helloA = await poll(a.frames, (f) => f.t === "hello");
assert.ok(helloA, "A receives hello");

const b = await connect({ cookie: admin });
assert.ok(b, "admin B connects");
const helloB = await poll(b.frames, (f) => f.t === "hello");
assert.ok(await poll(a.frames, (f) => f.t === "presence" && f.joined?.connectionId === helloB.connectionId), "A sees B join");
log("PASS presence: join propagates");

a.ws.send(JSON.stringify({ t: "ping" }));
assert.ok(await poll(a.frames, (f) => f.t === "pong"), "A gets a pong");
log("PASS heartbeat ping/pong");

a.ws.send(JSON.stringify({ t: "send", e: "page.event", d: { message: "hello" } }));
const relayed = await poll(b.frames, (f) => f.t === "event" && f.e === "page.event");
assert.ok(relayed, "B receives A's broadcast");
assert.equal(relayed.from, helloA.connectionId, "a client broadcast carries its sender");
log("PASS client broadcast relayed, marked with its sender");

a.ws.send(JSON.stringify({ t: "join", presence: { email: "probe-a@example.com" } }));
assert.ok(await poll(b.frames, (f) => f.t === "presence" && f.members.some((m) => m.presence?.email === "probe-a@example.com")), "A's presence reaches B");
log("PASS presence data");

b.ws.close();
const left = await poll(a.frames, (f) => f.t === "presence" && f.left === helloB.connectionId, 8000);
assert.ok(left, "A sees B leave");
assert.ok(!left.members.some((m) => m.connectionId === helloB.connectionId), "B is gone from the roster");
log("PASS leave: roster excludes the departed member");

// ---- 3. Server publish --------------------------------------------------------
const publish = (cookie) =>
  fetch(`${base}/api/realtime/broadcast`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ e: "deal.updated", d: { id: "probe-1", stage: "closing" } }),
  });
assert.equal((await publish()).status, 401, "signed-out publish refused");
assert.equal((await publish(roleless)).status, 403, "roleless publish refused");
log("PASS server publish refused without a session (401) or the role (403)");

const pushed = await publish(admin);
assert.equal(pushed.status, 200, `admin publish accepted (got ${pushed.status})`);
const received = await poll(a.frames, (f) => f.t === "event" && f.e === "deal.updated" && f.from === undefined);
assert.ok(received, "A receives the server event, with no sender (so it can't be spoofed by a client)");
assert.deepEqual(received.d, { id: "probe-1", stage: "closing" });
log(`PASS server publish delivered to ${(await pushed.json()).recipients} socket(s)`);

a.ws.close();
log("\nREALTIME E2E PASSED");
process.exit(0);
