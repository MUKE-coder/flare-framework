# Flare — Project Description

> Name: **Flare**. CLI binary is `flare` (`flare create`, `flare gen resource`,
> `flare deploy`, etc.).

## The dream

Building a fullstack CRUD app on Cloudflare today means hand-wiring D1 bindings,
picking an auth library, writing an admin UI from scratch, and gluing together
R2, KV, Durable Objects, and Stripe yourself — every time, for every project.
Rails, Laravel, and Filament solved this decades ago for their ecosystems.
Nobody has solved it for the Cloudflare edge.

**Flare is a batteries-included, generator-driven fullstack framework built on
top of [vinext](https://github.com/cloudflare/vinext)** (Cloudflare's
Next.js-compatible Vite framework). vinext already solves routing, RSC, SSR,
and Workers deployment. Flare's job is everything vinext deliberately leaves
out: auth, database, file storage, mail, realtime, an admin dashboard, billing,
security, observability — and the code generator that stitches them together.

**Elevator pitch:** *Laravel + Filament, for the Cloudflare edge.*

**The test of success:** a developer runs `flare create myapp`, then
`flare gen resource Contact --fields "name:string, email:string"`, then
`flare deploy` — and within five minutes has a live, authenticated CRUD app
on Cloudflare Workers with a working admin dashboard, no hand-written
boilerplate.

## Who this is for

A solo developer or small team who wants Cloudflare's edge performance and
pricing, without wanting to hand-assemble the plumbing every time. They know
React/TypeScript. They don't want to pick an ORM, an auth library, and an
admin UI kit separately and wire them together — they want one coherent,
opinionated stack that gets out of the way once it's running.

## What problem this solves

1. **Fragmented tooling.** D1, R2, Durable Objects, KV, and Workers AI are
   individually excellent, but nothing ties them into one cohesive app
   framework the way Laravel ties MySQL, queues, and mail together.
2. **No admin UI story on the edge.** Filament (Laravel), Django Admin, and
   Payload CMS all give you a working back-office for free. Nothing
   equivalent exists for a Cloudflare-native stack.
3. **Repetitive CRUD scaffolding.** Writing the same schema → validation →
   API → typed client → admin page loop by hand, resource after resource,
   is pure toil that a generator should own.
4. **Realtime, security, and observability are afterthoughts.** Most
   fullstack starters bolt these on late, badly, or not at all. Flare treats
   them as first-class, generated concerns from day one (even if some land
   in v1.1+, see `phases.md`).

## Tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| App framework | [vinext](https://github.com/cloudflare/vinext) | Next.js API surface on Vite, native Cloudflare Workers deploy, `cloudflare:workers` bindings with zero adapter boilerplate |
| Database | Cloudflare D1 (SQLite) | Edge-native, zero ops, generous free tier |
| ORM | Drizzle ORM | Typed, lightweight, first-class D1 driver, schema-as-code |
| Auth | Better Auth | Email/password + OAuth out of the box, D1/Drizzle adapter, plugin system for orgs/2FA later |
| File storage | Cloudflare R2 | S3-compatible, zero egress fees |
| Mail | Resend | Simple fetch-based API, works natively in Workers |
| Realtime | Durable Objects (WebSocket Hibernation API) | The only Cloudflare-native way to do stateful realtime coordination |
| Caching / CDN | Workers KV (data cache) + Workers Cache API (CDN/ISR) | vinext ships pluggable cache adapters for both already |
| Billing | Stripe (Checkout + Billing Portal + subscriptions) | Industry standard, webhook-driven, no custom payment UI needed |
| Security | Cloudflare WAF / Rate Limiting / IP Access Rules APIs + app-layer event logging | Edge-layer protection Cloudflare already offers, surfaced in-app |
| Observability | Workers Analytics Engine + `instrumentation.ts` hooks + a Drizzle query-logging wrapper | N+1 detection, error tracking, latency percentiles, resource consumption |
| Admin UI | Custom, generated (this project) | Filament-style: components read resource metadata at runtime, not hand-authored per screen |
| Styling | Tailwind CSS + shadcn/ui primitives | See `style-guide.md` for the visual language |

## Technical implementation

### Layering

```
┌─────────────────────────────────────────────┐
│  Generated admin dashboard (React, RSC)       │
├─────────────────────────────────────────────┤
│  Generated API layer (route handlers + Zod)   │
├─────────────────────────────────────────────┤
│  Resource descriptors (schema + policy)       │
├─────────────────────────────────────────────┤
│  Drizzle ORM  │ Better Auth │ R2 │ Resend │ DO │
├─────────────────────────────────────────────┤
│  vinext (routing, RSC, SSR, Workers deploy)   │
├─────────────────────────────────────────────┤
│  Cloudflare Workers runtime                   │
└─────────────────────────────────────────────┘
```

### Repository layout

A pnpm workspace:

| Path | Package | Role |
| --- | --- | --- |
| `packages/cli` | `@flare/cli` (bin: `flare`) | Every CLI verb, plus `templates/` for scaffolded apps and generated files |
| `packages/core` | `@flare/core` | Runtime: descriptor types, field grammar parser, Cloudflare/auth/mail/storage helpers, policy checks |
| `packages/admin` | `@flare/admin` | Admin components (added in Phase M2) |
| `examples/*` | — | Apps produced by `flare create`, used to verify each phase's exit criteria |

Helpers that a developer is expected to edit (`lib/storage.ts`, `lib/mail.ts`,
auth config) are copied into the app as source and import shared logic from
`@flare/core`, rather than hidden inside a package. The unscoped `flare` npm
name is taken, so the publish name for the CLI is still open.

Framework packages pin TypeScript 5.9: TypeScript 7 (the native port) has no
stable compiler API yet, which tsup's declaration build needs.

All bindings are accessed the vinext-native way —
`import { env } from "cloudflare:workers"` — inside server components, route
handlers, and server actions. No custom worker entry, no `getPlatformProxy()`,
no adapter layer.

### The resource descriptor (the core abstraction)

Every generated resource (e.g. `Product`) gets a single
`<resource>.resource.ts` descriptor capturing its fields, types, and
validation. Both the API layer and the admin dashboard read this descriptor
**at runtime**, not just at generation time — editing a field's label or
validation rule doesn't require re-running the generator or hand-patching
multiple files. This is the same pattern Filament uses for its resource
classes, and it's the single most important design decision in the project:
get this wrong and every other feature (admin UI, policies, generator) has
to be rebuilt around it later.

### Field type grammar

| Field syntax | Drizzle column | Admin widget |
| --- | --- | --- |
| `string` | `text` | text input |
| `text` | `text` (long) | textarea |
| `int` / `float` | `integer` / `real` | number input |
| `boolean` | `integer` (0/1) | toggle |
| `date` / `datetime` | `text` (ISO) | date picker |
| `enum(a,b,c)` | `text` + check constraint | select |
| `file:[image,pdf,...]` | `text` (R2 key) | file upload widget, MIME-restricted to the bracketed type list |
| `belongsTo(Model)` | FK column | relation picker |
| `hasMany(Model)` | — (inverse relation) | inline table |

### The CLI (short-verb style, `wrangler`-consistent)

`create`, `gen resource`, `gen policy`, `gen migration`, `gen billing`,
`rm resource`, `migrate`, `migrate:rollback`, `seed`, `seed:make`,
`sync-types`, `dev`, `start`, `deploy`, `role:add`, `billing:sync-plans`.
Full command semantics live in `phases.md` under the CLI phase, and were
worked through in detail against a real ecommerce build in the project's
scope doc.

### Codegen overwrite contract

`gen resource` re-writes only files under a `// generated:start` /
`// generated:end` marker block; hand-written code outside that block
survives a re-run. `rm resource` refuses if it detects hand-written code
outside the generated block unless passed `--force`. This rule must be
implemented before the resource generator is considered done — it's what
makes regeneration safe rather than destructive.

### Roles & permissions (medium tier for v1)

Resource-level (not field-level) policies: `gen policy Order --roles admin,staff`
produces a fixed-shape policy file (`read`/`create`/`update`/`delete` arrays
of role names). The admin UI and the API layer both enforce it — policy
checks are never UI-only. Field-level rules and per-record ownership are
explicitly deferred (see `phases.md`).

### Security & observability

Security dashboard: edge-layer Cloudflare WAF/Rate Limiting/IP Access Rules
management via the Cloudflare API, plus an app-layer `SecurityEvent` resource
for signals Cloudflare's edge can't see (login-attempt bursts, checkout
abuse). Observability dashboard: N+1 query detection via a Drizzle
query-logging wrapper, error tracking via vinext's `instrumentation.ts`
hook, and latency/resource-consumption metrics via the Workers Analytics
Engine. Both are generated dashboard pages, not bolt-on services.

## Non-goals for v1

Full RBAC (field-level, per-record ownership), inline `hasMany` dashboard
widgets, a plugin/theming system for the admin UI, and multi-provider realtime
sync (CRDT-style) are all explicitly out of scope for v1. See `phases.md` for
exactly where each lands.
