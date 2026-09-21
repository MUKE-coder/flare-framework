---
title: Migrations & seeds
description: Applying, rolling back, and seeding D1 through Wrangler.
---

## Migrations

```bash
npx flare migrate                 # local (shared with flare dev / flare start)
npx flare migrate --remote        # against the deployed database
```

runs `wrangler d1 migrations apply` under the hood.

D1 has no native down-migration, so Flare implements its own:

```bash
npx flare migrate:rollback                     # undo the last migration, locally
npx flare migrate:rollback --steps 3
npx flare migrate:rollback --remote --yes      # remote rollbacks require --yes
```

Rollback resolves every down script **before touching anything**:

1. A hand-written `migrations/down/<name>.sql` wins, if one exists.
2. Otherwise Flare derives the down from the up SQL: `CREATE TABLE/INDEX/
   VIEW/TRIGGER` → `DROP … IF EXISTS`, renames reversed, `ADD COLUMN` →
   `DROP COLUMN` (unless the column has `REFERENCES`/`UNIQUE`/a primary
   key, which SQLite can't drop).
3. Any other statement — a table rebuild, `UPDATE`/`INSERT`, a `DROP` —
   makes the migration **irreversible**. Rollback refuses, naming the
   blocking statement and the down file you'd need to write by hand.

It prints the plan before running anything. Rolled-back migration files
stay on disk (Rails-style) — edit or delete them, then `flare migrate`
again.

```bash
npx flare gen migration backfill_contact_status
npx flare gen migration add_phone_to_contacts --from-schema
```

`gen migration` scaffolds a blank, numbered migration through
`drizzle-kit --custom` (so it's recorded like a generated one), plus a
comment-only `migrations/down/<file>` template — an unwritten rollback
with no SQL statements makes rollback refuse outright, so a forgotten down
migration can never silently "succeed." `--from-schema` diffs your current
Drizzle tables instead — the step after hand-editing a descriptor and
running `flare sync-types`.

## Seeds

```bash
npx flare seed:make contacts --resource Contact
npx flare seed              # every seed, file-name order
npx flare seed contacts     # just seeds/contacts.seed.ts
```

`seed:make` writes `seeds/<name>.seed.ts` with three example rows when the
name matches a resource (or you pass `--resource`) — one sample value per
field kind, with required relations and files left as `// TODO` lines to
fill in.

```ts
// seeds/contacts.seed.ts
import { defineSeed } from "@flaredev/core";
import { contacts } from "@/db/schema";

export default defineSeed(async ({ db, log }) => {
  await db.insert(contacts).values([
    { name: "Ada Lovelace", email: "ada@example.com" },
    // ...
  ]);
  log("Seeded 1 contact");
});
```

Seeds run in Node against the **local** D1 database through Wrangler's
`getPlatformProxy()`, sharing state with `flare dev`/`flare start`/`flare
migrate`. Remote seeding isn't supported — Wrangler's remote-bindings
proxy isn't reliable enough yet; use
`wrangler d1 execute --remote --file` for one-off production data.

Generated tables default `id` to `crypto.randomUUID()`, so seeds insert
without supplying one. D1 caps bound parameters at 100 per query, so batch
large seed inserts accordingly (a 15-row × 6-column insert is already at
90 parameters).
