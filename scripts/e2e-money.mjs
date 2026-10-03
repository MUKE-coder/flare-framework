// Money, stored as whole minor units.
//
// A `money` column used to be a double, which is how a column of prices drifts and a total
// comes out a penny short. It holds cents now and the store converts at its boundary, so
// the API still speaks in the units people write. What has to be true: what goes in comes
// back identical, the database holds the integer, and sums are exact.
//
// Usage: node scripts/e2e-money.mjs <baseUrl> <resource>
//   node scripts/e2e-money.mjs http://127.0.0.1:8787 items
const [base = "http://127.0.0.1:8787", slug = "items"] = process.argv.slice(2);
const run = Date.now();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS " : "FAIL "} ${name}${ok || !detail ? "" : ` — ${String(detail).slice(0, 220)}`}`);
  if (!ok) failures += 1;
};

let cookie = "";
async function call(path, init = {}) {
  const response = await fetch(base + path, {
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
  return { status: response.status, body };
}

// Better Auth rate-limits auth routes per IP in production; waiting is not a failure.
for (let attempt = 0; attempt < 6; attempt += 1) {
  const result = await call("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email: `money-${run}@example.com`, password: "correct-horse-battery", name: "Money" }),
  });
  if (result.status === 200) {
    check("sign-up succeeds", true);
    break;
  }
  if (attempt === 5) check("sign-up succeeds", false, JSON.stringify(result.body));
  await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
}

const make = (name, price, qty = 1) => call(`/api/${slug}`, { method: "POST", body: JSON.stringify({ name, price, qty }) });

// The amounts people actually type. Each has at most two decimal places, because anything
// finer is refused further down rather than rounded.
const amounts = [19.99, 0.07, 0.1, 0.2, 1.05, 0, 1000000.99];
const created = [];
for (const amount of amounts) {
  const result = await make(`Item ${amount} ${run}`, amount);
  created.push({ amount, result });
}
check("every amount is accepted", created.every(({ result }) => result.status === 201), JSON.stringify(created.map(({ result }) => result.status)));

// Every one comes back exactly as it went in. That is the claim: the column holds cents,
// and nothing above the store ever sees them.
for (const { amount, result } of created) {
  check(`${amount} comes back unchanged`, result.body?.price === amount, `got ${JSON.stringify(result.body?.price)}`);
}

// A fresh read, so this is the database and not the response being echoed.
const first = created[0].result.body;
const reread = await call(`/api/${slug}/${first.id}`);
check("it survives a read", reread.body?.price === 19.99, JSON.stringify(reread.body?.price));

// More places than the currency has is refused, not rounded. Storing 20.00 for something
// somebody will reconcile against a statement is worse than saying no.
const tooPrecise = await make(`Precise ${run}`, 19.999);
check("more decimal places than the currency has is refused", tooPrecise.status === 422, `${tooPrecise.status} ${JSON.stringify(tooPrecise.body).slice(0, 140)}`);
check("and the message says how many are allowed", /decimal place/i.test(JSON.stringify(tooPrecise.body)), JSON.stringify(tooPrecise.body).slice(0, 160));

// Negative is refused by default, because a price is not negative.
const negative = await make(`Refund ${run}`, -5);
check("a negative amount is refused by default", negative.status === 422, String(negative.status));

// An update converts the same way.
const updated = await call(`/api/${slug}/${first.id}`, { method: "PATCH", body: JSON.stringify({ price: 0.03 }) });
check("an update converts too", updated.status === 200 && updated.body?.price === 0.03, JSON.stringify(updated.body?.price));

// A money field is not filterable unless its descriptor says so — only enum, boolean and
// belongsTo are by default — so this is a 400 rather than an empty page. The conversion a
// filterable one needs is covered by the store's own tests, where the descriptor can opt in.
const filtered = await call(`/api/${slug}?perPage=100&filter[price]=0.07`);
check("filtering a money field needs the descriptor to allow it", filtered.status === 400, `${filtered.status} ${JSON.stringify(filtered.body).slice(0, 120)}`);

// Sorting and paging by a money column: the cursor must carry the stored integer, or the
// next page is compared against a number the column does not contain.
const sorted = await call(`/api/${slug}?perPage=3&sort=price`);
check("sorting by a money column works", sorted.status === 200 && (sorted.body?.data ?? []).length === 3, JSON.stringify(sorted.body?.meta));
const ascending = (sorted.body?.data ?? []).map((row) => row.price);
check("and it sorts by amount, not by text", ascending.every((value, index) => index === 0 || value >= ascending[index - 1]), JSON.stringify(ascending));

const next = sorted.body?.meta?.nextCursor;
check("it hands out a cursor", Boolean(next), JSON.stringify(sorted.body?.meta));
if (next) {
  const second = await call(`/api/${slug}?perPage=3&sort=price&cursor=${encodeURIComponent(next)}`);
  const secondPrices = (second.body?.data ?? []).map((row) => row.price);
  check("the next page is a different page", secondPrices.length > 0 && secondPrices[0] !== ascending[0], JSON.stringify(secondPrices).slice(0, 120));
  check("and it carries on where the first left off", secondPrices[0] >= ascending[ascending.length - 1], `${JSON.stringify(ascending)} then ${JSON.stringify(secondPrices)}`);
}

console.log(failures === 0 ? "\nAll money checks passed." : `\n${failures} money check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
