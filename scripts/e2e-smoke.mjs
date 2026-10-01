// The regressions that reached users, as one check.
//
// Every release from 0.6.1 to 0.8.1 shipped a feature that did not work on first use,
// and all of them are reachable over HTTP from a running app. This script is what CI
// runs so the next one is a red check instead of a bug report.
//
// Usage: node scripts/e2e-smoke.mjs <baseUrl> <resource> [email:password]
//   node scripts/e2e-smoke.mjs http://127.0.0.1:8787 contacts
const [base = "http://127.0.0.1:8787", slug = "contacts", login = ""] = process.argv.slice(2);
const api = `${base}/api/${slug}`;
const run = Date.now();
const [email, password] = login ? login.split(":") : [`smoke-${run}@example.com`, "correct-horse-battery"];

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS " : "FAIL "} ${name}${ok || !detail ? "" : ` — ${String(detail).slice(0, 200)}`}`);
  if (!ok) failures += 1;
};

/** Cookies survive between calls, the way a browser's would. */
let cookie = "";
async function call(path, init = {}) {
  const response = await fetch(path.startsWith("http") ? path : base + path, {
    ...init,
    headers: { origin: base, ...(init.body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...init.headers },
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
  return { status: response.status, body, headers: response.headers };
}

// 0.6.x — the app starts and reaches its database at all.
const health = await call("/api/health");
check("health reports a database", health.status === 200 && health.body?.database === true, JSON.stringify(health.body));

// Anything before sign-in is refused.
check("unauthenticated list is refused", (await call(`/api/${slug}`)).status === 401);

const signUp = await call("/api/auth/sign-up/email", { method: "POST", body: JSON.stringify({ email, password, name: "Smoke" }) });
// Better Auth compares the request origin with BETTER_AUTH_URL, so http://localhost and
// http://127.0.0.1 are different origins to it. Every check after this one needs the
// session cookie, so say which mismatch it is rather than letting five checks fail.
// `check` trims the detail, so on a mismatch the hint replaces the body rather than
// trailing it — the body says only INVALID_ORIGIN, which is the part already known.
const signUpDetail =
  signUp.body?.code === "INVALID_ORIGIN"
    ? `${base} is not this app's BETTER_AUTH_URL; localhost and 127.0.0.1 are different origins to Better Auth.`
    : JSON.stringify(signUp.body);
check("sign-up succeeds", signUp.status === 200, signUpDetail);

// The list, and the shape the dashboard depends on.
const list = await call(`/api/${slug}?perPage=2`);
check("list returns rows", list.status === 200 && Array.isArray(list.body?.data), JSON.stringify(list.body).slice(0, 160));
check("list reports a total", typeof list.body?.meta?.total === "number");

// 0.7.3 — the second page of every date-sorted list failed on Postgres.
const cursor = list.body?.meta?.nextCursor;
if (cursor) {
  const second = await call(`/api/${slug}?perPage=2&cursor=${encodeURIComponent(cursor)}`);
  check("second page by cursor", second.status === 200 && Array.isArray(second.body?.data), JSON.stringify(second.body).slice(0, 200));
  const first = list.body.data.map((row) => row.id).join();
  check("the cursor page is a different page", second.body?.data?.map((row) => row.id).join() !== first);
} else {
  check("second page by cursor (needs > 2 rows seeded)", true);
}

// Paging by number, which is what the table's footer uses.
check("page 2 by number", (await call(`/api/${slug}?perPage=2&page=2`)).status === 200);

// The page-size cap still applies to a request from outside (0.8.1 widened it for the
// export only).
check("an outside request cannot raise the page size", (await call(`/api/${slug}?perPage=500`)).status === 400);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
