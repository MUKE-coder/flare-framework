---
title: "Tutorial: a shop with a till"
description: Build and deploy a shop that sells both boxed goods and downloads, with a point of sale for walk-in customers.
---

A shop where the admin manages the catalogue, sells over the counter, and
hands a customer a download link for anything digital. Two things make it
more than a CRUD app:

- **Two kinds of product.** A *stock* product has a shelf and runs out. A
  *digital* one — source code, an icon pack, a course — doesn't, and comes
  with a file the buyer gets to keep.
- **A till.** Tap products, take cash, hand over a receipt. It has to price
  the sale on the server, move the stock, and never trust the browser.

The finished app is `examples/shop` in the framework repo. Expect about an
hour.

Do the [quickstart](/start/quickstart/) first; this assumes you know what
`gen resource` produces.

## 1. Create the app

```bash
npm create flare-framework@latest shop
cd shop
```

## 2. The catalogue

Two resources. Categories first, because products point at them:

```bash
npx flare gen resource Category --group Catalogue --icon tag \
  --fields 'name:string!, slug:string!, description:text?'
```

Then the product, which carries the whole difference between the two kinds
of thing this shop sells:

```bash
npx flare gen resource Product --group Catalogue --icon package \
  --fields 'name:string, sku:string!, kind:enum(stock,digital), price:float, stock:int?, description:text?, image:file:[image]?, downloadFile:file:[archive,pdf]?, category:belongsTo(Category)?, active:boolean'
```

Three fields are doing the work:

| Field | Why |
| --- | --- |
| `kind` | `stock` or `digital`. Everything else keys off this. |
| `stock:int?` | Optional, because a digital product has no shelf. It stays null. |
| `downloadFile:file:[archive,pdf]?` | The file a digital product *is*. Optional, because a boxed one has none. |

`--group Catalogue` is what puts both under a **Catalogue** heading in the
sidebar; `--icon` takes any [lucide](https://lucide.dev) name.

## 3. Customers and orders

```bash
npx flare gen resource Customer --group Sales --icon users \
  --fields 'name:string, email:string!, phone:string?, notes:text?'

npx flare gen resource Order --group Sales --icon receipt \
  --fields 'reference:string!, customer:belongsTo(Customer)?, channel:enum(online,pos), status:enum(pending,paid,fulfilled,refunded), total:float, paidWith:enum(cash,card,mobile)?, note:text?'

npx flare gen resource OrderItem --group Sales --icon list \
  --fields 'order:belongsTo(Order), product:belongsTo(Product), name:string, quantity:int, unitPrice:float'
```

An order line stores the product's `name` and `unitPrice` as they were at
the time of sale. That looks like duplication and isn't: a price change next
month must not rewrite what someone paid last month.

Apply the migrations and start the app:

```bash
npx flare migrate
npx flare dev
```

Sign up at `/dashboard`. All five resources are in the sidebar under
Catalogue and Sales, each with a table, a form, search, import and export.

## 4. Number the orders

An order is identified by a number, not a name, and the shop issues it — the
caller shouldn't have to supply one. That's a `beforeCreate` hook, and it
runs on every write: the REST API, the dashboard form, a seed, the till.

In `resources/order.resource.ts`, outside the generated block:

```ts
import { count } from "drizzle-orm";
import { orders } from "@/db/schema";

export default defineResource({
  name: "Order",
  // …fields…
  hooks: {
    /** Orders are numbered, not named: SHOP-000001, in the order they were taken. */
    async beforeCreate(input, { db }) {
      if (input.reference) return input;
      const [row] = await db.select({ total: count() }).from(orders);
      return { ...input, reference: `SHOP-${String((row?.total ?? 0) + 1).padStart(6, "0")}` };
    },
  },
});
```

`beforeCreate` runs *before* validation, which is what lets it fill in a
required field the caller couldn't supply. What it returns is still
validated.

## 5. Line totals, without a column

A line's total is its quantity times its price. Storing it invites the two
to disagree, so compute it instead:

```ts
computed: {
  /** What this line costs. Worked out rather than stored, so it can't drift. */
  lineTotal: (item) => Number(item.quantity) * Number(item.unitPrice),
},
```

`lineTotal` now appears on every `OrderItem` the API and the dashboard
return. There is no column and no migration behind it.

## 6. Stock that moves when you sell

Selling a boxed product takes one off the shelf. Selling a download doesn't.
An `afterCreate` hook on `OrderItem` is the one place that can be true for
every way a sale can happen:

```ts
import { eq, sql } from "drizzle-orm";
import { products } from "@/db/schema";

hooks: {
  async afterCreate(item, { db }) {
    const [product] = await db.select().from(products).where(eq(products.id, String(item.productId))).limit(1);
    if (product?.kind !== "stock") return;
    await db
      .update(products)
      .set({ stock: sql`max(0, coalesce(${products.stock}, 0) - ${Number(item.quantity)})` })
      .where(eq(products.id, String(item.productId)));
  },
},
```

The decrement is one SQL statement rather than a read, a subtraction in
JavaScript and a write — two tills selling the last box at the same moment
would otherwise both see "1 left".

## 7. Opening stock

An empty shop is hard to build against. Write a seed:

```bash
npx flare seed:make catalogue
```

Fill `seeds/catalogue.seed.ts` with real names and believable prices. This
is the file you would edit to load your own catalogue on the first deploy:

```ts
import { defineSeed } from "@flaredev/core";
import { categories, products } from "@/db/schema";

export default defineSeed(async ({ db, log }) => {
  const rows = [
    { name: "Workshop", slug: "workshop", description: "Tools and things for a desk." },
    { name: "Downloads", slug: "downloads", description: "Licences, kits and source code." },
  ];
  const saved = await db.insert(categories).values(rows).returning({ id: categories.id, slug: categories.slug });
  const byslug = Object.fromEntries(saved.map((row) => [row.slug, row.id]));

  const catalogue = [
    { sku: "LAMP-01", name: "Brushed steel desk lamp", kind: "stock", price: 89, stock: 24, category: "workshop" },
    { sku: "BOX-05", name: "Recycled storage box", kind: "stock", price: 14, stock: 3, category: "workshop" },
    { sku: "SRC-10", name: "Point-of-sale source code", kind: "digital", price: 149, category: "downloads" },
    { sku: "ICON-11", name: "Workshop icon pack", kind: "digital", price: 29, category: "downloads" },
  ];

  await db.insert(products).values(
    catalogue.map((item) => ({
      sku: item.sku,
      name: item.name,
      kind: item.kind as "stock" | "digital",
      price: item.price,
      // A digital product has no shelf, so it has no stock either.
      stock: item.kind === "stock" ? item.stock : null,
      categoryId: byslug[item.category] ?? null,
      active: true,
    })),
  );

  log(`stocked ${catalogue.length} products in ${rows.length} categories`);
});
```

```bash
npx flare seed catalogue
```

For filling a table to see how it behaves at size rather than stocking a
shop, `flare seed:resource Product 100k` builds rows from the descriptor at
around 50,000 a second.

## 8. The checkout endpoint

The till needs one endpoint of its own. Scaffold it:

```bash
npx flare gen endpoint Order checkout --method POST
```

That writes an ordinary route handler at `app/api/orders/checkout/route.ts`
with the authorization and the store already wired in. The sale goes here —
prices, stock check, order, lines:

```ts
export async function POST(request: Request) {
  const denied = await authorize({ request, resource: orderResource, action: "create" });
  if (denied) return denied;

  const body = await request.json();
  const lines = (body.lines ?? []).filter((line) => line.productId && Number(line.quantity) > 0);
  if (lines.length === 0) return Response.json({ error: "There's nothing in the basket." }, { status: 400 });

  const db = getDb();
  const ids = [...new Set(lines.map((line) => line.productId))];
  const found = await db.select().from(products).where(inArray(products.id, ids));
  const byId = new Map(found.map((product) => [product.id, product]));

  // Everything is checked before anything is written: a basket that can't be sold in
  // full shouldn't leave half an order behind.
  const priced = [];
  for (const line of lines) {
    const product = byId.get(line.productId);
    if (!product) return Response.json({ error: "One of those products no longer exists." }, { status: 400 });
    if (!product.active) return Response.json({ error: `${product.name} isn't for sale.` }, { status: 400 });
    const quantity = Math.floor(Number(line.quantity));
    if (product.kind === "stock" && (product.stock ?? 0) < quantity) {
      return Response.json({ error: `Only ${product.stock ?? 0} of ${product.name} left.` }, { status: 409 });
    }
    priced.push({ product, quantity });
  }

  const total = priced.reduce((sum, line) => sum + line.product.price * line.quantity, 0);

  const order = await dashboardStore("Order").create({
    channel: "pos",
    status: "paid",
    paidWith: body.paidWith ?? "cash",
    total: Math.round(total * 100) / 100,
  });
  if (!order.ok) return Response.json({ error: order.error }, { status: order.status });

  // Each line goes through the store, so the OrderItem hook takes the stock down.
  const items = dashboardStore("OrderItem");
  for (const { product, quantity } of priced) {
    await items.create({
      orderId: String(order.data.id),
      productId: product.id,
      name: product.name,
      quantity,
      unitPrice: product.price,
    });
  }

  return Response.json({ ok: true, order: { reference: order.data.reference, total: order.data.total } });
}
```

Two things to notice.

**Prices come from the database.** The browser sends product ids and
quantities, never money. A till that trusts the price in the request is a
till that can be told a laptop costs a pound.

**Nothing is written until everything is checked.** The loop prices and
validates the whole basket first, so a sale that can't complete doesn't
leave half an order behind.

The same file gets a `GET` for the products the till can sell. It's a thin
wrapper over the generated store, so search and filtering come free:

```ts
export async function GET(request: Request) {
  const denied = await authorize({ request, resource: orderResource, action: "create" });
  if (denied) return denied;

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const params = new URLSearchParams({ perPage: "24", "filter[active]": "true" });
  if (query) params.set("q", query);
  const result = await dashboardStore("Product").list(params);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  return Response.json({
    products: result.data.data.map(({ id, name, sku, kind, price, stock }) => ({ id, name, sku, kind, price, stock })),
  });
}
```

## 9. Selling a download

A digital product is only sold if the buyer gets the file. At the end of
checkout, sign a read URL for each one:

```ts
/** How long a download link from the till stays good. */
const DOWNLOAD_HOURS = 24;

const downloads = await Promise.all(
  priced
    .filter(({ product }) => product.kind === "digital" && product.downloadFile)
    .map(async ({ product }) => ({
      name: product.name,
      url: await storage.createReadUrl({
        key: product.downloadFile as string,
        expiresIn: DOWNLOAD_HOURS * 3600,
        downloadAs: `${product.sku} ${product.name}`.replace(/[^\w .-]/g, "") + ".zip",
      }),
    })),
);
```

The file itself stays private in R2. The only way to it is a link the shop
issued for a sale that was paid for, and the link stops working after a day:
long enough for someone to get home, short enough not to be a back door.
Return `downloads` alongside the order and the till can put them on the
receipt.

To give a product its file, open it in `/dashboard/products` and drop the
file on **Download file**. The dropzone accepts only what the descriptor
said it would — `file:[archive,pdf]` here.

## 10. The till

The counter UI is an ordinary client component: a product grid, a basket,
three payment buttons, a receipt. Copy
[`components/pos/till.tsx`](https://github.com/MUKE-coder/flare-framework/blob/main/examples/shop/components/pos/till.tsx)
from the repo rather than typing 200 lines of JSX. The part that matters is
the sale:

```tsx
const checkout = () =>
  startTransition(async () => {
    const response = await fetch("/api/orders/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paidWith: payment,
        lines: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
      }),
    });
    const body = await response.json();
    if (!response.ok || !body.order) {
      toast.error(body.error ?? "That sale didn't go through.");
      return;
    }
    setReceipt({ reference: body.order.reference, total: body.order.total, downloads: body.downloads ?? [] });
    setLines([]);
    toast.success(`${body.order.reference} · ${money(body.order.total)}`);
    // The shelf just changed, and so did today's takings.
    router.refresh();
  });
```

`router.refresh()` is what makes the stock counts and the day's takings
correct again without a reload: the server components re-render, the client
state stays put.

Give it a page at `app/dashboard/pos/page.tsx`, with the day's numbers above
it:

```tsx
export default async function PosPage() {
  await requireDashboard("/dashboard/pos");
  const { sales, taken } = await today();

  return (
    <>
      <PageHeader
        title="Till"
        description="Sell to whoever is standing in front of you."
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Till" }]}
      />
      <StatCards
        stats={[
          { label: "Sales today", value: sales, icon: ReceiptIcon },
          { label: "Taken today", value: taken.toLocaleString(undefined, { style: "currency", currency: "USD" }), icon: BanknoteIcon },
        ]}
      />
      <Till />
    </>
  );
}
```

`requireDashboard` is the same gate the generated pages use: it redirects
anyone who shouldn't be here, and takes the path to come back to.

Finally, put it in the sidebar. In `lib/dashboard-nav.ts`, outside the
generated block:

```ts
export const dashboardLinks: DashboardLink[] = [
  { label: "Till", href: "/dashboard/pos", icon: "shopping-cart" },
  ...generatedDashboardLinks,
  { label: "API reference", href: "/api/reference", icon: "book" },
];
```

## 11. Sell something

Open `/dashboard/pos`, tap **Recycled storage box** twice, and take the
cash. Then check the work:

- `/dashboard/orders` has `SHOP-000001`, paid, channel `pos`.
- `/dashboard/order-items` has the line, with a `lineTotal` you never stored.
- `/dashboard/products` shows the box down to 1.

Sell the source code and the receipt offers a download button. Follow it and
the file arrives, named after the product, straight from R2.

## 12. Deploy

```bash
npx flare deploy
```

The first deploy provisions the D1 database, applies the migrations, and
generates a production `BETTER_AUTH_SECRET`. Sign up on the live URL and
make yourself an admin:

```bash
npx flare user:role you@example.com admin --remote
```

The shop is live, and empty: seeds run against the local database. Send the
catalogue up:

```bash
npx flare db:push categories products --yes
```

That reads the rows from your local database and writes them to the deployed
one. Nothing local changes, and it only ever writes to the remote. Then
upload each digital product's file through the live dashboard — the file
lives in R2, not the database, so it doesn't travel with the rows.

## What to do next

- **Take orders online.** `POST /api/orders` already exists, generated. A
  storefront is a client for it.
- **Receipts by email.** `lib/mail.ts` is wired to Resend; send one from an
  `afterCreate` hook on `Order`.
- **Refunds.** A `beforeUpdate` hook on `Order` that puts stock back when
  the status becomes `refunded` — the same shape as the hook in step 6.
- **Know who bought.** The `customer` relation on `Order` is optional and
  the till doesn't use it. Add a picker and the field fills in.
