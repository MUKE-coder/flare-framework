# Rules, and what each one prevents

Every rule here exists because breaking it produced a specific failure.

## The codegen contract

Generated files carry markers:

```ts
// generated:start hash=91e393fbd0db
…
// generated:end
```

Inside is rewritten on every `gen resource`. **Outside is preserved** — that
is where your code goes, in the same file. The hash lets the CLI notice you
edited inside the block and refuse to clobber it without `--force`.

*Prevents:* silently losing work on the next generate.

## The descriptor is the source of truth

If a column should change, change `resources/<name>.resource.ts` and
regenerate. Editing `db/schema/` or `prisma/schema/resources.prisma` directly
works exactly until the next `gen resource`, which reverts it.

*Prevents:* a schema that disagrees with the descriptor, then reverts without
warning.

## `clientResource` at the boundary

A descriptor may carry `hooks` and `computed` — functions. React cannot
serialise a function across the server/client boundary, so passing a whole
`Resource` into a `"use client"` component throws at render.

```ts
import { clientResource } from "@flaredev/core";
<ResourceTable resource={clientResource(product)} />
```

`ClientResource` is typed with `hooks?: never`, so the mistake is a compile
error rather than a 500.

*Prevents:* a dashboard page that works in development and 500s in
production.

## Hooks, not handlers

`beforeCreate`, `afterCreate`, `beforeUpdate`, `beforeDelete` run on every
path into the resource: REST, dashboard forms, CSV import, seeds. Logic put
in a route handler runs for none of the others.

```ts
hooks: {
  beforeCreate: (input) => ({ ...input, slug: slugify(String(input.name)) }),
}
```

*Prevents:* an invariant that holds over the API and not in the dashboard.

## Policies are the only place roles are checked

`policies/<resource>.policy.ts` decides read, create, update and delete. The
dashboard hides what you may not see and the API refuses it, from the same
file.

*Prevents:* an endpoint that forgot a check the UI made.

## Server modules never enter a client component

Importing `@/db`, `@/lib/db`, `cloudflare:workers`, or anything that reaches
them, from a `"use client"` file pulls the server runtime into the browser
bundle. The error names a module deep inside a dependency, not your import.

If a client component needs one value from a server module, put that value in
its own file with no server imports, and import that from both.

*Prevents:* a build failure whose message points nowhere near the cause.

## Raw SQL on D1 takes primitives

D1 refuses object parameters. A `Date` bound into a raw query fails at
runtime; pass `date.getTime()`.

*Prevents:* a query that works against SQLite locally and fails on D1.

## Prisma and objects it cannot see

On the Next.js stack, anything Prisma's schema cannot express — a generated
column, a GIN index, a trigger, a view — is invisible to it, and `prisma
migrate dev` will offer to **drop** it on the next diff.

Write those migrations by hand and apply them with `prisma migrate deploy`.
Every later migration on that table has the same problem, so `--create-only`
and deleting the drop becomes routine.

*Prevents:* losing a full-text index, and the hours of reindexing after.

## Uniqueness errors belong to their field

A unique violation should say "Sku is already taken" under the SKU input, not
"Value is already taken" at the top of the form. The store reads the column
out of the driver's error to do that, which differs between stacks and
between Prisma with and without a driver adapter. If you add a constraint by
hand, name the index `<table>_<column>_key` so it stays readable.

*Prevents:* an error message that doesn't tell the user which field to fix.
