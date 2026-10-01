// Soft delete, end to end.
//
// `softDelete: true` means a delete stamps `deletedAt` instead of removing the row, and
// every read leaves those rows out. The failure mode worth guarding is not an error — it is
// a deleted record still showing up somewhere, or a restore that quietly does nothing.
//
// Usage: node scripts/e2e-soft-delete.mjs <baseUrl> <resource>
//   node scripts/e2e-soft-delete.mjs http://127.0.0.1:8787 tickets
const [base = "http://127.0.0.1:8787", slug = "tickets"] = process.argv.slice(2);
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
    body: JSON.stringify({ email: `soft-${run}@example.com`, password: "correct-horse-battery", name: "Soft" }),
  });
  if (result.status === 200) {
    check("sign-up succeeds", true);
    break;
  }
  if (attempt === 5) check("sign-up succeeds", false, JSON.stringify(result.body));
  await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
}

const make = (subject) => call(`/api/${slug}`, { method: "POST", body: JSON.stringify({ subject, status: "open" }) });

const kept = await make(`Kept ${run}`);
const binned = await make(`Binned ${run}`);
check("two records are created", kept.status === 201 && binned.status === 201, `${kept.status} ${binned.status}`);
const keptId = kept.body?.id;
const binnedId = binned.body?.id;

const ids = async (query = "") => {
  const result = await call(`/api/${slug}?perPage=100${query}`);
  return { status: result.status, list: (result.body?.data ?? []).map((row) => row.id), meta: result.body?.meta };
};

const before = await ids();
check("both are listed to start with", before.list.includes(keptId) && before.list.includes(binnedId), JSON.stringify(before.list));

// The delete. 204, and the row is still there — just hidden.
const deleted = await call(`/api/${slug}/${binnedId}`, { method: "DELETE" });
check("a delete answers 204", deleted.status === 204, String(deleted.status));

const after = await ids();
check("the deleted one drops out of the list", after.list.includes(keptId) && !after.list.includes(binnedId), JSON.stringify(after.list));
check("and out of the count", after.meta?.total === before.meta.total - 1, `${after.meta?.total} vs ${before.meta.total}`);
check("reading it directly is 404", (await call(`/api/${slug}/${binnedId}`)).status === 404);

// ?deleted=only is the Trash; ?deleted=all is both.
const trash = await ids("&deleted=only");
check("?deleted=only shows it", trash.list.includes(binnedId) && !trash.list.includes(keptId), JSON.stringify(trash.list));
const both = await ids("&deleted=all");
check("?deleted=all shows both", both.list.includes(keptId) && both.list.includes(binnedId), JSON.stringify(both.list));
check("a nonsense ?deleted is refused", (await call(`/api/${slug}?deleted=maybe`)).status === 400);

// Deleting it twice must not move the original date.
const stamp = (await call(`/api/${slug}/${binnedId}?deleted=only`)).body?.deletedAt;
const again = await call(`/api/${slug}/${binnedId}`, { method: "DELETE" });
check("deleting it twice is 404, not a second stamp", again.status === 404, String(again.status));
check("so the original deletion time survives", (await call(`/api/${slug}/${binnedId}?deleted=only`)).body?.deletedAt === stamp);

// A unique value is still taken by a row in the trash. Documented, and worth pinning:
// somebody will be surprised by it, and it should be the documented surprise.
const reuse = await make(`Binned ${run}`);
check("a unique value is still held by a deleted row", reuse.status === 409, `${reuse.status} ${JSON.stringify(reuse.body).slice(0, 120)}`);

// Restoring. There is no REST route for it by design, so this goes through the dashboard
// the way a person would — the Trash view's Restore button is a server action.
const trashPage = await call(`/dashboard/${slug}?deleted=only`);
const trashMarkup = typeof trashPage.body === "string" ? trashPage.body.replace(/<script[\s\S]*?<\/script>/gi, "") : "";
check("the dashboard has a Trash view", trashPage.status === 200 && /aria-label="Which records to show"/.test(trashMarkup), String(trashPage.status));
check("and the deleted record is in it", new RegExp(`Binned ${run}`).test(trashMarkup), "the deleted record is not shown");

/**
 * Restore lives inside a dropdown, which Radix does not render until it is opened, so it
 * cannot be found in the HTML. What can be checked is the prop that decides whether the
 * menu offers Restore and "Delete forever" rather than Edit and Delete — and that is the
 * wiring which would actually break. The RSC payload escapes its quotes.
 */
const payload = typeof trashPage.body === "string" ? trashPage.body : "";
check("the row menu is told it is in the trash", /inTrash\\":true/.test(payload), "inTrash did not reach the row actions");

const listPage = await call(`/dashboard/${slug}`);
const listMarkup = typeof listPage.body === "string" ? listPage.body.replace(/<script[\s\S]*?<\/script>/gi, "") : "";
check("the ordinary list does not show it", !new RegExp(`Binned ${run}`).test(listMarkup), "a deleted record is on the main list");
check("and its row menu is not", /inTrash\\":false/.test(typeof listPage.body === "string" ? listPage.body : ""), "inTrash was not false on the live list");

console.log(failures === 0 ? "\nAll soft delete checks passed." : `\n${failures} soft delete check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
