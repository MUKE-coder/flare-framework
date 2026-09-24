---
title: Choosing a stack
description: Flare targets Cloudflare Workers and Next.js on Vercel from the same resource descriptor. What each one is good at.
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
your database and writes the SQL. `flare migrate` is the Cloudflare
equivalent and doesn't apply here, and neither do `flare dev`, `build`,
`start` or `deploy` — this app runs `next dev` and deploys with `vercel`.
The CLI says so if you try.

## What this stack is missing

Being straight about it:

- **Realtime.** Cloudflare gives every channel a Durable Object — one
  address, its own storage, websockets that stay open. Vercel has no
  equivalent, so `realtimeChannel().publish()` is a no-op. A hosted pub/sub
  behind the same two functions is the way to add it.
- **Traffic analytics in-app.** The observability page reads Cloudflare's
  analytics API on the other stack; here it points you at Vercel's dashboard
  rather than holding a token that can read your whole account.
- **Seeds.** `flare seed` and `flare seed:resource` are Drizzle-only so far.
  `prisma db seed` works in the meantime.
