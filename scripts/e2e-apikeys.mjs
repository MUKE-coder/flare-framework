// API keys, the way a cron job uses them.
//
// The point of a key is that it works without a browser: no cookie, no CSRF dance, no
// sign-in page. That is also exactly what makes it worth checking in CI — the failure
// mode is not an error, it is a key that authenticates as the wrong user or as nobody.
//
// Usage: node scripts/e2e-apikeys.mjs <baseUrl> <resource>
//   node scripts/e2e-apikeys.mjs http://127.0.0.1:8787 invoices
const [base = "http://127.0.0.1:8787", slug = "invoices"] = process.argv.slice(2);
const run = Date.now();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS " : "FAIL "} ${name}${ok || !detail ? "" : ` — ${String(detail).slice(0, 220)}`}`);
  if (!ok) failures += 1;
};

/** One signed-in browser, with its own cookie jar. */
function session(label) {
  let cookie = "";
  return {
    label,
    id: undefined,
    async call(path, init = {}) {
      const response = await fetch(base + path, {
        ...init,
        headers: {
          origin: base,
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...(cookie ? { cookie } : {}),
          ...init.headers,
        },
        redirect: "manual",
      });
      const setCookie = response.headers.getSetCookie?.() ?? [];
      if (setCookie.length) cookie = setCookie.map((entry) => entry.split(";")[0]).join("; ");
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      return { status: response.status, body };
    },
  };
}

/** No cookie at all, the way a script or a cron runs. Nor an Origin, which browsers add. */
const asClient = (path, key, init = {}) =>
  fetch(base + path, {
    ...init,
    headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(key ? { authorization: `Bearer ${key}` } : {}), ...init.headers },
    redirect: "manual",
  }).then(async (response) => {
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: response.status, body };
  });

async function signUp(who) {
  const email = `key-${who.label}-${run}@example.com`;
  const result = await who.call("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password: "correct-horse-battery", name: who.label }),
  });
  who.id = result.body?.user?.id;
  check(`${who.label} signs up`, result.status === 200 && Boolean(who.id), JSON.stringify(result.body));
  return who;
}

const ada = await signUp(session("ada"));
const bob = await signUp(session("bob"));

// Minting, in the browser, as the dashboard does it.
const minted = await ada.call("/api/auth/api-key/create", { method: "POST", body: JSON.stringify({ name: "nightly sync" }) });
check("a key can be minted", minted.status === 200 && Boolean(minted.body?.key), JSON.stringify(minted.body).slice(0, 200));
const key = minted.body?.key;
if (!key) {
  console.log("\nNo key to test with; stopping.");
  process.exit(1);
}
check("the key belongs to the user who made it", minted.body?.referenceId === ada.id, `${minted.body?.referenceId} vs ${ada.id}`);

// Reading, with no cookie and no Origin.
const unauthenticated = await asClient(`/api/${slug}`, null);
check("no credential at all is refused", unauthenticated.status === 401, String(unauthenticated.status));

const read = await asClient(`/api/${slug}?perPage=5`, key);
check("the key reads the list", read.status === 200 && Array.isArray(read.body?.data), `${read.status} ${JSON.stringify(read.body).slice(0, 140)}`);

const nonsense = await asClient(`/api/${slug}`, "not-a-real-key");
check("a made-up key is refused", nonsense.status === 401, String(nonsense.status));

// Writing. A cron sends no Origin, which is what the CSRF guard keys off, so this is the
// case that has to work — and the one a browser-based attacker cannot reach.
const wrote = await asClient(`/api/${slug}`, key, { method: "POST", body: JSON.stringify({ number: `KEY-${run}`, total: 7 }) });
check("the key writes", wrote.status === 201, `${wrote.status} ${JSON.stringify(wrote.body).slice(0, 140)}`);
check("the row belongs to the key's user, not to nobody", wrote.body?.userId === ada.id, String(wrote.body?.userId));

// The key is its user, which is the whole claim: it cannot see further than they can.
const bobRow = await bob.call(`/api/${slug}`, { method: "POST", body: JSON.stringify({ number: `BOB-${run}`, total: 9 }) });
check("bob has a record of his own", bobRow.status === 201, String(bobRow.status));

const seen = await asClient(`/api/${slug}?perPage=100`, key);
const ids = (seen.body?.data ?? []).map((row) => row.id);
check("the key sees its own user's row", ids.includes(wrote.body?.id), JSON.stringify(ids).slice(0, 140));
check("and not another user's", !ids.includes(bobRow.body?.id), JSON.stringify(ids).slice(0, 140));

const reachOver = await asClient(`/api/${slug}/${bobRow.body?.id}`, key);
check("another user's record is 404 to the key too", reachOver.status === 404, String(reachOver.status));

// Revoking, then the same key again.
const keyId = minted.body?.id;
const revoked = await ada.call("/api/auth/api-key/delete", { method: "POST", body: JSON.stringify({ keyId }) });
check("the key can be revoked", revoked.status === 200, `${revoked.status} ${JSON.stringify(revoked.body).slice(0, 140)}`);

const afterRevoke = await asClient(`/api/${slug}`, key);
check("a revoked key stops working", afterRevoke.status === 401, String(afterRevoke.status));

console.log(failures === 0 ? "\nAll API key checks passed." : `\n${failures} API key check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
