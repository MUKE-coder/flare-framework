// Per-record ownership, over HTTP, as a client experiences it.
//
// The unit tests drive the store directly with an in-memory `rows`. This drives a running
// app with two real sessions, because the thing being claimed is that a signed-in user
// cannot reach another user's row through the API — and that claim spans the route, the
// policy registry, the session and the database, none of which the unit tests touch.
//
// Usage: node scripts/e2e-ownership.mjs <baseUrl> <resource>
//   node scripts/e2e-ownership.mjs http://127.0.0.1:8799 invoices
const [base = "http://127.0.0.1:8799", slug = "invoices"] = process.argv.slice(2);
const run = Date.now();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS " : "FAIL "} ${name}${ok || !detail ? "" : ` — ${String(detail).slice(0, 220)}`}`);
  if (!ok) failures += 1;
};

/** One signed-in browser: its own cookie jar. */
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

/**
 * Sign up, waiting out the rate limit rather than failing on it.
 *
 * Better Auth rate-limits auth routes per IP in production, which is what `flare start`
 * and `next start` are. Three check scripts in a row from one runner is enough to trip
 * it, and the limit working is not a failure — so this waits instead of reporting one.
 */
async function signUpWithBackoff(who, email) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await who.call("/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email, password: "correct-horse-battery", name: who.label }),
    });
    if (result.status !== 429 && !/too many requests/i.test(JSON.stringify(result.body))) return result;
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  return who.call("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password: "correct-horse-battery", name: who.label }),
  });
}

async function signUp(who) {
  const email = `own-${who.label}-${run}@example.com`;
  const result = await signUpWithBackoff(who, email);
  who.id = result.body?.user?.id;
  check(`${who.label} signs up`, result.status === 200 && Boolean(who.id), JSON.stringify(result.body));
  return who;
}

const ada = await signUp(session("ada"));
const bob = await signUp(session("bob"));

// Each creates one invoice. Neither sends userId: the store fills it from the session.
const adaInvoice = await ada.call(`/api/${slug}`, { method: "POST", body: JSON.stringify({ number: `ADA-${run}`, total: 10 }) });
check("a create with no userId is accepted", adaInvoice.status === 201, JSON.stringify(adaInvoice.body));
check("the owner is filled in from the session", adaInvoice.body?.userId === ada.id, `${adaInvoice.body?.userId} vs ${ada.id}`);

// Bob tries to create one in Ada's name.
const bobInvoice = await bob.call(`/api/${slug}`, {
  method: "POST",
  body: JSON.stringify({ number: `BOB-${run}`, total: 20, userId: ada.id }),
});
check("a create naming another user is accepted", bobInvoice.status === 201, JSON.stringify(bobInvoice.body));
check("but stored against the caller, not the name they sent", bobInvoice.body?.userId === bob.id, String(bobInvoice.body?.userId));

const adaId = adaInvoice.body?.id;
const bobId = bobInvoice.body?.id;

// Lists.
const adaList = await ada.call(`/api/${slug}?perPage=100`);
const adaIds = (adaList.body?.data ?? []).map((row) => row.id);
check("a list shows only your own rows", adaIds.includes(adaId) && !adaIds.includes(bobId), JSON.stringify(adaIds));
check("and the total counts only those", adaList.body?.meta?.total === adaIds.length, JSON.stringify(adaList.body?.meta));

// The obvious attack.
const widened = await ada.call(`/api/${slug}?perPage=100&filter[userId]=${bob.id}`);
const widenedIds = (widened.body?.data ?? []).map((row) => row.id);
check("filtering by another user's id does not surface their rows", !widenedIds.includes(bobId), JSON.stringify(widenedIds));

// Reads, updates and deletes across the boundary.
check("reading your own record works", (await ada.call(`/api/${slug}/${adaId}`)).status === 200);

const stolenRead = await ada.call(`/api/${slug}/${bobId}`);
check("reading another user's is 404, not 403", stolenRead.status === 404, String(stolenRead.status));

const stolenPatch = await ada.call(`/api/${slug}/${bobId}`, { method: "PATCH", body: JSON.stringify({ total: 999 }) });
check("patching another user's is 404", stolenPatch.status === 404, String(stolenPatch.status));

const stolenDelete = await ada.call(`/api/${slug}/${bobId}`, { method: "DELETE" });
check("deleting another user's is 404", stolenDelete.status === 404, String(stolenDelete.status));

// And it really is still there.
const bobStillHasIt = await bob.call(`/api/${slug}/${bobId}`);
check("the record it refused to touch is untouched", bobStillHasIt.status === 200 && bobStillHasIt.body?.total === 20, JSON.stringify(bobStillHasIt.body));

// Handing a record over is refused rather than ignored.
const giveAway = await ada.call(`/api/${slug}/${adaId}`, { method: "PATCH", body: JSON.stringify({ userId: bob.id }) });
check("reassigning the owner is refused with a reason", giveAway.status === 422, `${giveAway.status} ${JSON.stringify(giveAway.body)}`);
const afterGiveAway = await ada.call(`/api/${slug}/${adaId}`);
check("and the record still belongs to you", afterGiveAway.body?.userId === ada.id, String(afterGiveAway.body?.userId));

// PUT resets every field the body omits. The owner must not be one of them.
const replaced = await ada.call(`/api/${slug}/${adaId}`, {
  method: "PUT",
  body: JSON.stringify({ number: `ADA-${run}-v2`, total: 11, userId: ada.id }),
});
check("a replace keeps the owner", replaced.status === 200 && replaced.body?.userId === ada.id, JSON.stringify(replaced.body));

// The dashboard leaves the owner field out of the form, because the store sets it and an
// input for it would discard whatever was typed.
const form = await ada.call(`/dashboard/${slug}/new`);
// The RSC payload inside <script> carries the whole descriptor, labels and all; only the
// rendered markup says what the form actually shows.
const markup = typeof form.body === "string" ? form.body.replace(/<script[\s\S]*?<\/script>/gi, "") : "";
const inputs = [...markup.matchAll(/<(?:input|textarea|select)\b[^>]*\bid="field-([^"]+)"/gi)].map((match) => match[1]);
check("the dashboard form renders", form.status === 200 && inputs.length > 0, `${form.status}, inputs ${JSON.stringify(inputs)}`);
check("and leaves the owner field out of it", !inputs.includes("userId"), JSON.stringify(inputs));

// Your own, end to end. A successful DELETE is 204 with no body.
const removed = await ada.call(`/api/${slug}/${adaId}`, { method: "DELETE" });
check("deleting your own works", removed.status === 204, String(removed.status));
check("and it is gone", (await ada.call(`/api/${slug}/${adaId}`)).status === 404);

console.log(failures === 0 ? "\nAll ownership checks passed." : `\n${failures} ownership check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
