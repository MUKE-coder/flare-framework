# Flare Framework: A Fullstack Developer's Review

**Reviewed:** `@flaredev/cli` / `@flaredev/core` **0.10.0** (commit `ff631a9`, "money moves to minor units")
**Date:** 30 October 2026
**Sources:** [flare-docs.codetotech.com](https://flare-docs.codetotech.com), the [GitHub repo](https://github.com/MUKE-coder/flare-framework) (cloned and read), and a hands-on test run described below.

---

## Contents

1. [Summary](#1-summary)
2. [How this review was done](#2-how-this-review-was-done)
3. [What I'd love about it](#3-what-id-love-about-it)
4. [Why I'd hesitate](#4-why-id-hesitate)
5. [Smaller issues found](#5-smaller-issues-found)
6. [Feature suggestions](#6-feature-suggestions)
   - 6.1 [A plugin system](#61-a-plugin-system-the-big-one)
   - 6.2 [Security and access](#62-security-and-access)
   - 6.3 [Data and backend](#63-data-and-backend)
   - 6.4 [Dashboard and admin](#64-dashboard-and-admin)
   - 6.5 [Developer experience](#65-developer-experience)
   - 6.6 [AI-native features](#66-ai-native-features)
   - 6.7 [Ecosystem and adoption](#67-ecosystem-and-adoption)
7. [Suggested roadmap to 1.0](#7-suggested-roadmap-to-10)
8. [Final verdict](#8-final-verdict)

---

## 1. Summary

Flare has one strong idea and executes it well: **describe a resource once, and the table, migration, validators, REST API, typed client, policy hooks and admin screens all come from that description.** The code that runs it is **copied into the app**, the way shadcn/ui copies components, instead of being hidden in `node_modules`.

In testing, everything worked on the first try: the build, all 682 tests, scaffolding an app, generating a resource, migrating, the dev server, sign-up and the API's edge cases. That's rare for a 0.x framework.

The main risks are not in the idea. They are:

- **Defaults:** a new app is open to anyone who signs up.
- **Foundations:** the default stack runs on a beta runtime (`vinext 1.0.0-beta.10`).
- **Missing pieces:** no multi-tenancy, no field-level permissions and no plugin system.
- **Trust:** pre-1.0 breaking changes, a single maintainer and low adoption so far.

**Verdict:** a strong 0.x and already excellent for solo developers and agencies. It needs a security-defaults pass, multi-tenancy, a plugin model and a stable contract before teams will adopt it.

---

## 2. How this review was done

| Step | Result |
|---|---|
| Read the docs: home, quickstart, stacks, field grammar, generated files, roles and policies | Clear and honest. Each page lists its own limitations. |
| `pnpm install --frozen-lockfile` | Done in ~46 s |
| `pnpm test` (build plus vitest) | **66 files, 682 tests, all passing**, in ~28 s |
| `flare create try-cf --theme mono` (Cloudflare stack) | 181 files written |
| `flare gen resource Invoice --fields 'number:string!, customerEmail:string, amount:money, status:enum(draft,sent,paid), dueDate:date?, pdf:file:[pdf]:2mb?'` | 19 files created or updated, plus migration `0001_create_invoices.sql` |
| `flare migrate` (local D1) | Both migrations applied |
| `tsc --noEmit` on the app | Exit 0, no type errors |
| `flare dev` and HTTP requests | Home 200, sign-in 200, OpenAPI served, API working (details below) |

### API behaviour observed

| Request | Response | Comment |
|---|---|---|
| `GET /api/invoices` while signed out | `401 {"error":"Sign in required."}` | Correct |
| Create a valid invoice with `amount: 19.99` | `201`, with a `Location` header | Stored as `1999` minor units, returned as `19.99` |
| Same `number` again | `409 {"error":"Number is already taken.","field":"number"}` | Error tied to the field, so the form can highlight it |
| Bad email, `19.999`, `status:"lost"`, unknown key `hacker` | `422` listing **all four** problems | Strict schema, with readable messages |
| POST with `Origin: https://evil.com` | `403 Forbidden` | Cross-origin check works |
| `?filter[status]=draft&sort=-createdAt` | `200` with `meta.exactTotal` | Filtering and sorting work |
| `?perPage=5000` | `400`, "must be an integer from 1 to 100" | Page-size cap enforced |
| Brand-new random user opens `/dashboard/invoices` | **`200`, full CRUD access** | See issue 4.1 |

---

## 3. What I'd love about it

### 3.1 The descriptor really is the source of truth

```ts
export default defineResource({
  name: "Invoice",
  fields: {
    number: field.string({ unique: true }),
    customerEmail: field.string({ format: "email" }),
    amount: field.float({ format: "money" }),
    status: field.enum(["draft", "sent", "paid"]),
    dueDate: field.date({ required: false }),
    pdf: field.file(["pdf"], { required: false, maxBytes: 2097152 }),
  },
});
```

From this, one command produced a correct migration, with a CHECK constraint for the enum, a unique index on `number`, and indexes on `status` and `created_at`. It also produced the Zod validators, list and item routes, a typed client and four dashboard pages with loading skeletons. Labels and validation rules are read at runtime; only storage changes need a migration. That split is the right design.

### 3.2 The engine's code lives in your repo

`lib/resource/` is about 1,200 lines in the generated app (`store.ts` 572, `query.ts` 175, `drizzle-rows.ts` 141, `handlers.ts` 118, `http.ts` 108, `rows.ts` 89). Ctrl-click `createResourceStore` and you're in your own code. `flare diff` and `flare update --yes` give you ownership and still let you upgrade. **This is the headline feature, and no competitor (Refine, Payload, Directus, Wasp, RedwoodJS) does it this way.**

### 3.3 Routes that read top to bottom

```ts
export async function POST(request: Request) {
  try {
    const denied = await authorize({ request, resource: invoiceResource, action: "create" });
    if (denied) return denied;
    if (crossOrigin(request)) return problem(403, "Cross-origin request blocked.");
    const read = await readJson(request);
    if ("response" in read) return read.response;
    const result = await store.create(read.body);
    ...
  } finally {
    await drain(request); // works around a wrangler dev-proxy bug, with a comment explaining it
  }
}
```

Each guard is a named function, in order. A junior developer or an AI agent can follow the request without guessing.

### 3.4 Careful handling where frameworks usually break

- `z.strictObject` rejects unknown fields with a readable message.
- Unique-constraint errors are mapped back to the field, with the same wording on SQLite and Postgres.
- Count queries are capped (`COUNT_LIMIT`, `exactTotal: false`), and paging continues by cursor past the cap.
- Money is stored as integer minor units, and extra decimals are rejected rather than silently rounded.
- File uploads check the file's leading bytes, so a renamed executable is refused. `image` excludes SVG because SVG can carry script.
- With `own`, another user's record returns 404 rather than 403, so the API doesn't reveal that a record exists.
- `onChange` runs before the response is sent, so cache invalidation can't race the response.

### 3.5 A lot comes included

Better Auth (passwords, magic links, email codes, passkeys, 2FA, Google, GitHub, Apple, Microsoft), R2 uploads, Resend mail, Stripe subscriptions and checkout, OpenAPI 3.1 with a reference page, CSV import and export, saved views, an audit log, a security dashboard, API keys, six themes, a cost estimator, `flare tunnel` and `flare deploy`, which runs migrations and sets missing secrets. For a solo developer, that's weeks of setup already done.

### 3.6 Built for AI agents from the start

There's an installable skill (`npx skills add MUKE-coder/flare-framework@flare`), `/llms.txt`, a "Build with AI" brief on every docs page, and generated-code markers with hashes (`generated:start hash=…`) that tell an agent exactly what it may touch. That's ahead of nearly every framework.

### 3.7 Two stacks from one descriptor

Cloudflare (D1, Drizzle, KV, Durable Objects) or Next.js on Vercel (Neon, Prisma 7, Upstash). Descriptors, hooks, policies, seeds and dashboard components are the same on both.

### 3.8 Writing developers can trust

The changelog names the root cause of each bug ("The Export button never worked", followed by why). The stacks page has a "What each stack lacks" section. The docs include a "Who it's not for" page. Developers trust this tone, and it's a competitive advantage.

### 3.9 CI that mirrors real use

CI scaffolds a real app and tests it end to end. It also checks that the template's lockfile installs under pnpm 12, a lesson from the 0.9.0 lockfile bug. That shows the project learns from its mistakes.

---

## 4. Why I'd hesitate

### 4.1 A new app is open to anyone (critical)

- Sign-up is open by default (`disableSignUp: false` in `lib/auth.ts`).
- A resource without a policy file is **open to any signed-in user** (`lib/api.ts`).
- The dashboard layout doesn't gate on role either.

**Reproduced:** I signed up as `dev@x.com` with no role and immediately had full create, read, update and delete access to `/api/invoices` and `/dashboard/invoices`.

The docs do state this. But someone following the quickstart and deploying would have an admin panel open to the internet, and "secure by default" is the property a framework is judged on.

**Fix (pick one or combine):**
- `flare gen resource` also writes a default policy: `read/create/update/delete: ["admin"]`.
- The first user to sign up becomes `admin`; later sign-ups get no role and see a "waiting for access" page.
- Add `flare create --signup=open|invite|closed`, defaulting to `invite`.
- `/dashboard` requires a role in `ADMIN_ROLES` or an explicit `dashboard: ["staff"]` setting.
- `flare deploy` warns when resources have no policy: "3 resources are open to any signed-in user."

### 4.2 The default stack runs on a beta runtime

The Cloudflare stack depends on `vinext 1.0.0-beta.10` and `@vinext/cloudflare 1.0.0-beta.8`. Every Cloudflare app sits on a Next-compatible runtime that isn't stable yet. An agency choosing a stack for a client will hesitate here more than anywhere else.

**Fix:** pin it and document a support policy ("Flare tests against vinext X; upgrades go through `flare update`"). Offer a fallback such as `--stack cloudflare-opennext` (Next.js on Workers via OpenNext), and publish a page on the plan if vinext stalls.

### 4.3 Breaking changes before 1.0

The 0.10.0 change from float to integer minor units for money requires **a manual migration** for existing apps. The changelog also shows several releases fixing features that never worked on first use: Export in 0.8.1, cursor paging on Next in 0.7.3, `rm resource` on Next in 0.8.0, and the lockfile in 0.9.0. CI has since improved a lot, but teams will wait for a few quiet releases.

**Fix:** codemods (`flare upgrade 0.10`) that write the data migration for you, a written stability promise for the descriptor format, and a "Breaking" section at the top of each changelog entry.

### 4.4 Permissions stop at "my own rows"

`own: { field: "userId" }` is a good start, but:

- **No multi-tenancy:** no organisation or workspace scoping, which nearly every B2B SaaS needs early.
- **No field-level rules:** you can't let staff edit a deal but not its `value`.
- **No conditional rules:** for example, "can update while `status = draft`".
- **`store.titles()` isn't filtered by owner:** a relation picker can list other users' record titles.
- **Hand-built stores without `currentUser` aren't restricted,** which is easy to get wrong in server actions and jobs.

See 6.2 for proposals.

### 4.5 The two stacks aren't equal

- `realtimeChannel().publish()` **does nothing, silently,** on Next/Vercel. Porting an app from Cloudflare gives no error and no behaviour.
- `seed:resource` is Cloudflare-only.
- There's no way to migrate between stacks, and none is planned.
- Postgres features (`tsvector` search, `jsonb` operators) aren't available on the default stack.

**Fix:** make `publish()` throw, or log a warning once, when no realtime adapter is configured. Ship adapters for Ably, Pusher or PartyKit. Consider **Postgres on Cloudflare via Hyperdrive** as a third combination.

### 4.6 Regeneration takes over whole files

Generated routes and pages are wrapped entirely in `generated:start/end`. Customising a route means editing inside the block, which then blocks regeneration without `--force`, or moving logic elsewhere. Hooks help, but a clear set of places to extend (`beforeAuthorize`, `afterCreate`, extra route handlers) would make this easier.

### 4.7 Single maintainer and low adoption

The code is better than its adoption numbers suggest. But for a team choosing a foundation for years of work, depending on one maintainer is a real factor. This is a distribution and community problem, not an engineering one (see 6.7).

### 4.8 Size of a new app

A new app has 181 files and about 340 packages before you add anything. That's reasonable for a fullstack starter, but a `--minimal` option (no billing, no security dashboard, no themes) would help people evaluating it.

---

## 5. Smaller issues found

| # | Where | Issue | Suggestion |
|---|---|---|---|
| S1 | Generated descriptor | `amount: field.float({ format: "money" })`, but the column is `integer` (minor units). "Float" next to integer storage is confusing. | Add `field.money({ currency: "USD" })` as its own type. |
| S2 | Cross-origin guard | Returns plain-text `Forbidden`, while other errors are JSON `{ error }`. | One error format everywhere, ideally RFC 9457 `application/problem+json`. |
| S3 | Error shape | `{ error, field }` and `{ error, issues[] }` coexist. | One documented envelope: `{ error, code, issues?: [{ path, message, code }] }`. Machine-readable `code`s help with i18n. |
| S4 | `create` output | "Next" steps don't mention policies or sign-up. | Add "`npx flare gen policy Contact --roles admin` — resources are open to any signed-in user until you do." |
| S5 | Dev log | `compile: 1793356191.3s` printed on the first request. | A timer bug in vinext or in Flare's dev logger. |
| S6 | `money` filtering | Not filterable unless `filterable: true`. | Fine, but say so in the field-grammar table, not only in the limitations. |
| S7 | `email` auto-format | A field named `customerEmail` silently becomes `format: "email"`. | Useful, but print it in the gen output ("inferred: email format"). |
| S8 | Generated files doc | It doesn't clearly say which files you own and which get regenerated. | Add an ownership table, or a `flare explain <file>` command. |

---

## 6. Feature suggestions

### 6.1 A plugin system (the big one)

Flare already has generators (`gen billing`, `gen security`, `gen apikeys`), and each is effectively a built-in plugin. Making that a public contract would let the community extend Flare without you writing everything.

**Design principle:** keep the "no magic" approach. Plugins are **copied into the app** like everything else, shadcn-registry style, not hidden runtime extensions.

```ts
// flare-plugin-comments/plugin.ts
import { definePlugin, field } from "@flaredev/core";

export default definePlugin({
  name: "comments",
  version: "1.0.0",
  requires: { flare: ">=0.11", stacks: ["cloudflare", "next"] },

  // New resources the plugin owns
  resources: {
    Comment: {
      fields: {
        body: field.markdown(),
        target: field.polymorphic(),            // resource name + id
        author: field.belongsTo("User"),
      },
    },
  },

  // Add things to resources the user already has
  extend: {
    resource: (r, opts) => opts.on.includes(r.name)
      ? { dashboard: { recordTabs: [{ label: "Comments", component: "CommentsTab" }] } }
      : r,
  },

  // Files copied into the app, owned by the user afterwards
  files: ["components/plugins/comments/**", "lib/plugins/comments/**"],

  // Hooks into the request and data lifecycle
  hooks: {
    afterCreate: "lib/plugins/comments/notify.ts",
  },

  // Dashboard nav, settings page, CLI verbs
  dashboard: { nav: [{ label: "Moderation", href: "/dashboard/comments" }] },
  cli: { "comments:purge": "lib/plugins/comments/purge.ts" },

  // Environment variables and Cloudflare bindings it needs
  env: [],
  bindings: [],
});
```

**CLI:**

```sh
flare add comments --on Post,Ticket     # copy files, wire hooks, write the migration
flare add github:someone/flare-plugin-x # third-party
flare plugins                           # list installed plugins, versions, drift
flare diff --plugin comments            # how your copy differs from upstream
flare update comments                   # take the upstream version, with a diff shown
flare remove comments                   # remove the files and write a drop migration
```

**Extension points the core would need:**

| Extension point | Purpose |
|---|---|
| Field types (`registerField`) | New column types, validators, inputs and displays (for example `geo`, `signature`, `phoneVerified`) |
| Resource transforms | Add fields or behaviour to existing resources (`softDelete`, `timestamps`, `tenant`) |
| Lifecycle hooks | `beforeAuthorize`, `beforeCreate`, `afterUpdate`, `onDelete`, and others |
| Route middleware | Rate limiting, tracing, feature flags |
| Dashboard slots | Nav items, record tabs, table row actions, bulk actions, widgets, settings pages |
| Stack adapters | Storage, cache, mail, realtime, queue providers |
| CLI verbs | `flare <plugin>:<verb>` |
| Policy extensions | New rule types such as `tenant` or conditional rules |

**First-party plugins worth shipping:**

| Plugin | What it does |
|---|---|
| `tenancy` | Organisations, members, invitations, an org switcher, row scoping (see 6.2) |
| `comments` | Threaded comments with @mentions on any resource |
| `notifications` | In-app inbox plus email and push, with per-user preferences |
| `activity-feed` | Timeline per record, built on the audit log |
| `webhooks` | Outgoing webhooks per resource event, with signing, retries and a delivery log |
| `search` | Full-text search via D1 FTS5, Postgres `tsvector`, or semantic search via Vectorize |
| `i18n` | Translatable fields plus a translated dashboard |
| `workflow` | Status state machines with transitions, guards and approvals |
| `cms` | Pages, blocks, drafts and publishing, so Flare can compete with Payload |
| `forms` | Public forms that write to a resource, with Turnstile spam protection |
| `scheduler` | Cron jobs defined in code (Workers Cron Triggers or Vercel Cron) |
| `analytics` | Product events and funnels on Workers Analytics Engine |
| `feature-flags` | Flags per role, org or percentage, stored in KV or Redis |
| `ai` | AI fields, summaries and semantic search (see 6.6) |
| Payments | Paddle, Lemon Squeezy, **Flutterwave, Paystack and MTN MoMo**, which would open the African market where Stripe coverage is limited |
| `storage-uploadthing`, `mail-postmark`, `realtime-ably` | Provider adapters |

A **plugin directory page** in the docs (name, stacks, version, install command, maintainer) would also become your main community surface.

### 6.2 Security and access

1. **Secure defaults:** see 4.1. Highest priority.
2. **Multi-tenancy as a primitive:**
   ```ts
   definePolicy({
     resource: "Invoice",
     tenant: { field: "orgId" },                 // every query scoped to the active org
     read: ["org:member"], update: ["org:admin"],
   });
   ```
   Better Auth already has an organisation plugin, so Flare can build on it: org switcher, invitations, per-org roles and scoped stats.
3. **Field-level permissions:**
   ```ts
   fields: { value: { read: ["*"], write: ["admin"] } }
   ```
   Applied in the store, so the API, the dashboard forms and the OpenAPI document all reflect it.
4. **Conditional rules:** `update: { roles: ["staff"], when: (row, user) => row.status === "draft" }`.
5. **Owner filtering for `store.titles()`,** so relation pickers can't show other users' titles.
6. **Make "not restricted" opt-in:** `createResourceStore` should require `currentUser`, or an explicit `system: true`, so scripts can't bypass ownership by accident.
7. **Rate limiting per resource and action:** `rateLimit: { create: "10/min" }`, using Cloudflare's rate-limit binding or Upstash.
8. **Turnstile** on sign-up and public forms, switched on with one flag.
9. **Impersonation UI** for admins (`impersonatedBy` already exists in the session), recorded in the audit log.
10. **`flare audit:security`:** a static check for resources without policies, open sign-up, missing secrets, CORS settings and unprotected routes, run in CI.
11. **Data export and deletion per user** (GDPR-style), using the descriptor to find every row that belongs to a user.

### 6.3 Data and backend

1. **Background jobs and queues:**
   ```ts
   export default defineJob({ name: "send-invoice", run: async ({ invoiceId }) => { ... } });
   await jobs.enqueue("send-invoice", { invoiceId });
   ```
   Cloudflare Queues on the Cloudflare stack; QStash or Inngest on Vercel. Include retries, a dead-letter queue and a "Jobs" page in the dashboard.
2. **Durable workflows** via Cloudflare Workflows, for multi-step processes such as onboarding or invoice dunning.
3. **Cron in code:** `defineSchedule("0 3 * * *", job)` that writes `wrangler.jsonc` triggers or `vercel.json` crons.
4. **Webhooks in and out:** signed outgoing events per resource, plus `defineWebhook` for incoming ones with verification helpers (Stripe already does this internally).
5. **Drafts, versioning and history:** `versioned: true` keeps snapshots, with a diff view and one-click restore in the dashboard.
6. **More relationship types:** many-to-many with attributes on the join, polymorphic `belongsTo`, self-relations shown as trees (categories, org charts).
7. **Computed and aggregate fields stored in the database:** `orderCount: field.count("Order")`, kept up to date on write.
8. **Full-text search:** D1 FTS5 virtual tables generated from `searchable: true`; ranked `tsvector` on Postgres.
9. **Postgres on Cloudflare via Hyperdrive:** a third combination for teams that want Workers plus Postgres.
10. **Database backups and restore:** `flare db:backup` and `flare db:restore --at 2026-10-30T10:00` using D1 Time Travel or Neon branching.
11. **Preview databases per branch:** Neon branches or D1 preview databases, wired into `flare deploy --preview`.
12. **Import connectors:** import from Airtable, Google Sheets, Notion or an existing Postgres database, and **infer the descriptor from an existing table** (`flare introspect`). That's a strong adoption path for teams with existing data.
13. **GraphQL or tRPC output** as an optional generator, for teams that don't want REST.
14. **A typed SDK package:** `flare sdk publish` builds the typed client as an npm package for mobile (React Native or Expo) and third-party clients.

### 6.4 Dashboard and admin

1. **Customisation slots** (also the plugin surface): custom table cells, record tabs, form sections, row and bulk actions, and dashboard widgets, without forking `ResourceTable`.
2. **Custom actions on resources:**
   ```ts
   actions: {
     markPaid: { label: "Mark as paid", roles: ["admin"], bulk: true,
                 run: async (rows, ctx) => ... }
   }
   ```
   Each action gets its own API endpoint, policy check, button and audit entry.
3. **Kanban, calendar and gallery views** next to the table, chosen per resource (`views: ["table", "kanban:status", "calendar:dueDate"]`).
4. **Inline editing** in tables, plus keyboard shortcuts.
5. **Dashboard builder:** charts and KPI cards defined in code (`defineWidget`) or arranged in the UI.
6. **Global command palette** (`cmdk` is already a dependency) that searches across all resources.
7. **A public "portal" generator:** customer-facing pages (list "my invoices", view one, pay) generated from the same descriptor with `own` applied. Most apps need an admin side *and* a customer side.
8. **Visible audit log and history** on every record page.
9. **Mobile-friendly admin**, or an installable PWA, for teams who manage operations from a phone.

### 6.5 Developer experience

1. **`flare doctor`:** checks Node and pnpm versions, missing environment variables and bindings, unapplied migrations, descriptor drift, resources without policies, and outdated templates.
2. **`flare upgrade` with codemods** that write data migrations for breaking changes like the 0.10 money change.
3. **Flare Studio:** a local GUI (`flare studio`) to design resources visually, view relationships as a diagram, browse data and run seeds. It would also make a good demo for marketing.
4. **A VS Code extension:** autocomplete for field grammar strings, descriptor validation, "go to generated files", and highlighting of generated blocks.
5. **Generated tests:** `gen resource` could also write a Vitest file covering the CRUD contract and policies, with a `createTestApp()` helper using a temporary D1 or Postgres database.
6. **Generated end-to-end tests:** a Playwright spec per resource (create, edit, delete in the dashboard).
7. **`flare explain <file>`:** says who owns a file, whether it's regenerated, and which command produced it.
8. **A `--minimal` preset** without billing, security, themes or the cost estimator, for quicker evaluation.
9. **Descriptor-level migrations for renames:** `rename: { from: "fullName" }`, so renaming a field doesn't get generated as drop-and-add and lose data.
10. **Observability:** OpenTelemetry tracing for each store call, optional Sentry, and slow-query logging in development.
11. **Environment management:** `flare env pull/push`, synced with `wrangler secret` and `vercel env`.
12. **A playground:** a browser demo (StackBlitz or WebContainers) where people can try `flare gen` without installing anything.

### 6.6 AI-native features

Flare is already ahead here. These would build on that:

1. **`flare mcp`: generate an MCP server from the descriptors.** Each resource gets list, get, create and update tools, enforced by the same policies and API keys. Any agent could then work with a Flare app's data safely. This would be a standout feature with few competitors.
2. **`flare gen resource --from "a CRM with companies, contacts and deals"`:** natural language to descriptors, shown as a preview before any file is written.
3. **AI field types:** `summary: field.ai({ from: ["body"], prompt: "Summarise in one sentence" })`, computed on write with Workers AI or another provider.
4. **Semantic search:** `searchable: { semantic: true }` writes embeddings to Vectorize or pgvector and adds `?q=` semantic ranking.
5. **An "Ask your data" dashboard panel:** natural-language questions turned into safe, policy-restricted store queries, never raw SQL.
6. **AI-assisted CSV import:** maps messy column headers to fields and suggests cleaning.
7. **Agent evals for the skill:** a test suite that checks coding agents can complete common Flare tasks using the skill, run in CI.

### 6.7 Ecosystem and adoption

1. **Templates gallery:** `flare create --template crm|helpdesk|inventory|school|clinic|saas-starter`. The `examples/` folder is a good start; promote it.
2. **Showcase page:** real apps built with Flare.
3. **Community space:** GitHub Discussions or a Discord, "good first issue" labels, and a contributor guide for plugins.
4. **Content:** a 5-minute "zero to deployed CRUD app" video, a comparison page (Flare vs Payload vs Refine vs Wasp vs Supabase plus Next), and launch posts on Hacker News, the Cloudflare community, dev.to and X.
5. **Ask Cloudflare to feature it:** Flare is one of the most complete fullstack options on Workers, D1, R2 and Durable Objects, which suits the Cloudflare Developer Platform blog and templates.
6. **A local-market angle:** first-class mobile money payments, low-cost hosting on the Cloudflare free tier, and tutorials for East African developers would set Flare apart from US-focused frameworks.
7. **Governance:** a public roadmap, an RFC process for breaking changes, and a second maintainer with release rights, to reduce the single-maintainer risk.
8. **Sustainability:** GitHub Sponsors, plus possibly paid plugins, templates or "Flare Cloud" hosting later.

---

## 7. Suggested roadmap to 1.0

| Release | Theme | Contents |
|---|---|---|
| **0.11 — Safe by default** | Trust | Default admin-only policies; invite-only or first-user-admin sign-up; dashboard gated by role; `flare doctor`; `flare audit:security`; one error format; `publish()` warns on Next; filtered `titles()` |
| **0.12 — Tenancy and permissions** | B2B readiness | `tenancy` (orgs, invites, switcher); field-level permissions; conditional rules; custom actions |
| **0.13 — Plugins** | Extensibility | `definePlugin`, `flare add/remove/update`; dashboard slots; move billing, security and apikeys onto the plugin API; directory page |
| **0.14 — Backend depth** | Real apps | Jobs and queues, cron, webhooks, full-text search, versioning |
| **0.15 — AI** | Differentiation | `flare mcp`, AI fields, semantic search, natural-language descriptor generation |
| **1.0** | Stability | Frozen descriptor format and codegen contract; codemods for every breaking change; vinext stable or a supported fallback; docs for every plugin API; LTS policy |

---

## 8. Final verdict

**Why a fullstack developer would love Flare:** it removes weeks of repetitive setup without taking control away. The code is yours, readable and changeable, and the generated API handles edge cases most teams only fix after an incident. For solo developers, agencies and internal tools on Cloudflare, it's one of the most productive options available today.

**Why a fullstack developer would hesitate:** apps are open by default, the default stack runs on a beta runtime, there's no multi-tenancy or plugin model yet, the format can still change before 1.0, and it depends on one maintainer.

None of those problems is in the core idea, and all of them can be fixed. Flare needs **secure defaults, tenancy, plugins and a stability promise**. With those, it becomes a serious choice for teams, not just a very good one for solo builders.
