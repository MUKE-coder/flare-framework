---
title: Nothing is hidden
description: Flare copies the code that runs your endpoints into your app, the way shadcn/ui copies a component. Where it lives, how it works, and how to change it.
---

Most frameworks ask you to accept a box you cannot open. You call
`createHandler()`, a request goes in, a response comes out, and when the
response is wrong your options are to read someone else's source on GitHub or
guess.

Flare doesn't do that. The code that turns a resource descriptor into a
working endpoint is **copied into your app** when you create it, the same way
[shadcn/ui](https://ui.shadcn.com) copies a component instead of shipping one
from a package.

```
lib/resource/
  rows.ts          the contract a data source has to meet — about fifty lines
  query.ts         ?page, ?sort, ?q, ?filter[status], ?cursor → a parsed query
  store.ts         validation, hooks, computed values, pagination, error mapping
  http.ts          the guards and the result → Response mapping routes call
  handlers.ts      the same flow as a factory, if you prefer the short form
  drizzle-rows.ts  rows.ts over Drizzle and D1        (Cloudflare stack)
  prisma-rows.ts   rows.ts over Prisma and Postgres   (Next.js stack)
```

Around 800 lines. None of it is imported from `@flaredev/core` at runtime.
Open it, read it, change it, delete it.

## What a route actually is

```ts title="app/api/products/route.ts"
export async function GET(request: Request): Promise<Response> {
  const denied = await authorize({ request, resource: productResource, action: "list" });
  if (denied) return denied;

  return respond(await store.list(new URL(request.url).searchParams));
}

export async function POST(request: Request): Promise<Response> {
  try {
    const denied = await authorize({ request, resource: productResource, action: "create" });
    if (denied) return denied;
    if (crossOrigin(request)) return problem(403, "Cross-origin request blocked.");

    const read = await readJson(request);
    if ("response" in read) return read.response;

    const result = await store.create(read.body);
    if (!result.ok) return failureResponse(result);

    const location = `${new URL(request.url).pathname.replace(/\/$/, "")}/${result.data.id as string}`;
    return Response.json(result.data, { status: 201, headers: { location } });
  } finally {
    // A body left unread breaks the next request through wrangler's dev proxy.
    await drain(request);
  }
}
```

Every step is there: who may do this, whether the write came from another
site, how the body is read, what the store returns and what that becomes over
HTTP. And **every function it calls is a file in your repository** —
Ctrl-click `crossOrigin` or `respond` and you land in `lib/resource/http.ts`,
not in `node_modules`. Ctrl-click `drizzleRows` and you can see the exact SQL
Drizzle is being asked to build.

The row adapter is named rather than implied, which is the one line that
differs between the two stacks:

```ts
rows: drizzleRows(products, getDb),              // Cloudflare: Drizzle over D1
rows: prismaRows(prisma.product, prisma),        // Next.js: Prisma over Postgres
```

## What is still in the package

`@flaredev/core` keeps the parts that are a library rather than a framework:
the descriptor and field types, the validators built from them, the OpenAPI
document, formatting helpers and the fake-data generator. Those are
functions you call, not machinery that calls you — and there is nothing to
understand about a request by reading them.

## The trade this makes

Copying code into your app is a real trade, and it is worth being clear about
both halves.

**What you get.** You can read what happens to a request. You can change it
for one resource without forking anything. A debugger steps into it. A stack
trace names your file and your line number. If Flare's idea of pagination
doesn't suit you, you can have a different one this afternoon.

**What it costs.** A fix in a later Flare release does not reach your app on
its own. That is not a footnote, it is the deal.

So there are two commands:

```bash
npx flare diff            # what changed upstream vs. your copies
npx flare update --yes    # take the upstream version
```

`flare diff` shows the differing lines per file, yours as `-` and Flare's as
`+`. `flare update` refuses to run without `--yes`, and lists what it would
overwrite first — the one thing this design must never do is take your edits
quietly. Both accept a filter (`flare diff store`) to look at one file.

Neither runs on its own. If you never call them, your copies stay exactly as
you left them.

## Editing it

Go ahead. Some things people do:

- **Change the page size cap.** It's a constant in `query.ts`.
- **Add a header to every list response.** `handlers.ts`, in one place.
- **Change what a 409 says.** `store.ts` maps constraint errors to messages.
- **Use a different database.** Implement the nine methods in `rows.ts`
  against anything — another ORM, an HTTP API, an in-memory fake for tests —
  and pass it as `rows`. Nothing else changes.

If you edit and later want Flare's version back, `flare diff` will tell you
what you changed and `flare update` will restore it.

## What is still generated

Copying the engine doesn't make the per-resource files hand-written. Routes,
validators, clients and dashboard pages are still produced by
`flare gen resource` between `// generated:start` and `// generated:end`
markers, and still rewritten when you regenerate. That is a different
contract, and [the codegen contract](/concepts/codegen-contract/) explains
it.

The difference is that those files are now thin and readable, and everything
they call is in your repo.
