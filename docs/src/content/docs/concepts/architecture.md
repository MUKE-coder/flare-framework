---
title: How Flare is built
description: The descriptor, the generator, the engine and the two stacks — what each layer does, and where the seams are.
---

Flare has four layers and two seams. Knowing where the seams are tells you
where to put your own code.

```
  resources/product.resource.ts        ← one description
            │
            ▼
  flare gen resource                   ← reads it, writes files. build time
            │
   ┌────────┼────────┬──────────┬───────────────┐
   ▼        ▼        ▼          ▼               ▼
 schema   routes  validators  client      dashboard pages
   │        │
   │        ▼
   │   lib/resource/                    ← the engine, in your app. run time
   │   ├─ http.ts     guards, responses
   │   ├─ query.ts    ?page ?sort ?q → a parsed query
   │   ├─ store.ts    validation, hooks, paging, errors
   │   ├─ handlers.ts the same as a factory, if you prefer it
   │   └─ rows.ts     ─┬─ drizzle-rows.ts → D1        ← the seam
   │                   └─ prisma-rows.ts  → Postgres
   ▼
 migrations
```

## Layer 1: the descriptor

An object. No classes, no decorators, no base class to extend:

```ts
export default defineResource({
  name: "Product",
  fields: { name: field.string(), price: field.float() },
  hooks: { beforeCreate: (input) => ({ ...input, slug: slugify(input.name) }) },
  computed: { dear: (row) => Number(row.price) > 100 },
});
```

Because it is data, everything else can be derived from it — and because it is
*typed* data, the things derived from it are typed too. `$types.record` on a
descriptor is the row's TypeScript type, inferred from the fields.

## Layer 2: the generator

Runs when you ask, never at runtime. It reads every descriptor and writes
files, each carrying a marked block:

```ts
// generated:start hash=49d32405a9be
…
// generated:end
```

Inside is rewritten; outside is preserved. The hash lets the CLI notice you
edited inside the block and refuse rather than clobber it.

**Nothing is generated at runtime.** No reflection, no proxies, no decorators
executing on import. The file that runs is the file you can read.

## Layer 3: the engine, in your app

`lib/resource/` is [copied into your app](/concepts/no-magic/), not imported.
Around 900 lines, in four parts:

| | |
| --- | --- |
| `query.ts` | `?page`, `?sort`, `?q`, `?filter[x]`, `?cursor` → a validated query, or a 400 |
| `store.ts` | Validation, hooks, computed values, paging, the capped count, mapping a database error to a status code |
| `http.ts` | The CSRF guard, the JSON read, the body drain, result → `Response` |
| `handlers.ts` | The whole flow as a factory, for anyone who prefers the short form |

The division that matters: **`store.ts` knows what a resource means;
`rows.ts` knows how to talk to a database.** Validation, hooks and error
wording live in the store and are identical on both stacks. That is why
`Sku is already taken` reads the same on D1 and Postgres, even though the
underlying errors are nothing alike.

## Layer 4: the row adapter — the seam

`rows.ts` is an interface of nine methods:

```ts
interface ResourceRows {
  db: unknown;
  find(query): Promise<Row[]>;
  countUpTo(query, limit): Promise<number>;
  byId(id): Promise<Row | null>;
  titles(ids, field): Promise<{ id: string; title: unknown }[]>;
  insert(values): Promise<Row>;
  update(id, values): Promise<Row | null>;
  remove(id): Promise<boolean>;
  constraint(error): ConstraintHit | undefined;
}
```

About fifty lines. Two implementations ship — `drizzle-rows.ts` over D1 and
`prisma-rows.ts` over Postgres — and a route names the one it uses:

```ts
rows: drizzleRows(products, getDb),         // Cloudflare
rows: prismaRows(prisma.product, prisma),   // Next.js
```

Implement those nine methods against anything — another ORM, an HTTP API, an
in-memory fake for tests — and every resource works against it. That is the
whole extension point.

## The second seam: the runtime

Above the database, the two stacks differ in three files:

| | Cloudflare | Next.js |
| --- | --- | --- |
| Entry | `worker/index.ts` — security, realtime, then the app | Next's own |
| Database client | `db/index.ts` (Drizzle over D1) | `lib/db.ts` (Prisma over Postgres) |
| Cache | Workers KV | Upstash Redis |

Everything else — descriptors, policies, hooks, components, the engine bar its
adapter — is the same code.

## Where a request goes

```
  request
    │
    ▼
  worker/index.ts          ← Cloudflare only: bans and rate limits, then
    │                        /realtime/* upgrades
    ▼
  app/api/products/route.ts
    │
    ├─ authorize()         ← lib/api.ts → policies/product.policy.ts
    ├─ crossOrigin()       ← lib/resource/http.ts
    ├─ readJson()          ← lib/resource/http.ts
    │
    ▼
  store.create()           ← lib/resource/store.ts
    ├─ validators          ← resources/product.validators.ts (Zod, strict)
    ├─ hooks.beforeCreate  ← resources/product.resource.ts
    ├─ rows.insert()       ← lib/resource/prisma-rows.ts → SQL
    ├─ hooks.afterCreate
    └─ computed values
    │
    ▼
  onChange → revalidateResource()   ← lib/cache.ts
    │
    ▼
  Response
```

Every box is a file in your app.

## What the framework keeps

`@flaredev/core` holds the parts that are a library rather than machinery:
the descriptor and field types, the validators built from them, the OpenAPI
document, the fake-data generator, formatting helpers, and the realtime
Durable Object. Things you call — not things that call you.

## Two decisions worth knowing

**Generation, not reflection.** Many frameworks inspect a model at runtime and
build queries on the fly. Flare writes the file once, at a moment you chose, so
there is no metadata layer to understand, a stack trace names your code, and a
debugger steps into something real.

**Copy, don't import.** The engine lives in your repository. You give up
automatic upgrades — `flare diff` and `flare update` are the answer — and you
gain the ability to read and change every line of it.

Both cost something. Both are stated
[in the open](/concepts/no-magic/) rather than sold as free.
