---
title: "CRUD, end to end: a shop"
description: Six resources, every endpoint, the code behind them and the requests that exercise them — taken from a working app.
---

This is a real shop, built with the commands below and exercised with real
requests. Every response on this page came out of the running app.

## The resources

```bash
npx flare gen resource Category --group Catalogue --icon tag \
  --fields 'name:string!, slug:string!, image:file:[image]:5mb?, description:text?'

npx flare gen resource Product --group Catalogue --icon package \
  --fields 'name:string, slug:string!, sku:string!, price:float, compareAt:float?,
            stock:int, image:file:[image]:5mb?, description:text?,
            tags:multiselect(new,sale,bestseller)?,
            category:belongsTo(Category)?, active:boolean'

npx flare gen resource Customer --group Sales --icon users \
  --fields 'name:string, email:email!, phone:tel?, notes:text?'

npx flare gen resource Order --group Sales --icon receipt \
  --fields 'reference:string!, status:enum(pending,paid,shipped,delivered,refunded),
            total:float, placedOn:datetime, customer:belongsTo(Customer)?, note:text?'

npx flare gen resource OrderItem --group Sales --icon list \
  --fields 'quantity:int, unitPrice:float, order:belongsTo(Order), product:belongsTo(Product)?'

npx flare gen resource Review --group Catalogue --icon star \
  --fields 'rating:int, title:string?, body:text?,
            product:belongsTo(Product), customer:belongsTo(Customer)?, approved:boolean'
```

Then once:

```bash
npx prisma migrate dev --name init    # or `flare migrate` on Cloudflare
```

That is 24 endpoints, 24 dashboard pages, six typed clients and six sets of
validators. Now what they actually do.

## Read: a list

```bash
curl "$API/products?perPage=3&sort=-price"
```

```json
{
  "data": [
    { "id": "aa259bd0", "name": "Oak desk lamp", "sku": "SKU-0037",
      "price": 387.19, "stock": 64, "tags": ["sale"], "active": true }
  ],
  "meta": { "page": 1, "perPage": 3, "total": 40, "exactTotal": true,
            "nextCursor": "WzM4Ny4xOSwiZDM5YmU5ZWQt" }
}
```

The SQL behind it:

```sql
SELECT id, name, slug, sku, price FROM "products"
ORDER BY "products"."price" DESC, "products"."id" DESC
LIMIT 4 OFFSET 0
```

`LIMIT 4` for `perPage=3` — one row past the page is how it knows another page
exists without counting the table.

## Read: searching and filtering

```bash
curl "$API/products?q=lamp&filter[active]=true&perPage=2"
curl "$API/orders?filter[status]=paid&sort=-placedOn"
```

`q` searches every searchable string field of that resource:

```sql
WHERE ("products"."active" = $1
   AND ("products"."name" ILIKE ('%'||$2||'%')
     OR "products"."slug" ILIKE ('%'||$3||'%')
     OR "products"."sku"  ILIKE ('%'||$4||'%')))
```

## Read: paging a big catalogue

Page numbers are fine to begin with. Past a few thousand rows, use the cursor
the previous response handed you:

```bash
curl "$API/products?perPage=25&cursor=WzM4Ny4xOSwiZDM5YmU5ZWQt"
```

```sql
WHERE ("created_at" < $1 OR ("created_at" = $2 AND "id" < $3))
ORDER BY "created_at" DESC, "id" DESC
LIMIT 26
```

The `(sort, id)` pair is compared as one thing, so rows sharing a timestamp
are neither skipped nor repeated — the failure `OFFSET` has when rows are
inserted while someone is paging.

## Create

```bash
curl -X POST "$API/products" \
  -H 'Content-Type: application/json' -H "Origin: $ORIGIN" \
  -d '{"name":"Brass kettle","slug":"brass-kettle","sku":"SKU-0041","price":48.5,"stock":12,"active":true}'
```

```
HTTP/1.1 201 Created
location: /api/products/28d40784-7244-4cb3-b0c7-808754bad21f
```

### When it is wrong

```json
{ "error": "Validation failed.",
  "issues": [{ "path": "price", "message": "Enter a number" }] }
```

`422`, and **no SQL ran** — validation happens before the database is touched.

### When it collides

```json
{ "error": "Sku is already taken.", "field": "sku" }
```

`409`, with `field` naming the column, so a form puts the message under the
right input rather than at the top of the page.

## Update

`PATCH` changes what you send:

```bash
curl -X PATCH "$API/products/$ID" -H 'Content-Type: application/json' \
  -H "Origin: $ORIGIN" -d '{"price":52.00,"stock":9}'
```

`PUT` replaces everything, so an omitted required field is an error. Use it
when you mean "this is the whole record now".

## Delete

```bash
curl -X DELETE "$API/products/$ID" -H "Origin: $ORIGIN"   # 204, empty body
curl "$API/products/$ID"                                   # 404 afterwards
```

## Relations

`OrderItem` belongs to both `Order` and `Product`, so an order's lines come
back with `orderId` and `productId`, and the dashboard renders a child table
on the order's page.

Writing an order and its lines together is one statement:

```ts
await db.order.create({
  data: {
    reference: "ORD-1042",
    status: "paid",
    total: 96.5,
    placedOn: new Date(),
    customerId: customer.id,
    updatedAt: new Date(),
    orderItems: { create: lines.map((line) => ({ ...line, updatedAt: new Date() })) },
  },
});
```

:::note
The back-reference is called `orderItems`, not `items`. Prisma refuses
one-sided relations, so Flare synthesises the other half and names it after
the model. Check `prisma/schema/resources.prisma` if you are unsure what a
relation is called.
:::

## Business rules belong on the resource

"An order's total is the sum of its lines" should not live in a route handler,
because the dashboard, a CSV import and a seed all write orders too. Put it in
the descriptor, where every path runs it:

```ts title="resources/order.resource.ts"
export default defineResource({
  name: "Order",
  fields: { /* generated block */ },

  hooks: {
    beforeCreate: (input) => ({ ...input, reference: input.reference ?? `ORD-${Date.now()}` }),
    afterUpdate: async ({ row, db }) => {
      if (row.status === "refunded") await restock(db, row.id);
    },
  },

  computed: {
    isOverdue: (row) =>
      row.status === "pending" && Date.now() - Date.parse(String(row.placedOn)) > 7 * 86_400_000,
  },
});
```

`computed` values appear in API responses and on dashboard pages, and are
never stored.

## Who may do what

```bash
npx flare gen policy Product --roles admin,staff --delete-roles admin
```

```ts title="policies/product.policy.ts"
export default definePolicy({
  resource: "Product",
  // generated:start
  read: ["admin", "staff"],
  create: ["admin", "staff"],
  update: ["admin", "staff"],
  delete: ["admin"],
  // generated:end
});
```

A policy is **roles per action** — plain data, not functions. `"*"` means any
signed-in user. Both the API and the dashboard read this file, so the rule
holds in both.

### "Customers see only their own orders"

Roles alone do not say that: with the policy above, anyone with `staff`
reads every product. Which *rows* a user may see is a second question, and
`own` answers it. An `Order` resource with a field holding the buyer:

```bash
npx flare gen resource Order --fields 'reference:string!, total:money, userId:string'
npx flare gen policy Order --roles customer,staff --own userId --own-except staff
```

A `customer` now lists only their own orders, gets a `404` for anyone
else's, and never sends `userId` — it is filled in from their session. Staff
are exempt and see all of them. The dashboard obeys the same rule, down to
the counts on the stat cards.

[Roles & policies](/guides/roles-and-policies/#per-record-ownership) has the
full behaviour, including what `own` deliberately does not cover.

## Something CRUD does not cover

```bash
npx flare gen endpoint Order refund --method POST --record --action update
```

Writes `app/api/orders/[id]/refund/route.ts` with the session and the policy
check already there and `store` ready to use. The rest is yours, and
regeneration leaves it alone.

## What comes without asking

A sortable, filterable table per resource with CSV import and export and saved
views; a multi-step form in a sheet; a record page with its children; loading
skeletons shaped like each page; an audit log of every write; and an OpenAPI
document at `/api/openapi.json`, rendered at `/api/reference`.

The [shop tutorial](/tutorials/shop/) builds a storefront and a till on top of
all this.
