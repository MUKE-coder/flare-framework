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
| `400` | The query string was wrong — `{ issues: [{ param, message }] }` |
| `401` | Not signed in |
| `403` | Signed in, not allowed — or a cross-site write |
| `404` | No such row |
| `409` | A unique constraint — `{ error, field }`, so the form knows which input |
| `415` | Not `Content-Type: application/json` |
| `422` | Validation failed — `{ issues: [{ path, message }] }` |

Two worth dwelling on. A **409** names the column:

```json
{ "error": "Sku is already taken.", "field": "sku" }
```

A **422** names the path, so a form can put each message under its input:

```json
{ "error": "Validation failed.", "issues": [{ "path": "price", "message": "Enter a number" }] }
```

A 422 never reaches the database. Validation runs first; nothing is written.

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
it; a bearer token is often simpler.

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
