---
title: Choosing a stack
description: Cloudflare Workers with D1 and Drizzle, or Next.js on Vercel with Postgres and Prisma — compared side by side, with the same resource built on both.
---

Flare's job is to turn a [resource descriptor](/concepts/resource-descriptor/)
into a database table, a REST API, validators and a dashboard. Where that runs
is a separate question, and there are two answers.

```bash
npx flare create myapp                    # Cloudflare Workers (default)
npx flare create myapp --stack next       # Next.js on Vercel
```

## What each one is

| | **Cloudflare** (default) | **Next.js** |
| --- | --- | --- |
| Framework | vinext (Next-compatible RSC) | Next.js 16, App Router |
| Runs on | Cloudflare Workers | Vercel |
| Database | D1 (SQLite) | Neon (serverless Postgres) |
| ORM | Drizzle | Prisma 7 |
| Cache | Workers KV | Upstash Redis |
| Files | R2 | R2 or UploadThing |
| Auth | Better Auth | Better Auth |
| Email | Resend | Resend + React Email |
| Payments | Stripe | Stripe |
| Styling | Tailwind v4 + shadcn/ui | Tailwind v4 + shadcn/ui |

Auth, email, payments, styling and the dashboard are the same on both. What
changes is the runtime, the database and the ORM.

## Which to pick

**Cloudflare** if cost and reach matter most. It is the cheaper of the two by
a distance — $5/month covers a great deal, R2 charges nothing for egress, and
the app runs in every Cloudflare location without you arranging it. The
trade-off is SQLite: D1 is a real database but it is not Postgres, and the
Workers runtime is not Node.

**Next.js** if you need Postgres or Node. Real Postgres with extensions,
window functions and full-text search; any npm package that assumes Node;
Vercel's preview deployments; and a much larger pool of people who have
worked in exactly this stack before. It costs more — Vercel, Neon and Upstash
each have their own bill — and you give up R2's free egress unless you keep
files there.

If you are unsure, start on Cloudflare. [Costs](/guides/costs/) has the real
numbers, and your descriptors, hooks, policies and components move between
the two.

## What is shared, and what isn't

Shared, because it is ordinary TypeScript with no runtime in it:

- Resource descriptors, hooks, computed fields
- Policies and roles
- Every React component in the dashboard
- Seeds, and the field type grammar

Generated per stack:

- The schema and migrations — Drizzle/SQLite or Prisma/Postgres
- The route handlers — Workers or Next.js Route Handlers
- The database client and the cache adapter

## The same resource, on both

This is the whole difference, in the files one `flare gen resource Product`
writes. Everything else in the app is the same code.

### The descriptor — identical

```ts title="resources/product.resource.ts"
export default defineResource({
  name: "Product",
  fields: {
    name: field.string(),
    sku: field.string({ unique: true }),
    price: field.float(),
    category: field.belongsTo("Category", { required: false }),
  },
});
```

### The schema — different language, same shape

```ts title="Cloudflare — db/schema/products.ts"
export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  price: real("price").notNull(),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
```

```prisma title="Next.js — prisma/schema/resources.prisma"
model Product {
  id         String    @id @default(uuid())
  name       String
  sku        String    @unique
  price      Float
  categoryId String?   @map("category_id")
  category   Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")

  @@map("products")
}
```

### The route — one line apart

```ts title="app/api/products/route.ts"
import { createResourceHandlers, drizzleRows } from "@/lib/resource";
// …
  rows: drizzleRows(products, getDb),          // Cloudflare
  rows: prismaRows(prisma.product, prisma),    // Next.js
```

Both call the same `createResourceHandlers` — [which is code in your app](/concepts/no-magic/),
not in a package. The row adapter is the seam, and it is about 130 lines on
either side.

### The commands

| | Cloudflare | Next.js |
| --- | --- | --- |
| Write a migration | `flare gen migration --from-schema` | `prisma migrate dev` |
| Apply it | `flare migrate` | `flare migrate` (= `prisma migrate deploy`) |
| Dev server | `flare dev` | `flare dev` (= `next dev`) |
| Deploy | `flare deploy` | `flare deploy` (= `vercel deploy --prod`) |
| Fill a table | `flare seed:resource Product 25k` | `flare seed:make` + `flare seed` |

## Stack differences, in one table

Everything that behaves differently, in one place. If a command or a feature is
not here, it works the same on both.

| | Cloudflare | Next.js |
| --- | --- | --- |
| `flare migrate` | applies pending D1 migrations | runs `prisma migrate deploy` |
| Writing a migration | `flare gen migration --from-schema` | `npx prisma migrate dev` |
| `flare seed` | the local D1 database | the database in `DATABASE_URL` |
| `flare seed:resource` | fills a table from its descriptor | **not available** — use `flare seed:make <name> --resource <R>`, then `flare seed` |
| `--remote`, `--env`, `--database` | target the deployed D1 database | **ignored** — there is one database, the one in `DATABASE_URL` |
| `flare dev` / `build` / `start` | vinext and wrangler | `next dev` / `next build` / `next start` |
| `flare deploy` | migrates, builds, pushes to Workers, syncs secrets and zone rules | `vercel deploy --prod` |
| `realtimeChannel().publish()` | delivered by a Durable Object per channel | **does nothing**, and warns once per channel saying so |
| Websocket connections | `/realtime/<channel>/ws` | refused — `authorizeRealtime` returns `false` |
| Observability page | reads Cloudflare's Analytics API | reports "unconfigured" and points at Vercel's dashboard |
| A `json` field's key order | kept as written (stored as text) | normalised (`jsonb` is parsed, not text) |
| Full-text search | `LIKE` over indexed columns | the same, plus Postgres `tsvector` if you write it |
| Request CPU | 10ms free, 30s paid | the function's configured timeout |
| Node APIs | Workers runtime — no filesystem, no native modules | all of them |

`flare --help` reads the stack from your `package.json`, so it describes the one
you are actually on rather than listing both.

## Where they genuinely differ

Beyond the table at the top, these are the differences that change what you
can build.

**The runtime.** Workers is not Node. Most npm packages work; anything using
Node's filesystem, native modules or long-lived TCP does not. Next.js on
Vercel runs Node, so everything works.

**CPU per request.** A Worker on the free plan gets 10ms of CPU per
invocation, and 30 seconds on the paid one — plenty for a query and a render,
not enough to resize video. Vercel functions run to their configured timeout.

**SQLite versus Postgres.** D1 is real SQL and fine for most applications.
Postgres gives you extensions, window functions, `tsvector` full-text search
with ranking, `jsonb` operators and materialised views. If you know you need
one of those, the choice is made.

**Cold starts.** Workers have effectively none. Neon's free tier suspends an
idle database, so the first request after a quiet spell waits for it to wake
— a plan choice, not a code problem.

**Egress.** R2 charges nothing for bandwidth out. For an app that serves
files, this is often the single biggest line on the bill, which is why both
stacks use R2 for storage.

**Realtime.** Cloudflare gives every channel a Durable Object — one address,
its own storage, websockets that stay open. Vercel has no equivalent, so
`realtimeChannel().publish()` delivers nothing. It logs a warning the first
time, once per channel, rather than failing quietly; the write that triggered
it still succeeds.

## Can I switch later?

Not with a command, and there isn't one planned. What moves without change:
your descriptors, hooks, computed fields, policies, seeds, every dashboard
component, and `lib/resource/` itself apart from its row adapter. What
doesn't: the schema and its migration history, the database client, the cache
adapter and the deployment.

In practice, moving a small app is an afternoon — regenerate the resources on
a new app of the other stack and move the data. Moving a large one with a
year of migrations is not.

The honest advice is to pick for the database. Everything else is either
shared already or a day's work; a schema with real data in it is neither.

## Starting a Next.js app

```bash
npx flare create shop --stack next
cd shop
cp .env.example .env          # DATABASE_URL from Neon, BETTER_AUTH_SECRET
npx flare gen resource Product --fields 'name:string, sku:string!, price:float'
npx prisma migrate dev        # turns the schema into a migration and applies it
npm run dev
```

`flare gen resource` writes the same route handlers, typed client, validators
and dashboard pages it writes on Cloudflare. What changes is the schema:
`prisma/schema/resources.prisma` instead of a Drizzle module per table.

`prisma/schema` is a folder of two files, and the split matters:

- **`base.prisma`** — the generator, the datasource, and the tables Better
  Auth and the dashboard need. Yours to edit; never regenerated.
- **`resources.prisma`** — your resources, written from the descriptors.
  Overwritten every time you run `flare gen resource`.

Migrations are Prisma's: `npx prisma migrate dev` diffs the schema against
your database and writes the SQL. `flare migrate` applies what is already
written — it runs `prisma migrate deploy` here — which is the one you want
against a database that matters, because it never invents a migration.

`flare dev`, `build`, `start` and `deploy` work here too, delegating to Next
and the Vercel CLI instead of vinext and wrangler — so the commands are the
same on both stacks even though what they run isn't. `flare build` runs
`prisma generate` first, and `flare deploy` is `vercel deploy --prod` with
your arguments forwarded. [Deploying to Vercel](/guides/vercel-deployment/)
is the detail.

## What this stack is missing

Being straight about it:

- **Realtime.** Cloudflare gives every channel a Durable Object — one
  address, its own storage, websockets that stay open. Vercel has no
  equivalent, so `realtimeChannel().publish()` delivers nothing — it warns
  once per channel and lets the write succeed. `lib/realtime.ts` is two
  functions in your app; a hosted pub/sub (Ably, Pusher, Upstash) behind them
  is the way to add it.
- **Traffic analytics in-app.** The observability page reads Cloudflare's
  analytics API on the other stack; here it points you at Vercel's dashboard
  rather than holding a token that can read your whole account.
- **`flare seed:resource`.** The one-liner that fills a table from its
  descriptor writes to D1 through wrangler, so it is Cloudflare-only. Seed
  files themselves work: `flare seed:make <name> --resource Product` writes
  one with the rows filled in, and `flare seed` runs it. What it hands you is
  the app's own Prisma client, plus an `insertMany` over `createMany`.
