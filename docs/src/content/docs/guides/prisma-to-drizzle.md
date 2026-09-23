---
title: Coming from Prisma
description: "Everything you do with Prisma, and how to do it with Drizzle in a Flare app."
---

Drizzle and Prisma solve the same problem differently. Prisma generates a client
from `schema.prisma`; Drizzle *is* TypeScript: tables are objects you import,
and queries read like the SQL they produce. In a Flare app you rarely write
either by hand, because resources generate the schema. This page maps the
Prisma habits you have to their Drizzle equivalents.

For the full list of queries, keep the [Drizzle cheat sheet](/guides/drizzle-cheatsheet/) open.

## The big differences

| | Prisma | Drizzle in Flare |
| --- | --- | --- |
| Schema | `schema.prisma` | `resources/*.resource.ts`, generated into `db/schema/*.ts` |
| Client | `new PrismaClient()` | `getDb()` from `@/db`, once per request |
| Migrations | `prisma migrate dev` | `flare gen resource …` then `flare migrate` |
| Generated types | `Prisma.UserGetPayload<…>` | `typeof users.$inferSelect` |
| Runtime | Query engine (a separate binary or WASM) | None: plain SQL strings over D1 |
| Transactions | `$transaction(async (tx) => …)` | `db.batch([...])` (D1 has no interactive transactions) |

There's no engine to ship, so there's nothing to fit inside the Workers size
limit and no cold start spent loading it.

## Schema

```prisma
// Prisma
model Contact {
  id        String   @id @default(uuid())
  name      String
  email     String   @unique
  status    Status?
  company   Company? @relation(fields: [companyId], references: [id])
  companyId String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

enum Status {
  lead
  customer
}
```

In Flare you describe the resource once:

```bash
npx flare gen resource Contact --fields 'name:string, email:email!, status:enum(lead,customer)?, company:belongsTo(Company)?'
```

That writes `resources/contact.resource.ts`, and from it the Drizzle table
(`id`, `createdAt` and `updatedAt` included), the migration, validation, the
REST API and admin pages. The generated table is ordinary Drizzle:

```ts
export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  status: text("status", { enum: ["lead", "customer"] }),
  companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
  // createdAt / updatedAt, with $onUpdate for updatedAt
});
```

| Prisma | Flare field | Drizzle column |
| --- | --- | --- |
| `String` | `string`, `text` | `text()` |
| `Int` / `Float` | `int` / `float` | `integer()` / `real()` |
| `Boolean` | `boolean` | `integer({ mode: "boolean" })` |
| `DateTime` | `datetime`, `date` | `text()` holding ISO 8601 |
| `enum` | `enum(a,b)`, `select(…)`, `radio(…)` | `text({ enum: [...] })` + CHECK |
| `String[]` / `Json` | `multiselect(a,b)` | `text({ mode: "json" })` |
| `@unique` | the `!` suffix | `.unique()` |
| optional `?` | the `?` suffix | no `.notNull()` |
| `@relation` | `belongsTo(Model)` / `hasMany(Model)` | foreign key + `relations()` |
| `@default(now())`, `@updatedAt` | automatic | `createdAt` / `updatedAt` with `$onUpdate` |

## Queries side by side

```ts
import { and, count, desc, eq, gt, inArray, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, contacts, deals } from "@/db/schema";

const db = getDb();
```

### findMany / findUnique / findFirst

```ts
// prisma.contact.findMany({ where: { status: "lead" }, orderBy: { createdAt: "desc" }, take: 20, skip: 40 })
await db.select().from(contacts).where(eq(contacts.status, "lead")).orderBy(desc(contacts.createdAt)).limit(20).offset(40);

// prisma.contact.findUnique({ where: { email } })
await db.select().from(contacts).where(eq(contacts.email, email)).get();

// prisma.deal.findFirst({ where: { title: "Renewal" } })
await db.query.deals.findFirst({ where: eq(deals.title, "Renewal") });

// select: { id: true, name: true }
await db.select({ id: contacts.id, name: contacts.name }).from(contacts);
```

### Filters

| Prisma `where` | Drizzle |
| --- | --- |
| `{ email: "a@b.c" }` | `eq(contacts.email, "a@b.c")` |
| `{ amount: { gt: 100 } }` | `gt(deals.amount, 100)` |
| `{ status: { in: ["lead", "customer"] } }` | `inArray(contacts.status, ["lead", "customer"])` |
| `{ name: { contains: "ada" } }` | `like(contacts.name, "%ada%")` |
| `{ name: { startsWith: "A" } }` | `like(contacts.name, "A%")` |
| `{ ownerId: null }` | `isNull(deals.ownerId)` |
| `{ OR: [a, b] }` / `{ AND: [a, b] }` | `or(a, b)` / `and(a, b)` |
| `{ NOT: a }` | `not(a)` |

### include

```ts
// prisma.deal.findMany({ include: { company: true, owner: { select: { name: true } } } })
await db.query.deals.findMany({
  with: { company: true, owner: { columns: { name: true } } },
});
```

`with` works because `flare gen` keeps `db/relations.ts` up to date.

### create / createMany / upsert

```ts
// prisma.contact.create({ data: { name, email } })
const [contact] = await db.insert(contacts).values({ name, email }).returning();

// prisma.contact.createMany({ data: [...] })
await db.insert(contacts).values([{ name: "Ada", email: "ada@example.com" }, { name: "Grace", email: "grace@example.com" }]);

// prisma.contact.upsert({ where: { email }, create: {...}, update: { name } })
await db.insert(contacts).values({ name, email }).onConflictDoUpdate({ target: contacts.email, set: { name } });
```

### update / updateMany / delete

```ts
// prisma.contact.update({ where: { id }, data: { status: "customer" } })
const [updated] = await db.update(contacts).set({ status: "customer" }).where(eq(contacts.id, id)).returning();

// prisma.contact.updateMany({ where: { status: "lead" }, data: { vip: false } })
await db.update(contacts).set({ vip: false }).where(eq(contacts.status, "lead"));

// prisma.contact.delete({ where: { id } })
await db.delete(contacts).where(eq(contacts.id, id));
```

`update` and `delete` without `.where()` touch every row, just like Prisma's
`updateMany({})` and `deleteMany({})`.

### count / aggregate / groupBy

```ts
// prisma.contact.count({ where: { status: "lead" } })
await db.$count(contacts, eq(contacts.status, "lead"));

// prisma.deal.groupBy({ by: ["companyId"], _count: true })
await db.select({ companyId: deals.companyId, total: count() }).from(deals).groupBy(deals.companyId);
```

### $transaction

```ts
// prisma.$transaction([a, b])
await db.batch([
  db.insert(companies).values({ name: "Globex" }),
  db.update(deals).set({ ownerId: null }).where(eq(deals.companyId, oldCompanyId)),
]);
```

A batch is atomic: if any statement fails, none of them apply. What you can't do
on D1 is Prisma's interactive form (`$transaction(async (tx) => …)`) that reads,
decides in JavaScript, then writes. Instead, do the read first and put every
write in one batch. Or push the condition into SQL with `.where()` so the
database decides.

### $queryRaw

```ts
// prisma.$queryRaw`SELECT count(*) FROM contacts`
await db.all<{ n: number }>(sql`select count(*) as n from ${contacts}`);
```

As with Prisma's tagged template, interpolated values are sent as parameters.

## Types

```ts
// Prisma.ContactGetPayload<{}>  →
type Contact = typeof contacts.$inferSelect;
// Prisma.ContactCreateInput  →
type NewContact = typeof contacts.$inferInsert;
```

For API-shaped types (ISO date strings, only the fields the API accepts), the
generated client exports them: `import type { Contact, ContactCreate } from "@/resources/contact.client"`.

## Migrations

| Prisma | Flare |
| --- | --- |
| `prisma migrate dev` | `flare gen resource …` (writes the migration), then `flare migrate` |
| `prisma migrate deploy` | `flare deploy` applies pending migrations before the new code goes live |
| `prisma db push` | `flare gen migration <name> --from-schema`, then `flare migrate` |
| `prisma db seed` | `flare seed` ([Migrations & seeds](/guides/migrations-and-seeds/)) |
| `prisma studio` | the admin dashboard at `/dashboard` |

## Things that trip people up

- **One client per request.** Call `getDb()` inside the handler. Don't store it at
  module level: the D1 binding belongs to the request.
- **Dates.** `createdAt` and `updatedAt` come back as `Date`. `date` and
  `datetime` fields are ISO strings, which is what the API and forms use.
- **No implicit `select *` across relations.** Ask for relations with `with`
  (relational queries) or join them yourself.
- **Validation isn't automatic.** Prisma checks types; the Flare API validates
  with Zod. Writing with Drizzle directly skips both the validators and the
  policies, so validate first:
  `contactValidators.create.parse(input)` from `@/resources/contact.validators`.
