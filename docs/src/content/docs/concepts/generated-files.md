---
title: What gen resource emits
description: The full file list behind one flare gen resource command.
---

```bash
npx flare gen resource Contact --fields "name:string, email:string"
```

writes or updates:

| File | Content |
| --- | --- |
| `resources/contact.resource.ts` | The descriptor (inside a generated block) — your source of truth |
| `db/schema/contacts.ts` | The Drizzle table: `id` text PK, one column per stored field, `created_at`/`updated_at`, enum CHECK constraints, belongsTo FK + index |
| `db/schema.ts` | Re-exports every `db/schema/*` table (generated block) |
| `migrations/NNNN_create_contacts.sql` | From the app's own `drizzle-kit generate` |
| `app/api/contacts/route.ts` | `GET` (list) and `POST` (create) |
| `app/api/contacts/[id]/route.ts` | `GET`, `PATCH`, `PUT`, `DELETE` |
| `resources/contact.client.ts` | `contactClient` and the `Contact`/`ContactCreate`/`ContactUpdate` types |
| `resources/contact.validators.ts` | `contactValidators` — Zod, derived from the descriptor at runtime |
| `resources/index.ts` | The registry of every descriptor, for the admin and seeders |
| `lib/api.ts` | Created once, if missing: the `authorize` hook every resource API calls |
| `db/relations.ts` | Drizzle `relations()` for every resource, regenerated on every `gen` |
| `app/admin/<slug>/page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx` | Thin wrappers over `<ResourceTable>` / `<ResourceFormPage>` |

Route files are thin: they call `createResourceHandlers()` from
`@flare/core/server`, which reads the descriptor at runtime. There's no
separate build step to keep the API and the descriptor in sync.

## The REST API, briefly

- **List** — `?page`, `?perPage` (≤100), `?sort=field|-field`, `?q=` (a
  `LIKE` search over searchable fields, with `%`/`_` escaped), and
  `?filter[field]=value` (`null` means `IS NULL`). Sorting and filtering
  are only allowed on fields the descriptor permits — sortable is
  everything except `text`/`file`; filterable defaults to
  `enum`/`boolean`/`belongsTo`. Responses look like
  `{ data, meta: { page, perPage, total, totalPages } }`.
- **Errors** — `400` invalid query/JSON, `401`/`403` from `authorize`,
  `403` on a cross-origin write, `404`, `409` on a unique violation (with
  the offending `field`) or a delete blocked by a reference, `415`
  non-JSON body, `422` validation (with `issues[]`), a missing FK target,
  or a CHECK failure.
- **Security** — `authorize` runs before anything else, always. The
  default `lib/api.ts` just requires a Better Auth session; see
  [roles & policies](/guides/roles-and-policies/) for per-resource rules.
  Every write needs `Content-Type: application/json` and a same-origin
  `Origin` header.

`createResourceHandlers` checks at startup that the table has a column for
every field the descriptor declares, so an edited descriptor with no
matching migration fails loudly instead of silently dropping data.

## Re-running the generator

`gen resource` on an existing resource is an **update**, not a fresh
write — see the [codegen overwrite contract](/concepts/codegen-contract/)
for exactly what that means for hand-written code, and
[`sync-types`](/concepts/sync-types/) for detecting drift between the
descriptor and everything derived from it.
