---
title: Project structure
description: What flare create scaffolds, and where generated code lands.
---

A scaffolded app is a normal vinext app with a few Flare-specific
directories layered on top:

```text
myapp/
├─ app/                        # vinext routes (Next.js App Router conventions)
│  ├─ layout.tsx               # root layout; inline script applies the saved theme before first paint
│  ├─ page.tsx                 # home page
│  ├─ globals.css              # Tailwind + theme tokens
│  ├─ sign-in/, sign-up/       # email/password (and optional OAuth) forms
│  ├─ dashboard/               # example signed-in page (requireSession)
│  ├─ admin/                   # admin shell: layout, overview page, server actions
│  │  └─ <slug>/               # generated list / new / [id]/edit pages, one per resource
│  └─ api/
│     ├─ auth/[...all]/        # Better Auth's route handler
│     ├─ health/               # GET: checks the app and a D1 query
│     ├─ storage/              # signed upload/read URL redemption (R2)
│     └─ <slug>/               # generated REST routes, one per resource
├─ components/
│  ├─ ui/                      # shadcn/ui primitives, copied in as editable source
│  ├─ admin/                   # <ResourceTable>, <ResourceForm>, <ResourceNav>, header, field widgets
│  ├─ auth-form.tsx
│  └─ sign-out-button.tsx
├─ hooks/use-mobile.ts         # used by the shadcn sidebar
├─ db/
│  ├─ schema.ts                # Drizzle entry point: re-exports auth, Flare and resource tables (generated block)
│  ├─ auth-schema.ts           # Better Auth's tables (ships with the template)
│  ├─ flare-schema.ts          # Flare's own tables: `role`
│  ├─ schema/                  # one Drizzle table module per resource (from `gen resource`)
│  ├─ relations.ts             # Drizzle relations(), regenerated on every `gen` (from `gen resource`)
│  └─ index.ts                 # getDb(), bound to env.DB
├─ resources/
│  ├─ index.ts                 # registry of every descriptor (generated block)
│  ├─ server.ts                # server-only: resource name -> descriptor and table (generated block)
│  ├─ <name>.resource.ts       # the descriptor: your source of truth
│  ├─ <name>.validators.ts     # zod schemas derived from the descriptor
│  └─ <name>.client.ts         # typed REST client
├─ policies/
│  ├─ index.ts                 # registry of every policy (generated block)
│  └─ <name>.policy.ts         # role permissions per resource, from `flare gen policy`
├─ lib/
│  ├─ auth.ts                  # Better Auth instance (server)
│  ├─ auth-client.ts           # Better Auth client (browser)
│  ├─ session.ts               # getSession() / requireSession()
│  ├─ admin.ts                 # /admin access, policy checks, admin stores, record counts
│  ├─ api.ts                   # authorize(): every generated API route calls it first
│  ├─ storage.ts               # R2 signed URL helpers
│  ├─ mail.ts                  # Resend mailer + sendTransactionalEmail()
│  ├─ cache.ts                 # cached(), TTL, resourceTag(), revalidateResource()
│  ├─ realtime.ts              # authorizeRealtime() and realtimeChannel(name)
│  └─ utils.ts                 # cn() class-name helper for shadcn/ui
├─ worker/index.ts             # custom Worker entrypoint: realtime upgrades, then the vinext app
├─ migrations/
│  ├─ 0000_init.sql            # Better Auth tables + `role` table; seeds the admin and staff roles
│  ├─ meta/                    # drizzle-kit snapshots and journal
│  ├─ NNNN_*.sql               # one per `gen resource` / `gen migration`
│  └─ down/                    # optional hand-written down migrations
├─ seeds/<name>.seed.ts        # from `flare seed:make`, run with `flare seed` (created on demand)
├─ proxy.ts                    # optimistic cookie-only redirect to /sign-in (no DB call)
├─ vite.config.ts              # vinext + Cloudflare plugin; KV data cache configured here
├─ wrangler.jsonc              # D1, R2, KV and the FLARE_REALTIME Durable Object; no IDs needed
├─ drizzle.config.ts
├─ next.config.ts
├─ components.json             # shadcn/ui config
├─ postcss.config.mjs
├─ tsconfig.json
├─ worker-configuration.d.ts   # binding types, from `wrangler types` (generated at create)
├─ .dev.vars                   # local secrets (git-ignored, created by `flare create`)
├─ .dev.vars.example           # documents every optional secret
├─ .gitignore
└─ README.md
```

## What's generated vs. hand-written

Every generated file carries a `// generated:start` / `// generated:end`
marker around the part the generator owns. Code outside that block is
yours — re-running `gen resource` never touches it. See the
[codegen overwrite contract](/concepts/codegen-contract/) for the exact
rules, and [`sync-types`](/concepts/sync-types/) for how drift between the
descriptor and the generated files is detected and reported.

`components/ui` and `components/admin` are copied in as plain source, not
hidden inside a package — if you need to change how `<ResourceTable>`
renders a cell, you edit the file directly, the same way you'd edit any
shadcn/ui component.
