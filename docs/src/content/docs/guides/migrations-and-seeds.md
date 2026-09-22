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

Two ways to fill a table: a command for sample rows, and seed files for data
you control.

```bash
npx flare seed:resource Contact --count 1000   # sample rows, no file needed
npx flare seed:make contacts --resource Contact
npx flare seed              # every seed file, in file-name order
npx flare seed contacts     # just seeds/contacts.seed.ts
```

### Sample rows from a resource

`seed:resource` reads the resource's descriptor and makes rows that fit it:
an `email` field gets an address, a `tel` field an international number, an
enum one of its options, a `belongsTo` the id of a row that already exists.
Field names steer it too, so `city` reads "Kampala" and a `Company.name` is a
company rather than a person.

```bash
npx flare seed:resource Contact --count 1000
npx flare seed:resource Contact 1m               # a million rows
npx flare seed:resource Contact 5k --truncate    # replace what's there
npx flare seed:resource Contact 5k --remote --yes
```

| Flag | |
| --- | --- |
| `--count <rows>` | `1000`, `25k`, `1m`, `1,000,000` (default 25) |
| `--truncate` | Delete the table's rows first |
| `--seed <number>` | Same number, same rows |
| `--remote` | The deployed database, not the local one (needs `--yes`) |

Rows land in batches. Locally that runs about **14,000 rows a second** — a
million rows in a bit over a minute; `--remote` writes one file and hands it to
D1's import, rather than a query per batch.

Timestamps are spread over the past year and ids sort by creation time, so
lists, charts and "newest first" look like an app that's been running a while.

### Seed files

`seed:make` writes `seeds/<name>.seed.ts`, with rows for a resource when the
name matches one (or you pass `--resource`). Required relations and files are
left as `// TODO` lines to fill in.

```ts
// seeds/contacts.seed.ts
import { defineSeed } from "@flaredev/core";
import { contacts } from "@/db/schema";

const COUNT = 50;

export default defineSeed(async ({ insertMany, fake, log }) => {
  const rows = await insertMany(contacts, COUNT, () => ({
    name: fake.fullName(),
    email: fake.email(),
    status: fake.pick(["lead", "customer"]),
  }));
  log(`inserted ${rows} contacts`);
});
```

A seed is handed:

| | |
| --- | --- |
| `db` | Drizzle, over your schema, on the local database |
| `insertMany(table, count, build)` | Many rows at once, batched |
| `fake` | Sample values: `fullName`, `email`, `phone`, `company`, `city`, `country`, `sentence`, `date`, `pick`, `some`, `int`, `bool` |
| `env` | Local bindings and variables (D1, R2, `.dev.vars`) |
| `log` | A line of output |

Use `db.insert(...)` for a handful of rows you've written out, and
`insertMany` for anything larger. They differ by a lot: Drizzle binds every
value as a parameter and D1 allows 100 of those per statement, so 10,000 rows
become thousands of round trips. `insertMany` writes the values into the SQL
instead, which measured about **50× quicker**.

Seeds run in Node against the **local** D1 database through Wrangler's
`getPlatformProxy()`, sharing state with `flare dev`, `flare start` and
`flare migrate`. For the deployed database, use `seed:resource --remote`, or
`wrangler d1 execute --remote --file` for one-off production data.

Generated tables default `id` to `crypto.randomUUID()`, so seeds insert
without supplying one.
