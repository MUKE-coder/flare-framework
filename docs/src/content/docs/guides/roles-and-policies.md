---
title: Roles & policies
description: Resource-level permissions and per-record ownership, enforced server-side on both the API and the dashboard.
---

A policy answers two questions, and they are separate:

- **Which roles may do this at all?** `read`, `create`, `update` and
  `delete` each name the roles allowed. This is resource-level: a role can
  read every invoice or none.
- **Which rows does "every" mean?** [`own`](#per-record-ownership) confines
  each user to the records that belong to them.

Both are enforced on the API and in the admin UI, from the same file.
There is no UI-only version of "can't". Field-level rules — "staff may edit
a deal but not its value" — are still not part of the model.

## Roles

Roles live in a `role` table created by the initial migration
(`migrations/0000_init.sql`), alongside Better Auth's own tables. That
migration also seeds the two built-in roles, `admin` and `staff`, so you
never add those yourself. `role:add` registers any **additional** role:

```bash
npx flare role:add support
npx flare role:add support --label "Customer support" --remote
```

`flare user:role <email> <role>` refuses a role name the table doesn't
know, so a typo can't quietly produce an account with no access:

```bash
npx flare user:role jane@example.com staff --remote
```

A user's current role is `user.role`, from Better Auth's `admin` plugin —
the same field [session gating](/guides/auth/) already relies on.

## Policies

```bash
npx flare gen policy Deal --roles admin,staff --delete-roles admin
```

writes `policies/deal.policy.ts`:

```ts
export default definePolicy({
  resource: "Deal",
  // generated:start hash=…
  read: ["admin", "staff"],
  create: ["admin", "staff"],
  update: ["admin", "staff"],
  delete: ["admin"],
  // generated:end
});
```

`delete` defaults to just the first `--roles` entry, since delete is
usually the narrowest permission you want to grant. `"*"` in any array
means "any signed-in user." **A resource with no policy file stays open
to any signed-in user** — policies are opt-in per resource, not a default
lockdown.

The roles block follows the same marker rules as every other generated
file (see the
[codegen overwrite contract](/concepts/codegen-contract/)):
re-running with `--roles` rewrites just that block, hand-written code
around it survives, and a hand edit inside it blocks the rewrite until
`--force`. Removing a resource removes its policy with it.

## Per-record ownership

"Users see only their own records" is the first thing most apps need after
roles, and it is a different question from which roles may act. Add it with
`--own`, naming the field that holds the owning user's id:

```bash
npx flare gen resource Invoice --fields 'number:string!, total:money, userId:belongsTo(User)'
npx flare gen policy Invoice --roles staff,admin --own userId --own-except admin
```

```ts
export default definePolicy({
  resource: "Invoice",
  // generated:start hash=…
  read: ["staff", "admin"],
  create: ["staff", "admin"],
  update: ["staff", "admin"],
  delete: ["staff"],
  own: { field: "userId", except: ["admin"] },
  // generated:end
});
```

That is all of it. From then on, for anyone whose role is not in `except`:

| | What happens |
| --- | --- |
| `GET /api/invoices` | only their rows, and the `total` in `meta` counts only those |
| `GET /api/invoices/<someone else's id>` | `404` |
| `POST /api/invoices` | `userId` is filled in from the session; a `userId` in the body is ignored |
| `PATCH` / `PUT` / `DELETE` on another user's row | `404` |
| `PATCH` with a *different* `userId` | `422`, with the field named |
| The dashboard table, its stat cards, the record page | the same rows, the same counts |

`except` is empty unless you say otherwise, so an `admin` is confined like
everyone else until you write `--own-except admin`. There is no `"*"`: a
policy that exempts everybody is the same as having no `own` at all, and
`definePolicy` rejects it rather than letting it read as a restriction that
isn't one.

### Why another user's record is a 404

A `403` tells you the record exists. On a resource confined by ownership
that is usually the thing being withheld — whether an invoice number is
real, whether an email address is registered. So a row that is not yours is
reported as missing, which is also true from where you are standing.

### Where it is enforced

In `lib/resource/store.ts`, which is [in your app](/concepts/no-magic/) and
is the one path both the API and the dashboard go through. The policy
reaches it from the route and from `lib/dashboard.ts`:

```ts
const store = createResourceStore({
  resource: invoiceResource,
  rows: drizzleRows(invoices, getDb),
  currentUser,
  policy: policyFor("Invoice"),
  onChange: revalidateResource,
});
```

A `list` has the owner added to its filters, last, so
`?filter[userId]=someone-else` cannot widen it. A read, update, replace or
delete fetches the row and compares before doing anything. A create sets
the field before validation, so the client never sends it and never has to.

### Two things to know

**A store built without `currentUser` is not confined.** That is how seeds
and scripts write rows on behalf of anybody — they have no session to
scope to. If you build a store by hand in a server action or a job, pass
`currentUser` when you want the restriction and leave it out when you
don't. The choice is visible at the call site rather than hidden.

**`store.titles()` is not confined**, and cannot be: the row adapter
returns an id and a title, not an owner. It exists so a relation picker can
show names for ids a record already points at. If you put a confined
resource behind a relation picker for confined users, filter the ids before
you call it.

### What it is not

Not multi-tenancy. `own` compares one field with the signed-in user's id;
an organisation or team model is a resource of its own, and scoping by it
means a hand-written query today. Not field-level permissions either.

## Enforcement, on both sides, from one registry

`policies/index.ts` keys every policy by resource name. Both enforcement
paths read it:

- **API** — `authorize()` in `lib/api.ts`, which every generated route
  calls first: `401` with no session, `403` when the role isn't listed
  for that action.
- **Admin UI** — `lib/dashboard.ts` (`requireAccess`, `adminPermissions`,
  `visibleResources`):
  - the sidebar and `/dashboard` dashboard list only resources the role can
    read
  - `<ResourceTable>` requires read access, and hides the **New** button
    and row actions the role can't use
  - the create/edit pages require create/update access
  - every server action in `app/dashboard/actions.ts` re-checks before
    touching the store

## Verify it's not UI-only

The only way to trust that a policy is enforced server-side is to call the
API directly as a role that shouldn't be able to. With a policy narrowing
`Deal` updates to `admin`:

```bash
curl -X PATCH https://myapp.workers.dev/api/deals/<id> \
  -H "Cookie: <staff session cookie>" \
  -H "Content-Type: application/json" \
  -d '{"stage":"won"}'
# → 403, even though the button never rendered for staff in the browser
```
