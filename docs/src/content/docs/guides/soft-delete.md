---
title: Soft delete
description: Keep what you delete — a deletedAt stamp, hidden from every read, with a Trash view that restores.
---

A delete is usually a mistake someone wants back. `softDelete` keeps the row and
hides it instead of removing it.

```bash
npx flare gen resource Ticket --fields 'subject:string!, status:enum(open,closed)' --soft-delete
npx flare migrate
```

```ts title="resources/ticket.resource.ts"
export default defineResource({
  name: "Ticket",
  // A delete stamps deletedAt instead of removing the row; the dashboard grows a Trash view.
  softDelete: true,
  fields: { /* … */ },
});
```

That adds a nullable `deleted_at` column, indexed — every read filters on it, so
it is not an optional index.

## What changes

| | |
| --- | --- |
| `DELETE /api/tickets/<id>` | stamps `deletedAt`, answers `204`. The row stays. |
| `DELETE /api/tickets/<id>?force=true` | removes it for good. |
| `GET /api/tickets` | deleted rows are absent, and absent from `meta.total`. |
| `GET /api/tickets/<id>` | `404` for a deleted one. |
| `?deleted=only` | the trash. `?deleted=all` is both. |
| The dashboard | a **Records / Trash** toggle, and **Restore** and **Delete forever** in the row menu. |
| Deleting twice | `404`, so the first deletion's timestamp survives. |

Nothing else in your app has to know. Hooks, policies, ownership, search, the
CSV export and the relation pickers all read through the store, and the store
leaves deleted rows out.

## The Trash

The view is `?deleted=only` in the URL, like `?page` and `?sort`, so it is
linkable and the back button does what it looks like it does. In it, the row
menu offers **Restore** and **Delete forever** rather than Edit and Delete —
editing a record in the bin is not a thing anybody wants, and Delete there can
only mean one thing.

Restoring needs the **update** permission, not delete: it changes a record.
Both show up in the audit log with which kind of delete it was, because on a
`softDelete` resource "deleted" is two different events with the same name.

## Three things it does not do

**A unique value is still taken.** A deleted row still occupies its unique
index, so an email freed by deleting a user cannot be signed up again until the
row is really gone. This is the one that surprises people. If a value must be
reusable, either empty the trash or make the column non-unique and enforce it
yourself over the live rows.

**Foreign keys still point at it.** A deleted parent keeps its children valid,
which is usually what you wanted — a deleted customer's orders still have a
customer — but it is a decision, not an accident. Children are not cascaded to
the trash with it.

**There is no REST route for restoring.** The dashboard's Restore is a server
action calling `store.restore(id)`. If an API client needs it, that is one
command:

```bash
npx flare gen endpoint Ticket restore --record --method POST --action update
```

and `store.restore(id)` in the handler it writes.

## Uploads

Files are only deleted when the row really goes — on `?force=true` or Delete
forever. A restore that gave a record back with its images missing would be a
worse outcome than keeping the bytes a while longer.

## In your own code

The store is [in your app](/concepts/no-magic/), and so is this:

```ts
await store.delete(id);                     // to the trash
await store.delete(id, { force: true });    // gone
await store.restore(id);                    // back
await store.get(id, { deleted: "only" });   // read one in the trash
await store.list(new URLSearchParams({ deleted: "all" }));
```

`store.restore` answers `404` on a resource without `softDelete` — there is
nothing to restore — rather than pretending it worked.
