---
title: The codegen overwrite contract
description: What survives a re-run of gen resource, and what doesn't.
---

Regenerating code has to be safe, or nobody will hand-edit anything near a
generated file. Flare's rule: **`gen resource` only rewrites the part of a
file inside a `// generated:start` / `// generated:end` marker block.**
Everything else — imports you added, an extra exported handler, a
hand-written helper below the block — survives a re-run byte for byte.

```ts
// app/api/contacts/route.ts
// generated:start hash=3f9a1c2b8e0d
export async function GET(request: Request) { /* ... */ }
export async function POST(request: Request) { /* ... */ }
// generated:end

// Your own addition — untouched by the next `gen resource`.
export async function HEAD() {
  return new Response(null, { status: 200 });
}
```

## Re-running on an existing resource

```bash
npx flare gen resource Contact --fields "name:string, email:string, phone:string?"
```

- If the descriptor's fields block is unchanged since it was generated,
  Flare rewrites it to match the new `--fields` string. If you've hand-edited
  that block since, it refuses — edit the descriptor directly instead,
  or pass `--force`.
- Every derived file is re-rendered from the (possibly updated)
  descriptor. If a column changed, `drizzle-kit` writes an `update_<table>`
  migration.
- Anything outside the fields block in the descriptor (`icon`, `slug`, a
  hand-added `helpText`) is left alone.
- New fields and relations are validated **before anything is written** —
  a failing run leaves the app untouched.
- Hand-edited blocks in *other* generated files are skipped with a
  warning, not an abort. Run `flare sync-types` to see exactly what's
  drifted and why.

## Removing a resource

```bash
npx flare rm resource Tag
```

- **Refuses if another resource still references it** — a `belongsTo`, a
  `hasMany`, or even a pending `hasMany` — even with `--force`. Remove the
  dependent relation first.
- **Refuses if any of its files contain hand-written code** outside their
  generated blocks — the file and the reason are listed, nothing is
  deleted. Pass `--force` to delete anyway. Edits *inside* the
  descriptor's fields block don't count as hand-written; that's how you're
  expected to evolve a resource.
- Once it proceeds: deletes every file it owns (plus emptied
  `app/api/<slug>` folders), re-renders `db/relations.ts`,
  `resources/index.ts`, and `db/schema.ts`, warns if any seed file still
  references the table, and writes a `drop_<table>` migration.

## Why this matters

This is the rule that makes `gen resource` safe to run again and again as
a resource evolves, instead of a one-shot scaffold you immediately start
diverging from. Get it wrong and regeneration becomes something you avoid
— which defeats the point of a generator-driven framework.
