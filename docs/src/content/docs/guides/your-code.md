---
title: Where your code goes
description: "The seams: logic on the resource, endpoints of your own, computed values, and what regeneration will and won't overwrite."
---

Flare generates a lot, and the generated code is in your repository where you can read
it. Nothing runs by convention behind your back: if something happens on a write, it's
because a file in your app says so, and you can open that file.

This page is the map of the seams — where to put logic, where to change what people see,
and what `flare sync-types` will overwrite if you edit it in the wrong place.

## The short version

| You want to | Put it |
| --- | --- |
| Change what happens on create, update or delete | `hooks` in the resource descriptor |
| Add a value worked out from other fields | `computed` in the descriptor |
| Add an endpoint that isn't CRUD | `flare gen endpoint <Resource> <name>` |
| Decide who may do what | `policies/<resource>.policy.ts` |
| Change how a table, form or page looks | The component under `components/dashboard/` |
| Change a label, a placeholder, help text | The field's options in the descriptor |

## Logic on the resource

Every write goes through one store — the REST API, the dashboard's forms, an import, a
seed. So a hook in the descriptor runs for all of them, and there's one place to read to
know what happens when a record is written.

```ts
// resources/order.resource.ts
import { defineResource, field } from "@flaredev/core";

export default defineResource({
  name: "Order",
  fields: {
    reference: field.string({ unique: true }),
    quantity: field.int(),
    price: field.float(),
    status: field.enum(["draft", "sent", "paid"], { default: "draft" }),
  },
  hooks: {
    async beforeCreate(input, { db, user }) {
      // Return the input, changed or not. Throw to refuse the write.
      return { ...input, reference: input.reference ?? (await nextReference(db)) };
    },
    async afterCreate(order, { user }) {
      await sendReceipt(order, user);
    },
    async beforeUpdate(input, { current }) {
      if (current?.status === "paid") throw new Error("A paid order can't be changed.");
      return input;
    },
    async beforeDelete({ current }) {
      if (current?.status !== "draft") throw new Error("Only a draft order can be deleted.");
    },
  },
});
```

Every hook is handed `db` (Drizzle, bound to this request) and `user` (whoever is signed
in, or `null` when the write came from a seed). `beforeUpdate` and `beforeDelete` also
get `id` and `current`, the record as it is now.

| Hook | When | Returns |
| --- | --- | --- |
| `beforeCreate(input, ctx)` | After validation, before the insert | The input to write |
| `afterCreate(record, ctx)` | After the insert | — |
| `beforeUpdate(input, ctx)` | Before the update; `ctx.current` is the record now | The input to write |
| `afterUpdate(record, ctx)` | After the update; `ctx.previous` is how it was | — |
| `beforeDelete(ctx)` | Before the delete | — |
| `afterDelete(ctx)` | After the delete | — |

Throwing from a `before` hook refuses the write, and the message reaches the caller.

## Values worked out, not stored

```ts
computed: {
  total: (order) => Number(order.quantity) * Number(order.price),
  fullName: (person) => `${person.firstName} ${person.lastName}`.trim(),
},
```

Computed values are added to every record the API and the dashboard return. There's no
column and no migration behind them, so they can't be filtered or sorted on — for that,
store the value in a field and set it in `beforeCreate`.

## An endpoint of your own

```bash
npx flare gen endpoint Order publish --method POST --record
```

That writes `app/api/orders/[id]/publish/route.ts` — an ordinary route handler with the
session check, the policy check and the store already wired:

```ts
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const denied = await authorize({ request, resource: orderResource, action: "update" });
  if (denied) return denied;

  const store = dashboardStore("Order");
  // Your logic here.
}
```

It has no generated block, so it's yours from the moment it exists and
`flare sync-types` will never touch it.

| Flag | |
| --- | --- |
| `--method <verb>` | `GET` (default), `POST`, `PATCH`, `PUT`, `DELETE` |
| `--action <action>` | Which policy action to require; defaults to `read` for `GET`, `update` otherwise |
| `--record` | Put it under one record: `/api/orders/[id]/<name>` |

## What regeneration overwrites

Generated files carry a header and a `// generated:start … // generated:end` block:

- **Inside the block** — rewritten every time the generator runs. `flare sync-types`
  reports it as drift if you've edited it, which is the check doing its job.
- **Outside the block, in the same file** — yours. Imports, helpers, extra exports all
  survive.
- **Files with no block at all** — entirely yours: `lib/`, `components/dashboard/`,
  `policies/`, anything from `gen endpoint`, and every page you write.

```bash
npx flare sync-types --check   # changes nothing; fails if anything is out of sync
```

## Changing the dashboard

Every dashboard component was copied into your app when it was created, not imported
from a package. Changing how a cell renders is an ordinary edit to
`components/dashboard/resource-table.tsx`; the same goes for the form, the record page
and the sidebar. See [the dashboard](/guides/dashboard/) for what each one does.
