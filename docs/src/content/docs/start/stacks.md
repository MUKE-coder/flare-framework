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

## Status

The Cloudflare stack is what these docs describe throughout and what both
[tutorials](/tutorials/shop/) are built on. The Next.js stack is being built
now: this page will say so plainly when `--stack next` is ready to use, and
until then `flare create` targets Cloudflare whatever you pass.
