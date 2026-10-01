// `markdown`, `tags` and `json` fields, end to end.
//
// Each one stores something the other field kinds cannot: long text with a preview, a free
// list of labels, and a value whose shape is not declared. The thing worth checking is the
// round trip — what goes in through the API comes back the same shape, and what the form
// renders is the editor for that kind rather than a plain box.
//
// Usage: node scripts/e2e-field-kinds.mjs <baseUrl> <resource>
//   node scripts/e2e-field-kinds.mjs http://127.0.0.1:8787 notes
const [base = "http://127.0.0.1:8787", slug = "notes"] = process.argv.slice(2);
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
    body: JSON.stringify({ email: `kinds-${run}@example.com`, password: "correct-horse-battery", name: "Kinds" }),
  });
  if (result.status === 200) {
    check("sign-up succeeds", true);
    break;
  }
  if (attempt === 5) check("sign-up succeeds", false, JSON.stringify(result.body));
  await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
}

const markdown = "# Heading\n\nSome **bold** text and a [link](https://example.com).\n\n- one\n- two";
const settings = { notify: true, channels: ["email", "sms"], retries: 3, nested: { deep: null } };

const created = await call(`/api/${slug}`, {
  method: "POST",
  body: JSON.stringify({ title: `Note ${run}`, body: markdown, labels: ["urgent", "q3"], settings }),
});
check("a record with all three kinds is accepted", created.status === 201, `${created.status} ${JSON.stringify(created.body).slice(0, 200)}`);
const id = created.body?.id;

// Markdown is text: it must come back byte for byte, newlines and all.
check("markdown round-trips unchanged", created.body?.body === markdown, JSON.stringify(created.body?.body));

// Tags are an array, not a joined string.
check("tags come back as an array", Array.isArray(created.body?.labels) && created.body.labels.length === 2, JSON.stringify(created.body?.labels));

/**
 * Deep equality that does not care about key order.
 *
 * Postgres `jsonb` is a parsed binary representation, so it normalises key order; SQLite
 * keeps the text as given. Key order is not part of what JSON means, so an order-sensitive
 * comparison here would be asserting something neither database promises — and would pass
 * on one stack and fail on the other, which is exactly what it did.
 */
function same(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((value, index) => same(value, b[index]));
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => same(a[key], b[key]));
}

// JSON keeps its shape, including nesting and null.
check("json keeps its shape", same(created.body?.settings, settings), JSON.stringify(created.body?.settings));

// And again after a fresh read, so this is the database and not the response being echoed.
const fetched = await call(`/api/${slug}/${id}`);
check("all three survive a read", fetched.body?.body === markdown && same(fetched.body?.settings, settings), JSON.stringify(fetched.body).slice(0, 200));
check("and the tags with them", JSON.stringify(fetched.body?.labels) === JSON.stringify(["urgent", "q3"]), JSON.stringify(fetched.body?.labels));

// A duplicate tag is refused, case-insensitively.
const dupe = await call(`/api/${slug}`, {
  method: "POST",
  body: JSON.stringify({ title: `Dupe ${run}`, body: "x", labels: ["Urgent", "urgent"] }),
});
check("a tag added twice is refused", dupe.status === 422, `${dupe.status} ${JSON.stringify(dupe.body).slice(0, 160)}`);

// A tags field has no vocabulary: anything is allowed, which is the difference from multiselect.
const anything = await call(`/api/${slug}`, {
  method: "POST",
  body: JSON.stringify({ title: `Free ${run}`, body: "x", labels: ["something nobody listed"] }),
});
check("a tag nobody listed is allowed", anything.status === 201, `${anything.status} ${JSON.stringify(anything.body).slice(0, 160)}`);

// Optional means optional: both may be left out entirely.
const bare = await call(`/api/${slug}`, { method: "POST", body: JSON.stringify({ title: `Bare ${run}`, body: "just text" }) });
check("the optional ones can be omitted", bare.status === 201, `${bare.status} ${JSON.stringify(bare.body).slice(0, 160)}`);

// A scalar is valid JSON. The field says any JSON value, so it has to take one.
const scalar = await call(`/api/${slug}`, { method: "POST", body: JSON.stringify({ title: `Scalar ${run}`, body: "x", settings: 42 }) });
check("json takes a scalar, not only an object", scalar.status === 201 && scalar.body?.settings === 42, `${scalar.status} ${JSON.stringify(scalar.body?.settings)}`);

// The form: the editors for these kinds, not three plain text boxes.
const form = await call(`/dashboard/${slug}/new`);
const markupOnly = typeof form.body === "string" ? form.body.replace(/<script[\s\S]*?<\/script>/gi, "") : "";
check("the form renders", form.status === 200 && markupOnly.length > 0, String(form.status));
check("markdown gets a Write/Preview editor", /Preview/.test(markupOnly) && /Write/.test(markupOnly), "no Write/Preview control");
check("tags gets a tag input, not a text box", /press Enter/i.test(markupOnly), "no tag input");
check("json says whether it parses", /Empty|Valid JSON/.test(markupOnly), "no JSON validity hint");

// The record page renders the markdown rather than showing the source.
const record = await call(`/dashboard/${slug}/${id}`);
const recordMarkup = typeof record.body === "string" ? record.body.replace(/<script[\s\S]*?<\/script>/gi, "") : "";
check("the record page renders the markdown", /<h1[^>]*>Heading<\/h1>/.test(recordMarkup), "heading not rendered");
check("and not its source", !/# Heading/.test(recordMarkup), "the raw source is on the page");

// The renderer builds React elements, so stored text cannot become markup. A link's href is
// the one place a value reaches an attribute, and that is checked against a protocol list —
// which makes it the case worth proving against a running app rather than against the source.
const nasty = await call(`/api/${slug}`, {
  method: "POST",
  body: JSON.stringify({
    title: `Nasty ${run}`,
    body: '[click me](javascript:alert(1))\n\n<img src=x onerror="alert(2)">\n\n[ok](https://example.com)',
  }),
});
check("text with a javascript: link is accepted and stored as typed", nasty.status === 201, String(nasty.status));

const shown = await call(`/dashboard/${slug}/${nasty.body?.id}`);
const html = typeof shown.body === "string" ? shown.body.replace(/<script[\s\S]*?<\/script>/gi, "") : "";
check("it renders no javascript: href", !/href="javascript:/i.test(html), "a javascript: href reached the page");
check("the refused link is still shown as text", /click me/.test(html), "the link text vanished instead");
check("a real link still becomes one", /href="https:\/\/example\.com"/.test(html), "the https link was not rendered");
check("raw HTML in the text does not become markup", !/<img\s+src=x/i.test(html), "an img tag reached the page");

console.log(failures === 0 ? "\nAll field kind checks passed." : `\n${failures} field kind check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
