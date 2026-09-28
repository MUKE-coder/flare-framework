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
`prisma/schema/resources.prisma`. Migrate with `prisma migrate dev` locally
and `flare migrate` (= `prisma migrate deploy`) in production. Deploy with
`flare deploy` (= `vercel deploy --prod`).

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

## The field grammar

```
name:string, email:email!, bio:text?, price:float, active:boolean,
status:enum(draft,published), avatar:file:[image]:5mb?,
category:belongsTo(Category)?, notes:hasMany(Note)
```

`?` = optional. `!` = unique. String formats: `email`, `url`, `tel`,
`domain`, `country`, `color`, `slug`. File categories: `image`, `video`,
`audio`, `pdf`, `doc`, `sheet`, `archive`, `any`.

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
5. **Roles are checked in `policies/<resource>.policy.ts` and nowhere else.**
   The dashboard and the API both read it. Never check a role in a hook or a
   page.
6. **Never import a server module into a `"use client"` file** — `@/db`,
   `@/lib/db`, `cloudflare:workers`, or anything reaching them. The build
   fails with a message that points nowhere near the cause.
7. **Skeletons, not spinners.** Every dashboard route already has a
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
  Use `flare gen endpoint` for the rest.
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
- Full index for machines: https://flare-docs.codetotech.com/llms.txt

## What I want you to build

<!-- Describe your app here: what it does, who uses it, and the main things
     it stores. Name the stack if you have a preference. -->
