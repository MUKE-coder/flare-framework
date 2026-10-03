You are helping me build a production application with **Flare**, a fullstack
framework. Read this whole brief before writing any code.

## What Flare is

Flare generates the repetitive part of a CRUD application from one description
of a resource. I write a descriptor; `flare gen resource` writes the database
table, the migration, Zod validators, REST route handlers, a typed fetch
client, policy hooks, and four dashboard pages (table, multi-step form, record
detail, loading skeletons).

```ts
// resources/product.resource.ts
import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Product",
  icon: "package",
  group: "Catalogue",
  fields: {
    name: field.string(),
    sku: field.string({ unique: true }),
    price: field.float(),
    image: field.file({ accept: ["image"], required: false }),
    category: field.belongsTo("Category", { required: false }),
    active: field.boolean(),
  },
});
```

That one file is the source of truth. Everything else is derived from it.

## Install the skill first

Before writing code, install the Flare agent skill. It carries the CLI
reference, the field grammar, the rules and common recipes:

```bash
npx skills add MUKE-coder/flare-framework@flare
```

The machine-readable docs index is at
https://flare-docs.codetotech.com/llms.txt — fetch it to find any page.

## Two stacks — establish which one before anything else

```bash
node -p "require('./package.json').flare?.stack ?? 'cloudflare'"
```

**cloudflare** (the default): vinext on Cloudflare Workers, D1 (SQLite),
Drizzle. Schema in `db/schema/<table>.ts`. Migrate with `flare migrate`.
Deploy with `flare deploy`.

**next**: Next.js 16 on Vercel, Postgres (Neon), Prisma 7. Schema in
`prisma/schema/resources.prisma` (generated) plus `prisma/schema/base.prisma`
(yours, never regenerated). Migrate with `prisma migrate dev` locally and
`flare migrate` (= `prisma migrate deploy`) in production. Deploy with
`flare deploy` (= `vercel deploy --prod`). Cache is Upstash Redis. Realtime
does not exist on this stack: `realtimeChannel().publish()` delivers nothing and
warns once per channel. Don't build a feature on it here.

Things that differ in practice, not just on paper:

- Enum fields become real Postgres enum types on `next`, and plain text on
  `cloudflare`. That is why enum values must be identifiers.
- A `date` field is `DateTime @db.Date` under Prisma and text under SQLite, so
  a date-only string works on one and not the other.
- `flare seed:resource` is Cloudflare-only. On `next`, write a seed file with
  `flare seed:make` and run `flare seed`.
- Anything Prisma's schema cannot express — a generated column, a GIN index, a
  trigger — is invisible to it, and `prisma migrate dev` will offer to **drop**
  it. Write those migrations by hand and apply with `prisma migrate deploy`.

The descriptors, validators, policies, REST API and dashboard are identical on
both. The database, the ORM and the host are not. A stack is chosen once at
`flare create` and **cannot be changed afterwards** — do not attempt it.

## Creating and running

```bash
pnpm create flare-framework myapp            # asks which stack
pnpm create flare-framework myapp -- --stack next --yes
cd myapp

npx flare gen resource Product --fields 'name:string, sku:string!, price:float, active:boolean'
npx flare migrate          # cloudflare; on next: npx prisma migrate dev
npx flare seed:make catalogue --resource Product && npx flare seed
npx flare dev              # http://localhost:3000
npx flare user:role me@example.com admin
```

Dependencies install with pnpm whenever it is available — an app is ~340
packages and npm takes minutes where pnpm takes seconds.

## Themes

Six, chosen at `flare create` with `--theme`, switchable later with
`flare theme <name>`. They change the whole look, including which sign-in
screen layout the app uses:

| | |
| --- | --- |
| `default` | Calm and centred, indigo accents |
| `coral` | Warm and rounded, sign-in as a card over the page |
| `amber` | Plain and direct, boxed forms with pill buttons |
| `sky` | Crisp blue, bold headings, social sign-in first |
| `mono` | Black and white on a fine grid |
| `emerald` | Fresh green, sign-in beside a customer quote |

A theme is CSS variables in `app/globals.css` plus `data-theme` on `<html>`.
To change colours, edit the tokens there — not the components, which read
semantic names (`bg-card`, `text-muted-foreground`) rather than raw values.
Dark mode is per theme and automatic.

## The field grammar

```
name:string, email:email!, bio:text?, price:float, active:boolean,
status:enum(draft,published), avatar:file:[image]:5mb?,
category:belongsTo(Category)?, notes:hasMany(Note)
```

`?` = optional. `!` = unique.

**String formats** (all text columns): `email`, `url` (alias `website`), `tel`
(alias `phone`), `domain`, `country`, `color`, `slug`, `username`, `ip`,
`uuid`, `timezone`, `locale`, `currency`, `postcode`.

**Number shorthands:** `money`, `percent`, `rating` — an ordinary float or int
column; the shorthand changes the input and the display.

**File categories:** `image`, `pdf`, `document`, `spreadsheet`, `csv`, `text`,
`video`, `audio`, `archive`, `any`. Size as `:5mb`.

**Relationships.** `belongsTo` is the only real one — a foreign key. `hasMany`
stores nothing, it is a view of the other side. One-to-many: `belongsTo` on
the many side. One-to-one: `belongsTo(X)!`, unique. Many-to-many: **there is
no manyToMany field** — make the join its own resource with two `belongsTo`,
because it nearly always grows columns (quantity, price). For a fixed
vocabulary with no data of its own, use `multiselect`; for labels nobody
decided in advance, `tags`.

**Deleting.** `--soft-delete` on a resource keeps the row and stamps `deletedAt`;
every read hides it and the dashboard grows a Trash view with Restore. Don't
hand-roll a `deleted` boolean and filter it yourself — the store already does it
for every path, and a boolean you filter in one place is a boolean somebody
forgets in another. One thing to know before using it: a deleted row still holds
its unique values.

**Money.** A `money` field is stored in whole minor units and the store converts
at its boundary, so send and read `19.99` — never multiply or divide by 100
yourself, and never read a price expecting cents. More decimal places than the
currency has is a 422 rather than a round, so don't send a computed figure
without fixing its precision first.

**Three kinds worth knowing.** `tags` for a free list of labels. `json` for
what is not table-shaped — a settings blob, a payload — validated as parseable
and nothing more. `markdown` (alias `richtext`) for long text with a
Write/Preview editor, rendered on the record page; it is a `text` column, so
nothing special happens to the data. Don't reach for `json` to hold something
with a known shape: that shape wants fields, or a resource, of its own.

## Nothing is hidden — read the code

The engine that runs every endpoint is copied into the app at `lib/resource/`
(rows, query parsing, the store, the handlers, and one row adapter per
stack — about 800 lines). It is **not** imported from the framework. When you
need to know how pagination, validation or an error code works, open the
file; do not guess and do not call it framework internals.

Change it if it needs changing. `flare diff` shows how the app's copy differs
from the shipped version, `flare update --yes` takes the upstream one, and
neither runs unless asked.

`@flaredev/core` holds only the library parts: descriptor and field types,
validators, the OpenAPI document, formatting helpers, fake data.

## Rules — these cause real damage when broken

1. **Never edit inside `// generated:start` … `// generated:end`.** It is
   overwritten on the next generate. Your code goes *outside* the markers, in
   the same file, and is preserved.
2. **Change the descriptor, never the generated schema.** Editing
   `db/schema/` or `resources.prisma` directly works until the next
   `gen resource` silently reverts it.
3. **Wrap descriptors in `clientResource()` before passing them to a client
   component.** Descriptors carry `hooks` and `computed` — functions, which
   cannot cross the server/client boundary. Without it the page 500s.
4. **Business logic belongs in `hooks`, not in a route handler.** Hooks run
   for every path in: REST, dashboard, CSV import, seeds. A handler runs for
   one.
5. **Permissions live in `policies/<resource>.policy.ts` and nowhere else.**
   The dashboard and the API both read it. Never check a role in a hook or a
   page. A policy is two separate things: `read`/`create`/`update`/`delete` are
   arrays of role names, and `own: { field: "userId", except: ["admin"] }`
   confines each user to their own rows — lists, counts, reads, writes and the
   dashboard alike. Use `--own` for "users see only their own records" rather
   than filtering by hand:

   ```bash
   flare gen policy Order --roles '*' --own userId --own-except staff
   ```

   Policies are data, not functions. `definePolicy` rejects a callback, so
   never write `read: (user) => …`.

   For a client with no browser — a cron job, a script, a mobile app — run
   `flare gen apikeys` rather than inventing a token. A key *is* the user who
   created it: same role, and with `own`, the same rows. There are no per-key
   permissions, so do not try to configure one.
6. **Never import a server module into a `"use client"` file** — `@/db`,
   `@/lib/db`, `cloudflare:workers`, or anything reaching them. The build
   fails with a message that points nowhere near the cause.
7. **Read `lib/resource/` rather than guessing.** It is the app's own code
   and it is the authority on what a request does.
8. **Skeletons, not spinners.** Every dashboard route already has a
   `loading.tsx` shaped like its page. Match that pattern.

## Don't

- Don't use wrangler, D1 or Drizzle in a `next` app, or Prisma in a
  `cloudflare` app. Check the stack first.
- Don't run `prisma migrate dev` on a Next.js app with hand-written SQL (a
  generated column, a GIN index, a trigger). Prisma cannot see those objects
  and will offer to drop them. Write the migration by hand, apply with
  `prisma migrate deploy`.
- Don't bind a `Date` into raw D1 SQL — D1 refuses object parameters. Pass
  milliseconds.
- Don't commit `.env` or `.dev.vars`. The committed ones are `.env.example`
  and `.dev.vars.example`.
- Don't hand-write a REST endpoint for something a resource already exposes.
  Use `flare gen endpoint <Resource> <name>` for the rest — the resource comes
  first, positionally. There is no `--resource` flag.
- Don't put `+`, spaces or punctuation in an enum value. They become Prisma
  enum members, which must be identifiers. Use `a_pos` and give it a label:
  `field.enum([...], { optionLabels: { a_pos: "A+" } })`.
- Don't pass `fake.date()` straight into a Prisma `date` field. Prisma maps it
  to `DateTime @db.Date` and wants a DateTime; `fake.date()` returns a
  date-only string, which SQLite accepts and Postgres rejects. Wrap it:
  `new Date(fake.date())`.
- Don't assume a seed rolls back. A seed that fails halfway leaves what it
  already wrote, and the next run then fails on a unique constraint that hides
  the real error. Clear the table before re-running.
- Don't invent a cents integer for money unless asked. `float` plus the
  dashboard's digit grouping is the default.

## Do

- Run `npx flare gen resource --help` when unsure of the grammar.
- Put shared logic in `lib/`, and keep anything a client component imports
  free of server imports.
- Use `flare gen policy` before exposing anything sensitive.
- Read https://flare-docs.codetotech.com/concepts/codegen-contract/ before
  editing any generated file.

## Documentation

- Quickstart: https://flare-docs.codetotech.com/start/quickstart/
- Choosing a stack: https://flare-docs.codetotech.com/start/stacks/
- Resource descriptor: https://flare-docs.codetotech.com/concepts/resource-descriptor/
- Field grammar: https://flare-docs.codetotech.com/concepts/field-grammar/
- What gen resource emits: https://flare-docs.codetotech.com/concepts/generated-files/
- Codegen contract: https://flare-docs.codetotech.com/concepts/codegen-contract/
- Roles and policies: https://flare-docs.codetotech.com/guides/roles-and-policies/
- Authentication: https://flare-docs.codetotech.com/guides/auth/
- File storage: https://flare-docs.codetotech.com/guides/storage/
- Migrations and seeds: https://flare-docs.codetotech.com/guides/migrations-and-seeds/
- The dashboard: https://flare-docs.codetotech.com/guides/dashboard/
- Deploying to Cloudflare: https://flare-docs.codetotech.com/guides/deployment/
- Deploying to Vercel: https://flare-docs.codetotech.com/guides/vercel-deployment/
- What it costs: https://flare-docs.codetotech.com/guides/costs/
- CLI reference: https://flare-docs.codetotech.com/reference/cli/
- Tutorial, Cloudflare: https://flare-docs.codetotech.com/tutorials/shop/
- Tutorial, Next.js: https://flare-docs.codetotech.com/tutorials/next-shop/
- Architecture: https://flare-docs.codetotech.com/concepts/architecture/
- Every file in an app: https://flare-docs.codetotech.com/concepts/file-structure/
- API routes, handlers and CORS: https://flare-docs.codetotech.com/guides/api-routes/
- CRUD end to end: https://flare-docs.codetotech.com/guides/crud-example/
- Philosophy: https://flare-docs.codetotech.com/about/philosophy/
- Who it is for: https://flare-docs.codetotech.com/about/who-its-for/
- Full index for machines: https://flare-docs.codetotech.com/llms.txt

## What I want you to build

<!-- Describe your app here: what it does, who uses it, and the main things
     it stores. Name the stack if you have a preference. -->
