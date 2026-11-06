---
title: API routes and handlers
description: What flare gen resource writes for each HTTP method, the query parameters, the status codes, and how to handle CORS.
---

Every resource gets two route files and six handlers. They are ordinary
[Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
— `export async function GET(request)` — with their bodies written out, not
hidden behind a factory.

```
app/api/products/route.ts        GET (list)   POST (create)
app/api/products/[id]/route.ts   GET (read)   PATCH   PUT   DELETE
```

## The six handlers

| Method | Path | Does | Success |
| --- | --- | --- | --- |
| `GET` | `/api/products` | List, with paging, sorting, search and filters | `200` |
| `POST` | `/api/products` | Create one | `201` + `Location` |
| `GET` | `/api/products/[id]` | Read one | `200` |
| `PATCH` | `/api/products/[id]` | Change some fields | `200` |
| `PUT` | `/api/products/[id]` | Replace every field | `200` |
| `DELETE` | `/api/products/[id]` | Remove it | `204`, no body |

`PATCH` validates only the fields you send. `PUT` validates all of them, so a
field you leave out is an error rather than silently unchanged.

## What a handler actually does

Five steps, in this order, every time:

```ts title="app/api/products/route.ts"
export async function POST(request: Request): Promise<Response> {
  try {
    // 1. May this person do this?
    const denied = await authorize({ request, resource: productResource, action: "create" });
    if (denied) return denied;

    // 2. Did this write come from another site?
    if (crossOrigin(request)) return problem(403, "Cross-origin request blocked.");

    // 3. Is the body JSON?
    const read = await readJson(request);
    if ("response" in read) return read.response;

    // 4. Validate, run hooks, write.
    const result = await store.create(read.body);
    if (!result.ok) return failureResponse(result);

    // 5. Answer.
    return Response.json(result.data, { status: 201, headers: { location } });
  } finally {
    // A body left unread breaks the next request through wrangler's dev proxy.
    await drain(request);
  }
}
```

`authorize`, `crossOrigin`, `readJson`, `problem`, `failureResponse`, `drain`
and `store` are all files in your app. Nothing above is framework internals.

## Listing: the query parameters

```
GET /api/products?page=2&perPage=25&sort=-price&q=lamp&filter[status]=active
```

| Parameter | |
| --- | --- |
| `page`, `perPage` | Offset paging. `perPage` is capped |
| `cursor` | Keyset paging. Use instead of `page` on large tables |
| `sort` | A field name, `-` for descending. Default `-createdAt` |
| `q` | Search across the resource's searchable string fields |
| `filter[field]` | Exact match. Repeatable |

The response:

```json
{
  "data": [],
  "meta": {
    "page": 2, "perPage": 25, "total": 1284, "exactTotal": true,
    "nextCursor": "WzM4Ny4xOSwiZDM5", "previousCursor": null
  }
}
```

`exactTotal` is `false` when there are more than 10,000 matches: counting
every row of a large table on every request is not worth the milliseconds, so
the count stops there and says so.

**Prefer `cursor` over `page` past a few thousand rows.** `OFFSET 50000` makes
the database walk 50,000 rows to discard them; a cursor compares
`(sort, id)` against an index.

## Status codes

| Code | When |
| --- | --- |
| `200` | Read or update succeeded |
| `201` | Created. `Location` points at it |
| `204` | Deleted |
| `400` | The query string was wrong, or the body was not JSON |
| `401` | Not signed in |
| `403` | Signed in, not allowed — or a cross-site write |
| `404` | No such row |
| `409` | A unique constraint, or a row still referenced by others |
| `415` | Not `Content-Type: application/json` |
| `422` | Validation failed, or a relation naming a record that does not exist |

## One error shape

Every error, from every guard, has the same body:

```json
{
  "error": "Sku is already taken.",
  "code": "unique_violation",
  "issues": [{ "path": "sku", "message": "Sku is already taken.", "code": "unique" }]
}
```

`error` is the sentence to show a person. Its wording can change between
releases, so do not branch on it.

`code` is for your code. It is stable, so you can translate it, decide whether
retrying is worth it, or switch on it:

| `code` | Status | What happened |
| --- | --- | --- |
| `validation_failed` | 422 | The body broke a field's rules |
| `unique_violation` | 409 | A unique column already holds this value |
| `still_referenced` | 409 | Deleting this would orphan rows pointing at it |
| `related_record_missing` | 422 | A relation names a record that does not exist |
| `value_not_allowed` | 422 | A value outside what its column accepts |
| `not_found` | 404 | No such record, or none this request may see |
| `invalid_query` | 400 | A query parameter is wrong |
| `invalid_json` | 400 | The body was not JSON |
| `bad_request` | 400 | Wrong in a way none of the others describes |
| `unsupported_media_type` | 415 | No `Content-Type: application/json` |
| `length_required` | 411 | An upload with no `Content-Length` |
| `payload_too_large` | 413 | An upload past the limit its URL allows |
| `invalid_token` | 400/403 | A signed storage URL that is missing, bad or expired |
| `cross_origin_blocked` | 403 | A write from another origin |
| `unauthenticated` | 401 | No session and no API key |
| `forbidden` | 403 | Signed in, but this role may not do this |
| `access_denied` | 403 | Refused by the security layer before the app saw it |
| `rate_limited` | 429 | Too many requests |

`issues` is there whenever the answer is about fields, and always has the same
shape — so a form reads one thing whether a value was refused by a rule or by
the database:

```json
{
  "error": "Validation failed.",
  "code": "validation_failed",
  "issues": [{ "path": "price", "message": "Enter a number", "code": "invalid" }]
}
```

`path` is the field key, dotted for a nested one, or the parameter name for a
`invalid_query`. An issue's own `code` is one of `invalid`, `unique`,
`immutable` or `invalid_parameter`.

A 422 never reaches the database. Validation runs first; nothing is written.

:::note[This changed in 0.12]
There used to be four shapes — `{ error }`, `{ error, field }`, `{ error, issues }`
with a `path` in each issue, and another with a `param` instead — plus a
plain-text refusal from the security layer. A client had to handle whichever one
the guard that refused it happened to use. If you read `field`, read
`issues[0].path` instead; if you read `issues[].param`, read `issues[].path`.
The security layer still answers a browser navigation with a plain sentence,
because a page of JSON is no use to somebody reading it, but an API request gets
the envelope.
:::

## Rate limits

A descriptor says how often each action may be called:

```ts
// resources/invitation.resource.ts
export default defineResource({
  name: "Invitation",
  fields: { email: field.string({ format: "email" }) },
  rateLimit: { create: "10/min", "*": "120/min" },
});
```

The named action wins over `*`, so that reads as "ten creates a minute, a
hundred and twenty of anything else". Write it as `calls/window`: `10/min`,
`5/s`, `500/hour`, `200/day`, or with a count — `30/5min`. A rate that cannot be
read stops `flare gen` rather than leaving the action quietly unlimited.

The generated route checks it straight after the policy, so a refused call costs
nothing but the count:

```
HTTP/1.1 429
retry-after: 37
x-ratelimit-limit: 10
x-ratelimit-remaining: 0

{ "error": "Too many requests. Try again shortly.", "code": "rate_limited" }
```

**Counted per caller** — the signed-in account where there is one, the client IP
otherwise. So a limit on `create` is a limit on that person, not on everyone in
one office; anonymous callers behind one address share a bucket, which is the
right trade for an endpoint that does not know who is calling.

**After the policy, deliberately.** A request that is going to be refused anyway
should not spend somebody's quota, and the caller is not known until then. A
flood with no session is the edge's job, not this one's — see
[security](/guides/security/).

**Set it on the actions that cost something.** A create that sends an email, an
export that reads the whole table. A blanket limit on everything is what the
edge limiter is for.

### Where the counting happens

| Stack | Counter |
| --- | --- |
| Cloudflare | A Durable Object, `FLARE_RATE_LIMIT` in `wrangler.jsonc` |
| Next.js | Redis, through `lib/redis.ts` (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`) |

Both are in `lib/rate-limit.ts` in your app and both are yours to replace.

One Durable Object per resource *and action*, holding a count per caller — not
one per caller, which would be an invoice rather than a feature. Counters live
in memory, so an eviction restarts the window and lets a caller through a little
early. That is the right trade for stopping one account hammering one endpoint;
a limit that has to hold exactly — a paid quota — belongs in the database beside
the thing it is metering.

Cloudflare has its own rate-limiting binding and it is cheaper than this, but
its window may only be 10 or 60 seconds and its limit is fixed in the Worker's
configuration rather than per call. A descriptor saying `"500/hour"` would work
on one stack and not the other, and that is the one thing Flare does not do.

**If nothing is configured, nothing is limited.** The route says so in the log,
once, rather than refusing every request — and `flare doctor` reports it as a
problem, which is where to find it before deploying. If the counter is
unreachable the call is allowed: an outage in the limiter should not become an
outage in the app.

## CORS

**By default there is none, and that is deliberate.** The API is for your own
front end, on your own origin. Browsers already block cross-origin reads from
other sites, and every write checks `Origin`:

```ts title="lib/resource/http.ts"
export const crossOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return origin !== null && origin !== new URL(request.url).origin;
};
```

Browsers always send `Origin` on `POST`, `PATCH`, `PUT` and `DELETE`, so a
mismatch means another site, and a missing `Origin` means it was not a browser
form at all. That is the CSRF guard.

### Opening it up deliberately

If a different origin must call your API — a mobile app's web build, a partner
front end — add the headers and an `OPTIONS` handler **outside the generated
block**, so regeneration keeps them:

```ts title="app/api/products/route.ts"
// generated:end

const ALLOWED = new Set(["https://app.example.com"]);

const cors = (request: Request) => {
  const origin = request.headers.get("origin");
  return origin && ALLOWED.has(origin)
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
        vary: "origin",
      }
    : {};
};

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cors(request) });
}
```

Then let that origin past the CSRF check, in `lib/resource/http.ts`:

```ts
const ALLOWED = new Set(["https://app.example.com"]);

export const crossOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && ALLOWED.has(origin)) return false;
  return origin !== null && origin !== new URL(request.url).origin;
};
```

:::caution
`access-control-allow-origin: *` and `allow-credentials: true` are mutually
exclusive, for good reason. Never reflect an arbitrary `Origin` back while
allowing credentials — that hands any site the ability to act as your
signed-in users. Keep an explicit list.
:::

For a public, read-only API, a simpler answer: allow `*` on `GET` only and
leave writes same-origin.

### A front end on another domain

If your front end is on a different domain, cookies are the harder problem,
not CORS. A session cookie has to be `SameSite=None; Secure` to travel, and
both ends must be HTTPS. Better Auth's cross-subdomain cookie options cover
it.

### A client that has no cookies at all

A cron job, a shell script, a mobile app or a partner integration cannot hold
a session cookie. Give it an [API key](/guides/api-keys/):

```bash
npx flare gen apikeys
```

Then `Authorization: Bearer <key>` (or `x-api-key`) works on every generated
route, as the user who created the key:

```bash
curl https://myapp.workers.dev/api/invoices \
  -H "Authorization: Bearer flare_live_…"
```

The CSRF guard does not get in the way, and that is not an exception made for
keys. `crossOrigin()` only refuses a request that carries a *different*
`Origin` — which is a browser telling you the request came from another site.
A script sends no `Origin` at all, so it passes; and a page on another origin
cannot reach your API anyway, because nothing here answers a CORS preflight.

## Endpoints of your own

For anything CRUD does not cover:

```bash
npx flare gen endpoint Order refund --method POST --record
```

Note the shape: **`flare gen endpoint <Resource> <name>`** — positional, the
resource first. That writes `app/api/orders/[id]/refund/route.ts` with the
session and the policy check already in place and `store` ready to use. From
then on it is an ordinary file, and regeneration leaves it alone.

| Flag | |
| --- | --- |
| `--method` | `GET` (default), `POST`, `PATCH`, `PUT`, `DELETE` |
| `--record` | Put it under one record: `/api/orders/[id]/refund` |
| `--action` | Which policy action to require: `read`, `create`, `update`, `delete` |

## Calling it from your own code

Each resource gets a typed client, so a component never builds a URL:

```ts
import { productClient } from "@/resources/product.client";

const { data, meta } = await productClient.list({ q: "lamp", perPage: 10 });
const one = await productClient.get(id);
await productClient.update(id, { price: 12.5 });
```

## The API documents itself

Every app serves an OpenAPI 3.1 document at `/api/openapi.json`, generated
from your descriptors **and your policies**, and renders it at
`/api/reference`. It cannot drift from the API, because both come from the
same descriptors.
