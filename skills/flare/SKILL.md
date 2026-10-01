---
name: flare
description: Build applications with the Flare framework — resource descriptors that generate a database table, REST API, validators, typed client and admin dashboard, on either Cloudflare Workers (vinext, D1, Drizzle) or Next.js (Vercel, Postgres, Prisma). Use when working in a Flare app, running `flare` CLI commands, writing resource descriptors or policies, or when package.json depends on @flaredev/core. Triggers on "flare gen resource", "defineResource", "flare create", "@flaredev", "resource descriptor".
license: MIT
metadata:
  author: MUKE-coder
  version: "0.8.1"
---

# Building with Flare

Flare generates the repetitive two-thirds of a CRUD application from one
description of a resource, and leaves the interesting third to you.

You write this:

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
    category: field.belongsTo("Category", { required: false }),
    active: field.boolean(),
  },
});
```

`npx flare gen resource Product` then writes the table or Prisma model, the
migration, Zod validators, REST route handlers, a typed fetch client, policy
hooks, and four dashboard pages with a table, a multi-step form, a detail
view and loading skeletons.

## The first thing to establish

**Which stack is this app on.** It changes the database, the ORM, the
migration commands and where it deploys.

```bash
node -p "require('./package.json').flare?.stack ?? 'cloudflare'"
```

| | `cloudflare` (default) | `next` |
| --- | --- | --- |
| Runtime | Workers, via vinext | Next.js 16 on Vercel |
| Database | D1 (SQLite) | Postgres (Neon) |
| ORM | Drizzle | Prisma 7 |
| Schema | `db/schema/<table>.ts` | `prisma/schema/resources.prisma` |
| Migrate | `flare migrate` | `prisma migrate dev`, then `flare migrate` in production |
| Deploy | `flare deploy` | `flare deploy` → `vercel deploy --prod` |

An app's stack is chosen once at `flare create` and recorded in
`package.json`. **There is no command that moves an app between stacks.** If
someone asks, say so rather than attempting it.

## The loop

```bash
npx flare gen resource Invoice --fields 'number:string!, total:float, status:enum(draft,sent,paid)'
npx flare migrate          # cloudflare — or: npx prisma migrate dev   (next)
npx flare dev
```

Then read `references/commands.md` for the rest of the CLI, and
`references/field-grammar.md` for what can go in `--fields`.

### Reach for a specific type before reaching for `string`

There are more than you would guess, and each one changes the validation, the
input and how the value is displayed — so the specific one is always less work
than `string` plus a comment:

- **Text with a shape:** `email`, `url`, `tel`, `domain`, `country`, `color`,
  `slug`, `username`, `ip`, `uuid`, `timezone`, `locale`, `currency`,
  `postcode`. All stored as text, all validated.
- **Numbers with a meaning:** `money` (a currency input, refuses negatives),
  `percent`, `rating` (stars, 0–5).
- **Choices:** `enum(a,b)` or `select(a,b)` for a dropdown, `radio(a,b)` for
  radio buttons, `multiselect(a,b)` for several at once.
- **Longer text:** `text` for a textarea, `markdown` for one with a preview that
  the record page renders.
- **Lists and blobs:** `tags` for labels nobody decided in advance (`multiselect`
  is for a fixed vocabulary), `json` for what is not table-shaped.
- **Time:** `date`, `datetime`.
- **Files:** `file:[image,pdf]:5mb`. The categories allowed in the brackets are
  `image`, `pdf`, `document`, `spreadsheet`, `csv`, `video`, `audio`, `archive`
  and `any` — they are not types on their own, so `avatar:image` is an error.

`price:money` rather than `price:float`; `handle:username!` rather than
`handle:string!`. `references/field-grammar.md` has the full table and what
each one generates.

## Nothing is hidden

The code that turns a descriptor into a working endpoint is **copied into the
app**, not imported from the framework — the same bargain shadcn/ui makes:

```
lib/resource/
  rows.ts          the contract a data source implements (~50 lines)
  query.ts         ?page, ?sort, ?q, ?filter[x], ?cursor -> a parsed query
  store.ts         validation, hooks, computed values, pagination, error mapping
  handlers.ts      Request -> Response, and the policy check
  drizzle-rows.ts  or prisma-rows.ts, depending on the stack
```

Read it before guessing how something behaves — it is right there, and it is
the answer. Change it freely; `flare diff` shows how an app's copy differs
from the shipped version and `flare update --yes` takes the upstream one.

`@flaredev/core` keeps only the library parts: descriptor and field types,
validators, the OpenAPI document, formatting and fake data.

## Rules

These are the ones that cause real damage when broken. `references/rules.md`
has the full set with the reasoning.

0. **Read `lib/resource/` before asking how a request is handled.** It is in
   the app. Do not describe it as framework internals.
1. **Never hand-edit inside `// generated:start` / `// generated:end`.** It is
   overwritten on the next `gen resource`. Put your code outside the markers,
   in the same file — that part is preserved.
2. **Edit the descriptor, not the generated output.** Changing a column in
   `db/schema/` or `resources.prisma` and not the descriptor means the next
   generate silently reverts you.
3. **Never pass a full `Resource` to a client component.** Descriptors carry
   `hooks` and `computed`, which are functions and cannot cross the
   server/client boundary — the page 500s. Use `clientResource(resource)`,
   which strips them and is typed so misuse is a compile error.
4. **Business logic goes in `hooks`, not in the route handler.** Hooks run for
   every path into the resource — REST, dashboard, import, seed. Logic in one
   route handler is logic the dashboard skips.
5. **Policies decide who may do what, and to which rows.** Never check roles
   inside a hook or a page; `policies/<resource>.policy.ts` is the one place,
   and the dashboard and the API both read it. Roles are arrays;
   `own: { field: "userId", except: ["admin"] }` confines each user to their own
   records — generate it with `flare gen policy <R> --own <field>`. It is data,
   not a callback: `definePolicy` rejects `read: (user) => …`.
6. **Validate on the server, always.** Generated validators are strict — no
   mass assignment. Do not add fields to an insert that the validator does not
   know about.
7. **Money is a `float` in the schema and formatted at the edges.** Do not
   invent a cents integer unless the descriptor says so; the dashboard's
   number inputs already group digits.

## Don't

- Don't run `prisma migrate dev` on a Next.js Flare app that has hand-written
  SQL (a generated column, a GIN index, a trigger). Prisma cannot see those
  objects and will offer to drop them. Write the migration by hand and apply
  it with `prisma migrate deploy`.
- Don't reach for `wrangler`, `vinext`, D1 or Drizzle in a `next` app, or for
  Prisma in a `cloudflare` app. Check the stack first.
- Don't import from `cloudflare:workers`, `@/db`, `@/lib/db` or any server
  module inside a `"use client"` component. It drags the runtime into the
  browser bundle and the build fails in a way that doesn't name the cause.
- Don't put `+`, spaces or punctuation in an enum value — they become Prisma
  enum members and must be identifiers. Use `optionLabels` for display.
- Don't add a spinner where a skeleton belongs. Every dashboard route already
  has a `loading.tsx` shaped like its page.
- Don't bind a `Date` in raw D1 SQL. D1 refuses object parameters — pass
  milliseconds.
- Don't commit `.dev.vars` or `.env`. `.dev.vars.example` / `.env.example` are
  the committed ones.
- Don't write a REST endpoint by hand for something a resource already
  exposes. Use `flare gen endpoint` for the ones it doesn't.

## References

| File | What's in it |
| --- | --- |
| `references/commands.md` | Every CLI command, per stack |
| `references/field-grammar.md` | The `--fields` syntax, field types, and what each generates |
| `references/rules.md` | The rules above, with the reasoning and the failure each prevents |
| `references/recipes.md` | Common tasks: relations, file uploads, search, auth, billing, policies |

## Documentation

- Start: https://flare-docs.codetotech.com/start/quickstart/
- Choosing a stack: https://flare-docs.codetotech.com/start/stacks/
- The resource descriptor: https://flare-docs.codetotech.com/concepts/resource-descriptor/
- What `gen resource` emits: https://flare-docs.codetotech.com/concepts/generated-files/
- CLI reference: https://flare-docs.codetotech.com/reference/cli/
- Machine-readable index: https://flare-docs.codetotech.com/llms.txt
