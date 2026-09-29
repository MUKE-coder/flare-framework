---
title: Relationships
description: One-to-many, one-to-one and many-to-many — how to write each, what the schema becomes, and how each one appears in a form.
---

Flare has one relationship primitive, `belongsTo`, and one view of it,
`hasMany`. Every shape is built from those two.

```ts
category: field.belongsTo("Category", { required: false }),   // this row points at one
products: field.hasMany("Product"),                           // the other side of that
```

`belongsTo` is the real thing: a column holding a foreign key. `hasMany`
stores nothing — it is a way of looking at the other table.

## One to many

The common case. A category has many products; a product has one category.

```bash
npx flare gen resource Category --fields 'name:string!, slug:string!'
npx flare gen resource Product  --fields 'name:string, price:money, category:belongsTo(Category)?'
```

Write it on the **many** side. `category:belongsTo(Category)` goes on
`Product`, because the product is what holds the key.

**The schema:**

```ts title="Cloudflare — db/schema/products.ts"
categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
```

```prisma title="Next.js — prisma/schema/resources.prisma"
categoryId String?   @map("category_id")
category   Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
```

Prisma refuses one-sided relations, so the generator adds the other half to
`Category` automatically — named after the model: `products Product[]`.

**In the form:** the product form gets a **searchable picker**. It shows the
target's title field (`name` here, or whatever `titleField` says), searches as
you type, and stores the id. An optional relation gets a "None" entry.

**In the table:** the column shows the category's *name*, not its id, with a
link to it. Flare resolves the titles in one query for the whole page, not one
per row.

**To see the children**, add the view to the other side, outside the generated
block:

```ts title="resources/category.resource.ts"
    // generated:end
    products: field.hasMany("Product"),
```

A category's record page now has a table of its products under the fields.
Nothing is added to the database — `hasMany` is a query.

### What happens on delete

```ts
category: field.belongsTo("Category", { required: false }),                 // set null
category: field.belongsTo("Category"),                                      // cascade
category: field.belongsTo("Category", { required: false, onDelete: "restrict" }),
```

| | |
| --- | --- |
| `set null` | Default when optional. Delete the category; products keep going, uncategorised |
| `cascade` | Default when required. Delete the order; its lines go too |
| `restrict` | Refuse to delete while children exist. The API answers `409` |

Choose deliberately. `cascade` on the wrong relation deletes more than anyone
expected; `restrict` gives a clear error instead.

## One to one

A `belongsTo` with `unique: true`. Each row may claim at most one target.

```bash
npx flare gen resource Profile --fields 'bio:text?, website:website?, user:belongsTo(User)!'
```

The `!` makes the foreign key unique, so two profiles cannot point at the same
user — that is the whole difference between one-to-one and one-to-many.

```prisma
userId String @unique @map("user_id")
user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
```

**In the form:** the same picker. The difference shows up on save — a second
profile for the same user is a `409`:

```json
{ "error": "User is already taken.", "field": "userId" }
```

**Which side holds the key?** The one that is optional. A user can exist
without a profile, so `Profile` holds the key and `User` does not have to know
profiles exist.

## Many to many

There is no `manyToMany` field, and that is deliberate: a join table almost
always grows columns. "Which products are in this order" becomes "how many, at
what price". Make the join a resource of its own.

```bash
npx flare gen resource Order     --fields 'reference:string!, total:money'
npx flare gen resource Product   --fields 'name:string, price:money'
npx flare gen resource OrderItem --fields 'quantity:int, unitPrice:money,
                                           order:belongsTo(Order), product:belongsTo(Product)?'
```

`OrderItem` is the join, and it carries the two things a plain join table
could not: quantity and the price at the time of sale.

Add the views to both sides:

```ts
// resources/order.resource.ts   (outside the generated block)
orderItems: field.hasMany("OrderItem"),

// resources/product.resource.ts
orderItems: field.hasMany("OrderItem"),
```

**In the form:** you do not pick many products on the order form. You add
lines — each with its own quantity and price — on the order's record page,
which is how anyone would describe the job out loud.

**Writing both at once**, in one statement:

```ts
await db.order.create({
  data: {
    reference: "ORD-1042",
    total: 96.5,
    updatedAt: new Date(),
    orderItems: { create: lines.map((line) => ({ ...line, updatedAt: new Date() })) },
  },
});
```

### When the join really has nothing to say

Tags on a post: no quantity, no price, nothing but the pair.

```bash
npx flare gen resource PostTag --fields 'post:belongsTo(Post), tag:belongsTo(Tag)'
```

Then stop the same pair being added twice, outside the generated block:

```prisma title="prisma/schema/base.prisma — or a hand-written migration"
@@unique([postId, tagId])
```

If the tags are a short fixed list and you do not need to query them as rows,
a `multiselect` is simpler and has no join at all:

```ts
tags: field.multiselect(["new", "sale", "clearance"], { required: false }),
```

Use a join resource when tags are data people manage; use `multiselect` when
they are a fixed vocabulary.

## Self-referencing

A category with sub-categories, or an employee with a manager:

```ts
parent: field.belongsTo("Category", { required: false, onDelete: "set null" }),
```

Prisma needs both sides named when a model points at itself. The generator
handles it; the result looks like:

```prisma
parent   Category?  @relation("CategoryParent", fields: [parentId], references: [id])
children Category[] @relation("CategoryParent")
```

:::caution
Nothing stops a cycle — a category whose parent is its own child. If that
matters, check it in a `beforeUpdate` hook, where every path into the resource
runs it.
:::

## Choosing the picker's label

The picker shows the target's `titleField`, which defaults to the first string
field. Set it when that is wrong:

```ts
export default defineResource({
  name: "Invoice",
  titleField: "number",     // not the first string field, which might be a note
  fields: { … },
});
```

## A quick reference

| You want | Write | Where |
| --- | --- | --- |
| One category, many products | `category:belongsTo(Category)?` | On `Product` |
| See a category's products | `products: field.hasMany("Product")` | On `Category` |
| One profile per user | `user:belongsTo(User)!` | On `Profile` |
| Products in many orders | An `OrderItem` resource with two `belongsTo` | Its own resource |
| A fixed set of tags | `tags:multiselect(a,b,c)?` | No relation at all |
| Sub-categories | `parent:belongsTo(Category)?` | On itself |
