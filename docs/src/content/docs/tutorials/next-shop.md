---
title: "Tutorial: a catalogue on Next.js"
description: Build a Flare app on the Next.js stack with Postgres and Prisma, and add ranked full-text search over a catalogue of 300,000 products.
---

The [shop tutorial](/tutorials/shop/) builds on Cloudflare. This one builds
the same kind of app on the other stack: **Next.js 16, Postgres, Prisma 7**,
deployed to Vercel. Same descriptors, same generated code, same dashboard.

It is deliberately a smaller app, because the interesting part isn't the CRUD
— that is identical on both stacks, and proving it is half the point. The
interesting part is what you can do once your database is Postgres. So the
last third of this tutorial adds ranked full-text search over a catalogue of
300,000 products, with the numbers measured rather than assumed.

The finished app is
[`examples/next-shop`](https://github.com/MUKE-coder/flare-framework/tree/main/examples/next-shop)
in the repo.

## Before you start

- **Node 20 or newer.**
- **A Postgres database.** [Neon](https://neon.tech) has a free tier and is
  what the stack is tuned for; any Postgres 12+ works, including one in
  Docker. You need a connection string.

Nothing else. No Cloudflare account, no wrangler, no D1.

## 1. Create the app

```bash
npx create-flare-framework next-shop --stack next
cd next-shop
```

`--stack next` is the whole difference. You get a Next.js app with the App
Router, Tailwind v4, shadcn/ui, Better Auth and Prisma wired together, and
the same `resources/`, `policies/` and `app/dashboard/` layout the Cloudflare
stack uses.

Put your connection string in `.env`:

```bash
cp .env.example .env
```

```ini title=".env"
DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
BETTER_AUTH_SECRET="..."   # already generated for you
BETTER_AUTH_URL="http://localhost:3000"
```

## 2. Generate the resources

Three of them. The syntax is the same as on the other stack — `!` means
unique, `?` means optional:

```bash
npx flare gen resource Category --group Catalogue --icon tag \
  --fields 'name:string!, slug:string!, description:text?'

npx flare gen resource Product --group Catalogue --icon package \
  --fields 'name:string, sku:string!, kind:enum(stock,digital), price:float,
            stock:int?, description:text?,
            tags:multiselect(new,sale,clearance)?,
            category:belongsTo(Category)?, active:boolean'

npx flare gen resource Order --group Sales --icon receipt \
  --fields 'reference:string!, customerEmail:email,
            status:enum(pending,paid,shipped,refunded), total:float, note:text?'
```

Each one writes a descriptor, a typed client, validators, route handlers,
policy hooks and three dashboard pages — the same files, in the same places,
as on Cloudflare. What changes is where the table comes from.

### The schema is a folder, and the split matters

Open `prisma/schema/`. There are two files:

```
prisma/schema/
  base.prisma        # yours. never regenerated.
  resources.prisma   # written from your descriptors. overwritten.
```

`base.prisma` holds the generator, the datasource, the seven tables Better
Auth needs, and the two the dashboard uses (`audit_log`, `saved_views`). Edit
it freely.

`resources.prisma` is generated, between markers, and `flare gen resource`
rewrites it. `Product` came out as:

```prisma title="prisma/schema/resources.prisma"
model Product {
  id          String    @id @default(uuid())
  name        String
  sku         String    @unique
  kind        ProductKind
  price       Float
  stock       Int?
  description String?   @db.Text
  categoryId  String?   @map("category_id")
  category    Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  active      Boolean
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@index([createdAt])
  @@map("products")
}
```

Two details worth noticing, because they are the ones that bite when you
write Prisma by hand. Enums became real Postgres enum types rather than
strings. And `Category` gained `products Product[]` even though nothing asked
for it: Prisma refuses a one-sided relation, so the generator synthesises the
other half of every `belongsTo`.

### Apply it

```bash
npx prisma migrate dev --name init
```

That is Prisma's command, not Flare's, and it is the one you want while
building: it diffs the schema, writes the SQL to `prisma/migrations/`, and
applies it. `flare migrate` exists too, and runs `prisma migrate deploy` —
apply what is already written, never invent anything — which is what belongs
in a deploy script.

## 3. Seed a catalogue

```bash
npx flare seed:make catalogue --resource Product
```

That writes `seeds/catalogue.seed.ts` with the rows already filled in from
the descriptor. Edit it into something shaped like a real shop — three
categories, and products that point at them:

```ts title="seeds/catalogue.seed.ts"
import { defineSeed } from "@flaredev/core";

export default defineSeed(async ({ db, insertMany, fake, log }) => {
  await db.category.createMany({
    data: [
      { name: "Workshop", slug: "workshop", description: "Tools and things for a desk.", updatedAt: new Date() },
      { name: "Downloads", slug: "downloads", description: "Licences, kits and source code.", updatedAt: new Date() },
      { name: "Materials", slug: "materials", description: "Timber, steel, canvas.", updatedAt: new Date() },
    ],
  });
  // Annotated because `db` is untyped, and fake.pick infers its element type from it.
  const categories: { id: string }[] = await db.category.findMany();

  await insertMany(
    "product",
    Array.from({ length: 2_000 }, (_, index) => {
      const digital = index % 5 === 0;
      return {
        name: fake.product(digital),
        sku: `${digital ? "DL" : "ST"}-${String(index + 1).padStart(5, "0")}`,
        kind: digital ? "digital" : "stock",
        price: fake.float(5, 900),
        stock: digital ? null : fake.int(0, 200),
        description: fake.paragraph(2),
        tags: fake.some(["new", "sale", "clearance"], 0, 2),
        categoryId: fake.pick(categories).id,
        active: fake.bool(0.9),
        updatedAt: new Date(),
      };
    }),
  );

  log(`stocked 2,000 products across ${categories.length} categories`);
});
```

```bash
npx flare seed
```

`db` here is your app's own Prisma client, and `insertMany` is `createMany`
with the batching handled — so a seed is written the way the rest of the app
talks to the database. `updatedAt` is explicit because `@updatedAt` is a
Prisma-client behaviour and `createMany` skips it.

:::note
`flare seed:resource`, the one-liner that fills a table straight from a
descriptor, is Cloudflare-only: it writes to D1 through wrangler. Seed files
are the Postgres path, and the CLI tells you so if you reach for the other
one.
:::

## 4. Run it

```bash
npm run dev
```

Sign up at `/sign-up`, and `/dashboard` has your three resources: a sortable,
filterable table per resource, a multi-step sheet form for creating and
editing, saved views, an audit log, CSV import and export. None of that is
stack-specific — it is the same components either way.

Make yourself an admin so the policies let you through:

```bash
npx flare user:role you@example.com admin
```

## 5. The part that needs Postgres

Search in the dashboard's tables is `contains`, which becomes `ILIKE
'%term%'`. It is fine, and it reads every row. Postgres can do better, and
doing it properly means a migration Prisma's schema language can't express —
which is worth walking through, because it is the general shape of "I need a
database feature Prisma doesn't model".

### A generated column and an index over it

```bash
npx prisma migrate dev --create-only --name product_search_index
```

`--create-only` writes an empty migration instead of applying one. Fill it
in:

```sql title="prisma/migrations/…_product_search_index/migration.sql"
ALTER TABLE "products"
  ADD COLUMN "search" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX "products_search_idx" ON "products" USING GIN ("search");
```

```bash
npx prisma migrate deploy
```

`STORED` means Postgres maintains the column on every insert and update.
There is no denormalised field to keep in sync, no trigger to write, and no
way for application code to forget. `setweight` records that a hit in the
name matters more than one in the description, which is what makes ranking
mean anything.

Prisma doesn't know the column exists, and doesn't need to: nothing writes to
it, and the query that reads it is raw.

### The query

```ts title="lib/search.ts"
export async function searchProducts(term: string, limit = 20): Promise<Hit[]> {
  const cleaned = term.trim();
  if (!cleaned) return [];
  return prisma.$queryRaw<Hit[]>`
    select id, name, sku, price, kind::text as kind,
           ts_rank("search", plainto_tsquery('english', ${cleaned})) as rank
    from "products"
    where "search" @@ plainto_tsquery('english', ${cleaned})
      and "active" = true
    order by rank desc, "created_at" desc
    limit ${limit}
  `;
}
```

`$queryRaw` is a tagged template, so `${cleaned}` is a bound parameter, not
string interpolation. `plainto_tsquery` takes whatever someone typed —
punctuation, operators, nonsense — and turns it into a query safely. Never
build this with `$queryRawUnsafe` and a concatenated string.

### What it actually buys you

Here is where most write-ups stop, having asserted that the index is faster.
Measured on this app, at 302,000 products, it is more interesting than that:

| Search | Through the GIN index | `ILIKE '%term%'` |
| --- | --- | --- |
| A rare word — "licence", 51 matches | **0.26 ms** | 2.07 ms |
| A common word — "grinder", 30,084 matches | 44 ms | **1.08 ms** |

The second row is not a typo, and it is the one worth understanding. Ranking
means scoring every single match before sorting them, so a term matching a
tenth of the table does a tenth of a table's worth of work. The `ILIKE` scan
with a `LIMIT 20` stops as soon as it has twenty rows and never scores
anything, so on a common word it wins.

At 2,000 rows — the size this tutorial seeds — the two are
indistinguishable: 0.499 ms against 0.502 ms. A sequential scan of 2,000 rows
is nothing.

So the honest summary is not "add an index, it is faster". It is:

- The index stops rare-term searches getting worse as the catalogue grows.
  That is the case that actually degrades, and the one users hit.
- Ranking has a real cost proportional to the number of matches. If you rank,
  and common words matter to you, narrow the candidate set first.
- Below a few tens of thousands of rows, none of this is why your page is
  slow.

One more number, because it reframes the rest: the page itself reports around
**12 ms** for a search the database executes in 0.26 ms. The difference is
the round trip and the driver. Past a certain point, the query is not what
you are waiting for.

### The page

`app/dashboard/search/page.tsx` is an ordinary server component — it awaits
`searchParams`, calls `timedSearch`, and renders the hits with their rank and
the elapsed time. Showing the timing on the page is a habit worth keeping: it
makes a regression visible the day it lands rather than the month someone
complains.

## 6. Deploying

```bash
npm run build
npx vercel deploy --prod
```

Set these as Vercel environment variables:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | Your Neon connection string, pooled |
| `BETTER_AUTH_SECRET` | 32+ random bytes; not the one from your laptop |
| `BETTER_AUTH_URL` | Your production URL |
| `R2_*` | Optional. File uploads — see below |
| `UPSTASH_REDIS_REST_*` | Optional. Rate limits across instances |
| `RESEND_API_KEY`, `MAIL_FROM` | Optional. Without these, email is printed to the console |

Run migrations against production before the first deploy, with
`DATABASE_URL` pointing at it:

```bash
npx flare migrate      # prisma migrate deploy
```

Two notes on the supporting services. File uploads use **R2** rather than
Vercel Blob, because R2 charges nothing for bandwidth out and a catalogue is
mostly bandwidth out — the [cost guide](/guides/costs/) has the arithmetic.
And Neon's free tier suspends an idle database, so the first request after a
quiet spell pays a cold start; that is a plan choice, not something the app
can fix.

## What this stack doesn't do

Realtime is the real gap. On Cloudflare every channel is a Durable Object
with its own storage and open websockets; there is no equivalent here, so
`realtimeChannel().publish()` is a no-op, and the observability page links to
Vercel's dashboard instead of charting your traffic in-app.
[The stacks page](/start/stacks/) has the full list, kept honest.

## Where to go next

- [The shop tutorial](/tutorials/shop/) — the same kind of app on Cloudflare,
  with a till, digital delivery and a storefront.
- [Costs](/guides/costs/) — what either stack costs at real traffic.
- [Choosing a stack](/start/stacks/) — the comparison, including what moves
  between them and what doesn't.
