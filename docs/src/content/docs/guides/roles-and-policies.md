---
title: Roles & policies
description: Resource-level permissions enforced server-side, not just in the UI.
---

Flare's permission model is deliberately medium-tier for v1:
**resource-level**, not field-level, and no per-record ownership — a role
can read/create/update/delete a whole resource or it can't. Both the API
and the admin UI enforce the same policy; there's no UI-only version of
"can't."

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

## Enforcement, on both sides, from one registry

`policies/index.ts` keys every policy by resource name. Both enforcement
paths read it:

- **API** — `authorize()` in `lib/api.ts`, which every generated route
  calls first: `401` with no session, `403` when the role isn't listed
  for that action.
- **Admin UI** — `lib/admin.ts` (`requireAccess`, `adminPermissions`,
  `visibleResources`):
  - the sidebar and `/admin` dashboard list only resources the role can
    read
  - `<ResourceTable>` requires read access, and hides the **New** button
    and row actions the role can't use
  - the create/edit pages require create/update access
  - every server action in `app/admin/actions.ts` re-checks before
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
