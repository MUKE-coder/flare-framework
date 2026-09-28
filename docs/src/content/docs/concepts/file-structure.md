---
title: Every file in a Flare app
description: What flare create writes, what each folder is for, which files are yours, which are generated, and which you can delete.
---

A new app has around 170 files. Most of them you will never open. This page
says what each folder is for and, more usefully, **which files are yours**.

```
myapp/
├─ resources/        ← you write these. everything else comes from them
├─ policies/         ← who may do what
├─ seeds/            ← sample data (created by `flare seed:make`)
├─ app/              ← routes: pages and API
├─ components/       ← the UI, copied in, yours to change
├─ lib/              ← the machinery, copied in, yours to change
├─ db/ or prisma/    ← the schema, generated from resources/
├─ migrations/       ← SQL, applied in order
└─ worker/           ← the Cloudflare entrypoint (Cloudflare stack only)
```

## The three kinds of file

Before the tour, the distinction that matters most:

| | Who owns it | What happens on `flare gen resource` |
| --- | --- | --- |
| **Yours** | You | Untouched |
| **Generated** | Flare, between `// generated:start` and `// generated:end` markers | The marked block is rewritten; anything outside it is kept |
| **Copied** | You, after `flare create` puts it there | Untouched. `flare diff` shows what changed upstream |

[The codegen contract](/concepts/codegen-contract/) covers the second;
[Nothing is hidden](/concepts/no-magic/) covers the third.

## `resources/` — the source of truth

```
resources/
├─ product.resource.ts      ← YOURS. the description everything derives from
├─ product.client.ts        ← generated. a typed fetch client
├─ product.validators.ts    ← generated. Zod schemas, strict
├─ index.ts                 ← generated. the registry the dashboard reads
└─ server.ts                ← generated. the server-side registry
```

You edit `*.resource.ts`. The rest is written from it. A descriptor names the
fields, and optionally `hooks`, `computed`, `icon`, `group`, `titleField`.

`*.client.ts` is worth knowing about: it is a typed wrapper over `fetch` for
that resource, so a client component can call `productClient.list({ q })`
without writing a URL.

## `policies/` — who may do what

```
policies/
├─ product.policy.ts        ← yours, after `flare gen policy Product`
└─ index.ts                 ← generated registry
```

One file per resource, each exporting `read`, `create`, `update` and
`delete`. Return `true`, `false`, or an object to filter rows. Both the API
and the dashboard read these, so a rule written once holds in both.

## `app/` — routes

```
app/
├─ page.tsx                 ← the public home page
├─ layout.tsx               ← fonts, theme, <html>
├─ not-found.tsx            ← 404
├─ error.tsx                ← error boundary
├─ loading.tsx              ← shown while a page loads
├─ globals.css              ← Tailwind and the theme tokens
├─ sign-in/ sign-up/ …      ← auth screens, all built
├─ admin/                   ← the admin area's own pages
├─ dashboard/               ← the signed-in app
│  ├─ layout.tsx            ← sidebar, header, the frame
│  ├─ page.tsx              ← overview
│  ├─ actions.ts            ← server actions the dashboard calls
│  ├─ account/              ← profile, password, sessions, security
│  ├─ costs/                ← what this app costs to run
│  └─ products/             ← generated per resource: list, new, [id], [id]/edit
│                             plus a loading.tsx beside each
└─ api/
   ├─ products/route.ts     ← generated. GET list, POST create
   ├─ products/[id]/route.ts← generated. GET, PATCH, PUT, DELETE
   ├─ auth/[...all]/        ← Better Auth
   ├─ storage/              ← signed upload and read URLs
   ├─ health/               ← a liveness check
   ├─ openapi.json/         ← your API, described
   └─ reference/            ← that description, rendered
```

## `lib/` — the machinery

All copied into your app. None of it is imported from the framework at
runtime.

| File | What it does |
| --- | --- |
| `resource/` | **The engine.** Request → response, validation, queries. [Explained here](/concepts/no-magic/) |
| `api.ts` | `authorize` and `currentUser`, which every generated route calls |
| `auth.ts`, `auth-config.ts`, `auth-client.ts` | Better Auth, server and browser |
| `session.ts` | `requireSession()` for server components |
| `db.ts` (Next) / `db/index.ts` (Cloudflare) | The database client |
| `storage.ts` | Signed upload and read URLs, over R2 |
| `cache.ts` | `revalidateResource`, called after every write |
| `mail.ts`, `auth-emails.ts` | Transactional email |
| `dashboard.ts` | The store the dashboard's server actions use |
| `dashboard-nav.ts` | What appears in the sidebar |
| `site.ts` | **Yours.** The app's name, tagline, marketing copy |
| `theme.ts`, `utils.ts`, `number.ts`, `csv.ts` | Small helpers |
| `views.ts`, `audit.ts` | Saved views and the audit log |
| `costs.ts`, `usage.ts` | The cost estimator |
| `realtime.ts` | Channels and who may join them |
| `security.ts` | Rate limits and abuse rules (Cloudflare) |
| `redis.ts` (Next) | Upstash, for anything that must be true across instances |
| `analytics.ts` | Traffic figures for the observability page |
| `password-rules.ts`, `suggest.ts` | Password policy; the SKU suggester |
| `api-docs.ts` | The OpenAPI document |

**The two you will edit first** are `site.ts` (your app's words) and
`api.ts` (how a request is authorised).

## `components/` — the UI

```
components/
├─ ui/                  ← shadcn/ui primitives: button, table, dialog, …
├─ dashboard/           ← the admin: tables, forms, fields, skeletons
├─ auth/                ← sign-in, sign-up, OTP, passkeys, two-factor
├─ account/             ← the account section
└─ marketing/           ← the public site's header and hero
```

`components/dashboard/resource-table.tsx` and `resource-form.tsx` are the two
worth reading — they are what every generated admin page renders, driven by
the descriptor. Change them once and every resource changes.

## The database

**Cloudflare:**

```
db/
├─ schema.ts            ← generated index
├─ schema/products.ts   ← generated Drizzle table, one per resource
├─ relations.ts         ← generated
├─ auth-schema.ts       ← Better Auth's tables
└─ flare-schema.ts      ← audit log, saved views, roles
migrations/
└─ 0001_create_products.sql
```

**Next.js:**

```
prisma/
├─ schema/base.prisma       ← YOURS. generator, datasource, auth tables
├─ schema/resources.prisma  ← generated from your descriptors
└─ migrations/
```

`base.prisma` is never regenerated; `resources.prisma` always is.

## The rest

| | |
| --- | --- |
| `worker/index.ts` | Cloudflare only. Security, then realtime, then the app |
| `proxy.ts` | Middleware |
| `wrangler.jsonc` / `next.config.ts` | Platform config |
| `.env` / `.dev.vars` | Secrets. **Not committed** |
| `.env.example` / `.dev.vars.example` | The committed template |
| `components.json` | shadcn's config, so `npx shadcn add` works |
| `hooks/` | React hooks the dashboard uses |
| `postcss.config.mjs` | Tailwind |

## What you can delete

More than you would think. If you are not using something, remove it:

- **`app/page.tsx` and `components/marketing/`** — if your app has no public
  side, delete both and redirect `/` to `/dashboard`.
- **`app/dashboard/costs/`** — the cost estimator.
- **`lib/realtime.ts` and the `FLARE_REALTIME` binding** — if nothing is live.
- **`lib/security.ts`** — it is a pass-through until `flare gen security`.
- **`app/api/reference/` and `api-docs.ts`** — if you do not want a public
  API reference.

Nothing in `lib/resource/` is optional; that is what serves your endpoints.
