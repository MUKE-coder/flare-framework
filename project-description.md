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

### Database wiring (as built)

- `wrangler.jsonc` declares the `DB` binding **without a `database_id`**:
  wrangler auto-provisions the D1 database on first deploy and uses a local
  SQLite file in development, so `flare create` needs no Cloudflare login.
- `db/schema.ts` is the single Drizzle schema entry (with a
  `// generated:start` / `// generated:end` block for the generator);
  `db/index.ts` exposes `getDb()`, bound to `env.DB` from `cloudflare:workers`.
- drizzle-kit writes flat SQL files to `migrations/`, which is also the
  binding's `migrations_dir`, so `wrangler d1 migrations apply` runs them
  directly (it ignores drizzle's `meta/` folder).
- Local state must live in one place: the app's `start` script passes
  `--persist-to .wrangler/state`, otherwise `wrangler dev` against the built
  output uses `dist/server/.wrangler` and never sees locally applied migrations.
- D1 has no native down-migrations, so Flare runs its own (below).

### Migrations (as built)

- `flare migrate [--remote] [--env X] [--database BINDING]` runs
  `wrangler d1 migrations apply` (local by default; the local state is shared with
  `flare dev`/`flare start`).
- `flare migrate:rollback [--steps N] [--remote --yes]`:
  1. Reads the last N rows of `d1_migrations`.
  2. Resolves every down script **before** changing anything. A hand-written
     `migrations/down/<name>.sql` wins (wrangler ignores subfolders, so down files
     are never applied as up migrations). Otherwise the down is derived from the
     up SQL: `CREATE TABLE/INDEX/VIEW/TRIGGER` → `DROP … IF EXISTS`, renames
     reversed, `ADD COLUMN` → `DROP COLUMN` (unless it has REFERENCES/UNIQUE/PK,
     which SQLite can't drop), all in reverse order.
  3. Any other statement (table rebuilds, UPDATE/INSERT, DROP) makes the
     migration irreversible. Rollback refuses with the blocking statement and the
     down file to write.
  4. Runs the downs plus `DELETE FROM d1_migrations WHERE name = …` in one
     `wrangler d1 execute --file`.
  5. Prints the plan first. Remote rollbacks require `--yes`.
- Rolled-back migration files stay on disk (Rails-style). Edit or delete them,
  then `flare migrate` again.

### Seeds (as built)

- `flare seed:make <name> [--resource Name]` writes `seeds/<name>.seed.ts`.
  When the name matches a resource (`contacts` → Contact) or `--resource` is
  given, it includes three example rows with a sample value per field kind.
  Required relations and files become `// TODO` lines.
- `flare seed [names...]` runs every seed (file-name order, so prefix names to
  order dependencies) or just the named ones. Each seed is
  `export default defineSeed(async ({ db, env, log }) => …)`: `db` is Drizzle over
  the app's `db/schema.ts`, and imports like `@/db/schema` resolve.
- Seeds run in Node against the **local** D1 database through wrangler's
  `getPlatformProxy()`, using the same `.wrangler/state/v3` as `flare dev`,
  `flare start` and `flare migrate`. The app's own wrangler, drizzle-orm and
  schema are loaded, so versions always match. Remote seeding isn't supported:
  wrangler's remote-bindings proxy failed in testing, so use
  `wrangler d1 execute --remote --file` for production data.
- Generated tables give `id` a `$defaultFn(() => crypto.randomUUID())`, so
  seeds and app code can insert without supplying ids. Timestamps have SQL defaults.

### Auth wiring (as built)

- Better Auth 1.7 with `@better-auth/drizzle-adapter` (sqlite provider) over
  the same `getDb()` client. `lib/auth.ts` is a module-level instance reading
  bindings from `cloudflare:workers`; `app/api/auth/[...all]/route.ts` mounts it.
- **Password hashing is PBKDF2-SHA256 (100k iterations, WebCrypto) from
  `@flare/core`, not Better Auth's default scrypt.** Measured: scrypt ≈ 250–300ms
  CPU per hash in pure JS vs ≈ 45ms for PBKDF2. The scrypt figure is far over the
  Workers free-plan CPU budget. 100k is the maximum PBKDF2 iteration count
  Workers' WebCrypto accepts. The iteration count is stored in each hash.
- The auth tables (`db/auth-schema.ts`) and their first migration
  (`migrations/0000_auth.sql`) ship pre-generated in the template. The
  Better Auth CLI can't load `lib/auth.ts` in Node because it imports
  `cloudflare:workers`, so schema changes from auth plugins mean re-running
  `auth generate` against a Node-safe config.
- Base URL: `BETTER_AUTH_URL` when set (custom domains); otherwise a
  `baseURL.allowedHosts` allowlist of `localhost:*`, `127.0.0.1:*` and
  `<app>.*.workers.dev`, so local dev on any port and a first workers.dev
  deploy work without configuration.
- Secrets: `flare create` writes a random `BETTER_AUTH_SECRET` to `.dev.vars`
  (git-ignored; the vinext build copies it next to the built worker).
  Production needs `wrangler secret put BETTER_AUTH_SECRET`, which `flare deploy`
  should handle.
- Session gating is two layers: `proxy.ts` does an optimistic cookie-only
  redirect (no DB call), and pages/routes call `requireSession()` /
  `getSession()` from `lib/session.ts`, which validate against D1.
  `scripts/e2e-auth.sh <url>` exercises the whole flow.
- OAuth: `flare create --auth-providers google,github` (currently the two
  supported providers) adds a `socialProviders` entry per provider that only
  activates when both `<PROVIDER>_CLIENT_ID` and `_CLIENT_SECRET` are set.
  An app can therefore be scaffolded, run and deployed before credentials exist.
  Empty placeholders go in `.dev.vars` (so `wrangler types` types them), and
  `.dev.vars.example` documents the console link and callback URL
  (`<app URL>/api/auth/callback/<provider>`). Sign-in/up pages render a button
  per *configured* provider.

### Storage wiring (as built)

- `STORAGE` R2 binding (`bucket_name: <app>-storage`). `lib/storage.ts` wraps
  `createStorage()` from `@flare/core`, and `app/api/storage/route.ts` redeems URLs.
- **Signed URLs are Flare-signed, not S3-presigned.** R2 bindings can't
  presign. S3 presigning needs R2 API tokens and bucket CORS, and doesn't work
  against the local simulator. Instead each URL carries an HMAC-SHA256 token
  scoped to one operation (`put`/`get`), one key, an expiry, and for uploads
  the allowed content types (wildcards allowed, like the `file:[image,pdf]`
  grammar) and a max size. The signing key is derived from
  `BETTER_AUTH_SECRET` with a `storage` label. Trade-off: bytes stream through
  the Worker, so uploads are capped by the Workers request body limit. A
  direct-to-R2 presigned backend can be added later behind the same
  `createUploadUrl`/`createReadUrl` API.
- Reads only serve known-safe types inline (raster images, PDF, text,
  audio/video). Everything else, SVG included, is sent as an attachment with a
  `sandbox` CSP, so uploads can't become stored XSS on the app origin.
- Rejected uploads have their body read and discarded (streamed, constant
  memory) before the 4xx is returned. With the body left unread, every other
  request through wrangler's local proxy failed with a 500.

### Mail wiring (as built)

- `lib/mail.ts` exposes `mailer` and `sendTransactionalEmail()`, built on
  `createMailer()` / `renderTransactionalEmail()` from `@flare/core`, which call
  Resend's REST API with `fetch` (no SDK).
- `send` resolves to `{ data, error }` and never throws for API errors (the
  official SDK's contract). 429/5xx and concurrent-idempotency conflicts are
  retried with backoff (honouring `Retry-After`) **only when an
  `idempotencyKey` is supplied**, so retries can't duplicate a delivery.
- With `RESEND_API_KEY` empty (the scaffold default), emails are printed to the
  console instead of sent, so local flows work with no account. `MAIL_FROM` falls
  back to Resend's sandbox sender, which only delivers to the account owner.
- The template is a monochrome, table-based email with escaped content, an
  optional action button (absolute http(s) URLs only) and a matching text part.

### Run commands (as built)

`flare dev|build|start|deploy` resolve the app root (nearest package.json
depending on vinext) and run the app's own installs, forwarding all later
arguments verbatim (including `--help`):

| Flare | Runs |
| --- | --- |
| `flare dev` | `vinext dev` |
| `flare build` | `vinext build` |
| `flare start` | `wrangler dev --config dist/server/wrangler.json --persist-to .wrangler/state` (runs `flare build` first if there is no build). `vinext start` is vinext's Node server, not workerd, so it isn't used. |
| `flare deploy` | `vinext-cloudflare deploy --config dist/server/wrangler.json` (builds, then deploys), wrapped with migrations and secrets (below) |

`flare deploy` around the vinext deploy:

1. For each D1 database in `wrangler.jsonc`: if it exists (`wrangler d1 info`),
   apply remote migrations **before** deploying, and a failure aborts the deploy.
   If wrangler reports it missing (first deploy), the deploy creates it and
   migrations run right after. Any other lookup error aborts.
2. After deploying: if `BETTER_AUTH_SECRET` isn't set on the Worker, generate a
   fresh 32-byte value and upload it through stdin. The local dev secret is never
   reused. Optional variables from `.dev.vars.example` that are still unset are
   listed with their `wrangler secret put` command.
3. `--skip-migrations` / `--skip-secrets` opt out; `--env`/`--preview` are
   forwarded to every wrangler call; `--dry-run`/`--help` touch nothing remote.

Verified against a real account: wrangler auto-provisions D1 and R2 by
`database_name`/`bucket_name` (no IDs in config), `d1 migrations apply --remote`
resolves the database by name and auto-confirms without a TTY, and
`secret put` accepts the value on stdin.

Bins are executed as `node <bin.js>` rather than through a shell, so arguments
survive Windows `.cmd` shims. Scaffolded apps depend on `@flare/cli` and their
`dev`/`build`/`start`/`deploy` scripts call these commands.

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

#### Descriptor format (as built, `@flare/core`)

```ts
// resources/contact.resource.ts
import { defineResource, field } from "@flare/core";

export default defineResource({
  name: "Contact",                 // PascalCase singular
  icon: "users",                   // lucide-react name, for the admin nav
  fields: {
    name: field.string({ maxLength: 120 }),
    email: field.string({ format: "email", unique: true }),
    bio: field.text({ required: false }),
    status: field.enum(["lead", "customer"], { default: "lead" }),
    avatar: field.file(["image"], { required: false }),
    companyId: field.belongsTo("Company", { required: false, onDelete: "set null" }),
    notes: field.hasMany("Note"),
  },
});
```

- **Plain data.** Builders return serializable objects. The API layer,
  validators and admin read them at runtime. Presentation and validation
  options (`label`, `helpText`, `placeholder`, `list`, `sortable`,
  `filterable`, `searchable`, `min`/`max`, `maxLength`, `pattern`, `format`,
  `optionLabels`, `maxBytes`) take effect without regenerating. Storage options
  (kind, `required`, `unique`, `default`, relation targets, `onDelete`) also
  need a migration.
- **Defaults.** Fields are `required: true` unless `required: false`.
  `table` is snake_case plural (`order_items`), `slug` kebab-case plural
  (`order-items`), labels humanized (`companyId` → "Company"). `titleField` is
  the first string field, `defaultSort` is `createdAt desc`, `perPage` 25.
- **Implicit columns.** Every resource gets `id` (text UUID), `createdAt` and
  `updatedAt`. Declaring them is an error.
- **Relations.** `belongsTo` keys must end in `Id` (column `company_id`, FK to
  the target's table). `onDelete` defaults to `restrict`; `set null` requires
  `required: false`. `hasMany` stores nothing: it names the inverse relation
  for Drizzle relations and the admin.
- **Validation.** `defineResource` rejects bad names, reserved or duplicate
  keys, enum defaults outside their options, and unknown `titleField`/`defaultSort`.
  `createValidators(resource)` derives zod `create` (required fields without
  defaults enforced) and `update` (PATCH: all optional) schemas. Both are
  **strict**, so `id`, timestamps and undeclared keys are rejected (no mass
  assignment). Strings are trimmed; required strings must be non-empty; `date` is
  a real calendar date, `datetime` ISO-8601 with offset; `file` values are
  R2 object keys (no traversal).
- **Types.** `typeof contact.$types.create | update | record` give the request
  and JSON response types (enums become literal unions, optional fields
  `| null`). They power the typed client without a separate codegen step.
- **File categories** for `file:[...]`: `image` (png/jpeg/gif/webp/avif; SVG is
  excluded because it can carry script), `pdf`, `video`, `audio`, `text`, `csv`,
  `document`, `spreadsheet`, `archive`. `mimeTypesFor()` expands them for
  `storage.createUploadUrl`.

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

Grammar details (as built): fields are `name:type`, comma-separated (commas
inside `(...)`/`[...]` don't split). Suffix `?` makes a field optional
(nullable) and `!` unique, combinable (`sku:string!?`). Names are camelCased
(`first_name` → `firstName`). `company:belongsTo(Company)` becomes key
`companyId`; an optional belongsTo gets `onDelete: "set null"`. `hasMany` can't
take suffixes. String fields named `email`/`*Email` get `format: "email"`, and
`url`/`website`/`*Url`/`*Website` get `format: "url"`. `file:` requires a category
list (see the descriptor section). Unknown types or categories suggest the
closest match ("did you mean string?"). The generated descriptor is validated
with `defineResource` before it's written.

### What `gen resource` emits (as built)

`flare gen resource Contact --fields "name:string, email:string"`:

| File | Content |
| --- | --- |
| `resources/contact.resource.ts` | The descriptor (fields inside a generated block). The source of truth. |
| `db/schema/contacts.ts` | Drizzle table: `id` text PK, one column per stored field (snake_case), `created_at`/`updated_at` integer ms with SQL defaults, enum `CHECK` constraints, belongsTo FK `references()` + index |
| `db/schema.ts` | Generated block re-exports every `db/schema/*` table (drizzle-kit and `getDb()` read it) |
| `migrations/NNNN_create_contacts.sql` | From the app's `drizzle-kit generate --name create_<table>` |
| `app/api/contacts/route.ts` | `GET` list, `POST` create |
| `app/api/contacts/[id]/route.ts` | `GET` read, `PATCH` partial update, `PUT` full replace, `DELETE` |
| `resources/contact.client.ts` | `contactClient` (typed REST client) and `Contact`/`ContactCreate`/`ContactUpdate` types |
| `resources/contact.validators.ts` | `contactValidators` (zod, derived from the descriptor at runtime) |
| `resources/index.ts` | Registry of all descriptors (`resources` array) for the admin and seeders |
| `lib/api.ts` | Created once if missing: the `authorize` hook every resource API calls |
| `db/relations.ts` | Drizzle `relations()` for every resource, regenerated from all descriptors on each gen |

Relations (as built):
- **Relation map.** `relationGraph(resources)` in `@flare/core` resolves
  `belongsTo` (accessor = key without `Id`) and each declared `hasMany` to the
  target's matching `belongsTo` (`foreignKey` option, default
  `<thisResource>Id`). It's the runtime relation metadata the admin reads.
- **Errors.** A missing belongsTo target, a hasMany whose target lacks the
  back-reference, or a relation name colliding with a field is an error before
  anything is written. A hasMany whose target doesn't exist yet is *pending*
  (noted, then linked when the target is generated).
- **One relations file.** Relations live in `db/relations.ts`, not the table
  modules, so mutually referencing tables never import each other. Both sides
  carry the same `relationName` (`<table>_<fk_column>`), which keeps several FKs
  to one target unambiguous.
- **FK columns.** Each generated FK column is indexed, with `onDelete`
  `restrict` by default (deleting a referenced parent → 409) or `set null` for
  optional grammar relations. Verified on D1: FKs are enforced, `set null`
  clears children, and `db.query.<table>.findMany({ with: … })` works.
- **Regeneration.** Every gen re-renders all table modules (unchanged ones are
  reported as identical), plus the relations file, registry and schema index.

Generated files are thin: route files call `createResourceHandlers()` from
`@flare/core/server`, which reads the descriptor at runtime. `@flare/core` ships
three entry points: `.` (descriptors, validators, helpers), `./server` (handlers,
needs drizzle-orm) and `./client` (typed fetch client, no zod or drizzle).

API behavior:
- **List.** `?page`, `?perPage` (≤100), `?sort=field|-field`, `?q=` (LIKE over
  searchable fields, `%`/`_` escaped) and `?filter[field]=value` (`null` for IS NULL).
  Sorting and filtering are allowed only on fields the descriptor permits
  (sortable: all but text/file; filterable: enum/boolean/belongsTo by default).
  The response is `{ data, meta: { page, perPage, total, totalPages } }`.
- **Errors.** 400 invalid query or JSON; 401/403 from `authorize`; 403
  cross-origin write (Origin ≠ app); 404; 409 unique violation (with `field`)
  or deleting a referenced record; 415 non-JSON body; 422 validation (with
  `issues[]`), missing FK target, or CHECK failure.
- **Security.** `authorize` is required and runs before anything else. The
  default `lib/api.ts` requires a Better Auth session and is M3's policy hook.
  Bodies are validated with strict schemas, and writes need
  `Content-Type: application/json` plus a same-origin `Origin`.
- `createResourceHandlers` checks at startup that the table has a column for
  every descriptor field, so an edited descriptor without a migration fails loudly.

`scripts/e2e-crud.sh <url>` verifies every verb and error path against a running app.

### The CLI (short-verb style, `wrangler`-consistent)

`create`, `gen resource`, `gen policy`, `gen migration`, `gen billing`,
`rm resource`, `migrate`, `migrate:rollback`, `seed`, `seed:make`,
`sync-types`, `dev`, `start`, `deploy`, `role:add`, `billing:sync-plans`.
Full command semantics live in `phases.md` under the CLI phase, and were
worked through in detail against a real ecommerce build in the project's
scope doc.

### sync-types and drift (as built)

`flare sync-types [--check] [--force]` re-renders every derived file (tables,
relations, routes, clients, validators, registry, schema index) from the
descriptors, which remain the source of truth:

- **Checksums.** Tracked blocks carry a checksum in their start marker:
  `// generated:start hash=<12 hex>`, the sha256 of the block content, ignoring
  CRLF and trailing whitespace.
- **Statuses.**
  - `missing`: the file is created.
  - `identical`: nothing to do.
  - `outdated`: the descriptor changed, so the block is rewritten.
  - `untracked`: current content without a checksum yet, which only gets the checksum.
  - `drift`: the block no longer matches its checksum, i.e. it was edited by
    hand. It's skipped and reported (exit 1); `--force` overwrites.
  - `unmarked`: a hand-written file sits at a generated path. It's never
    touched and is reported as a conflict.
- **Orphans.** Files with a `Generated by flare gen resource X` header that the
  current plan no longer produces (resource deleted, or table/slug renamed) are
  reported.
- **Migration hint.** When table *content* changed, it points to generating a
  migration.
- **`--check`.** Changes nothing and exits 1 if anything would change or needs
  attention (CI).
- **Descriptors.** Their fields block is untracked by design: they're meant
  to be edited, and `gen resource` refuses to overwrite an existing one.
- **Formatters.** Reformatting a generated block counts as drift; exclude the
  blocks from formatters or re-run with `--force`.

### Codegen overwrite contract

`gen resource` re-writes only files under a `// generated:start` /
`// generated:end` marker block; hand-written code outside that block
survives a re-run. `rm resource` refuses if it detects hand-written code
outside the generated block unless passed `--force`. This rule must be
implemented before the resource generator is considered done — it's what
makes regeneration safe rather than destructive.

As built:
- **Blocks only.** Every generated file has exactly one
  `// generated:start hash=…` / `// generated:end` block. Writers replace only
  that block, keeping its indentation. Text before and after it (imports,
  extra exports, hand-written handlers) is preserved byte for byte.
- **Re-running on an existing resource is an update.**
  - `gen resource Contact --fields "…"` replaces the descriptor's fields block,
    but only if it's unchanged since generation. Otherwise it refuses (edit the
    descriptor directly) unless `--force`. Everything else in the descriptor
    (e.g. `icon`, `slug`) is untouched.
  - `gen resource Contact` without `--fields` regenerates from the descriptor as
    it stands.
  - Either way, all derived files are re-rendered and drizzle-kit writes an
    `update_<table>` migration when columns changed.
- **Validation first.** New fields and relations are checked before anything is
  written, so a failed run leaves the app untouched.
- **Drift across the app.** Hand-edited blocks in other files are skipped with a
  warning rather than aborting the run (`flare sync-types` explains them).
- **Verified in the demo.** A hand-written `HEAD` export in
  `app/api/contacts/route.ts` survived re-running
  `gen resource Contact --fields "…, phone:string?"`. The `ALTER TABLE … ADD phone`
  migration applied, and the API served both.

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
