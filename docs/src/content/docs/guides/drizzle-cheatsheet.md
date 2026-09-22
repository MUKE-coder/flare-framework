---
title: Drizzle cheat sheet
description: "Create, read, update and delete with Drizzle ORM on D1, the way a Flare app is set up."
---

Every Flare app talks to D1 through Drizzle. `getDb()` returns a client bound to
the request's `DB` binding, and `@/db/schema` exports every table plus the
relations `flare gen` maintains. Call `getDb()` inside a request: a server
component, a route handler or a server action.

```ts
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, like, lt, not, or, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, contacts, deals, vendors } from "@/db/schema";

const db = getDb();
```

The examples use the demo app's `companies`, `contacts`, `deals` and `vendors`
tables. Every snippet on this page is typechecked against them.

:::note[Generated API or Drizzle?]
The generated REST API and the admin validate input and apply policies. Use
Drizzle directly in your own server code, for queries the API doesn't cover or
work that doesn't come from a user's request. Drizzle doesn't validate or check
roles, so do that yourself before you write.
:::

## Create

```ts
// One row, returning it (id and timestamps are filled in for you)
const [company] = await db.insert(companies).values({ name: "Acme" }).returning();

// Many rows in one statement
await db.insert(contacts).values([
  { name: "Ada", email: "ada@example.com" },
  { name: "Grace", email: "grace@example.com", status: "lead" },
]);

// Upsert on a unique column
await db
  .insert(contacts)
  .values({ name: "Ada", email: "ada@example.com" })
  .onConflictDoUpdate({ target: contacts.email, set: { name: "Ada Lovelace" } });

// Insert unless it already exists
await db.insert(contacts).values({ name: "Ada", email: "ada@example.com" }).onConflictDoNothing();
```

## Read

```ts
// Everything
const all = await db.select().from(contacts);

// One row, or undefined
const one = await db.select().from(contacts).where(eq(contacts.email, "ada@example.com")).get();

// Some columns, sorted, paginated
const page = await db
  .select({ id: contacts.id, name: contacts.name })
  .from(contacts)
  .orderBy(asc(contacts.name))
  .limit(20)
  .offset(40);

// Combine conditions
const open = await db
  .select()
  .from(deals)
  .where(and(gte(deals.amount, 1000), isNull(deals.ownerId)))
  .orderBy(desc(deals.createdAt));

const matches = await db
  .select()
  .from(contacts)
  .where(or(like(contacts.name, "%ada%"), inArray(contacts.status, ["lead", "customer"]), not(eq(contacts.vip, true))));
```

| Condition | Drizzle |
| --- | --- |
| equals / not equals | `eq(col, v)`, `ne(col, v)` |
| greater / less | `gt`, `gte`, `lt`, `lte` |
| in a list | `inArray(col, [...])`, `notInArray` |
| null | `isNull(col)`, `isNotNull(col)` |
| text match | `like(col, "%ada%")` (case-insensitive for ASCII in SQLite) |
| between | `between(col, a, b)` |
| and / or / not | `and(...)`, `or(...)`, `not(...)` |

### Relations

`flare gen` writes `db/relations.ts` for every `belongsTo` and `hasMany`, so the
relational query API works out of the box:

```ts
const withCompany = await db.query.deals.findMany({
  where: (deal, { gt }) => gt(deal.amount, 500),
  with: { company: true, owner: { columns: { name: true, email: true } } },
  orderBy: (deal, { desc }) => [desc(deal.createdAt)],
  limit: 10,
});

const first = await db.query.deals.findFirst({ where: eq(deals.title, "Renewal") });
```

Or join by hand when you want a flat row:

```ts
const rows = await db
  .select({ deal: deals.title, company: companies.name })
  .from(deals)
  .innerJoin(companies, eq(deals.companyId, companies.id));
```

## Count and aggregate

```ts
const total = await db.$count(contacts);
const leads = await db.$count(contacts, eq(contacts.status, "lead"));

const perCompany = await db
  .select({ companyId: deals.companyId, deals: count(), value: sum(deals.amount) })
  .from(deals)
  .groupBy(deals.companyId);
```

## Update

```ts
const [updated] = await db
  .update(contacts)
  .set({ status: "customer" })
  .where(eq(contacts.email, "ada@example.com"))
  .returning();

// Use the current value in the update
await db.update(deals).set({ amount: sql`${deals.amount} * 1.1` }).where(lt(deals.amount, 100));
```

`updatedAt` updates itself: generated tables set it with `$onUpdate`.

## Delete

```ts
await db.delete(contacts).where(eq(contacts.email, "ada@example.com"));

const removed = await db
  .delete(deals)
  .where(gt(deals.createdAt, new Date("2026-01-01")))
  .returning({ id: deals.id });
```

Always pass `.where()`. Without it, `delete` empties the table.

## Several writes at once: `batch`

D1 doesn't support interactive transactions (`BEGIN … COMMIT` across awaits).
Use `db.batch`: the statements run in order, in one round trip, and either all
succeed or none do.

```ts
const [, moved] = await db.batch([
  db.insert(companies).values({ name: "Globex" }),
  db.update(deals).set({ companyId: company!.id }).where(isNull(deals.ownerId)).returning(),
]);
```

## Raw SQL and JSON columns

```ts
// A multiselect field is a JSON array: query inside it with json_each
const hosting = await db
  .select()
  .from(vendors)
  .where(sql`exists (select 1 from json_each(${vendors.services}) where value = ${"hosting"})`);

// Anything else
const rows = await db.all<{ n: number }>(sql`select count(*) as n from ${contacts}`);
```

Values interpolated into `sql\`…\`` are sent as parameters, never pasted into
the query, so they're safe from SQL injection.

## Types

```ts
type Contact = typeof contacts.$inferSelect; // a row as you read it
type NewContact = typeof contacts.$inferInsert; // what insert accepts
```

## How columns map

| Field type | Column | In TypeScript |
| --- | --- | --- |
| `string` and its formats, `text`, `date`, `file` | `text` | `string` |
| `int` | `integer` | `number` |
| `float` | `real` | `number` |
| `boolean` | `integer` (0/1) | `boolean` |
| `datetime` | `text` (ISO 8601) | `string` |
| `enum`, `select`, `radio` | `text` with a CHECK constraint | union of the options |
| `multiselect` | `text` (JSON) | array of the options |
| `belongsTo(X)` | `text` foreign key + index | `string` |
| `createdAt`, `updatedAt` | `integer` (ms) | `Date` |

## Changing the schema

Don't hand-edit generated tables. Change the resource, regenerate, then migrate:

```bash
npx flare gen resource Contact --fields 'name:string, email:email!, phone:tel?'
npx flare migrate
```

For tables of your own, add them outside the generated block in `db/schema.ts`,
then run `npx flare gen migration add_invoices --from-schema` and
`npx flare migrate`. See [Migrations & seeds](/guides/migrations-and-seeds/).
