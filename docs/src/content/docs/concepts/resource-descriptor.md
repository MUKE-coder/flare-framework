---
title: The resource descriptor
description: The single source of truth every generated file is derived from.
---

Every resource — `Contact`, `Order`, `Deal`, whatever you model — gets one
file: `resources/<name>.resource.ts`. It's plain, serializable data. The
REST API, the admin dashboard, and the CLI all read it **at runtime**, not
just at generation time — editing a label or a validation rule doesn't
require regenerating anything.

```ts
// resources/contact.resource.ts
import { defineResource, field } from "@flare/core";

export default defineResource({
  name: "Contact", // PascalCase singular
  icon: "users", // lucide-react name, for the admin nav
  fields: {
    name: field.string({ maxLength: 120 }),
    email: field.string({ format: "email", unique: true }),
    bio: field.text({ required: false }),
    status: field.enum(["lead", "customer"], { default: "lead" }),
    avatar: field.file(["image"], { required: false }),
    companyId: field.belongsTo("Company", { required: false, onDelete: "set null" }),
    notes: field.hasMany("Note"),
  },
});
```

## Defaults

- Fields are `required: true` unless you set `required: false`.
- `table` is snake_case plural (`order_items`), `slug` kebab-case plural
  (`order-items`), labels humanized (`companyId` → "Company").
- `titleField` defaults to the first string field, `defaultSort` to
  `createdAt desc`, `perPage` to `25`.
- Every resource implicitly gets `id` (a text UUID), `createdAt`, and
  `updatedAt`. Declaring them yourself is an error.

## What takes effect without a migration

Presentation and validation options — `label`, `helpText`, `placeholder`,
`list`, `sortable`, `filterable`, `searchable`, `min`/`max`, `maxLength`,
`pattern`, `format`, `optionLabels`, `maxBytes` — are read at request time,
so changing them is just an edit and a save.

Storage options — the field's kind, `required`, `unique`, `default`,
relation targets, `onDelete` — change the underlying column, so they need
a migration (`npx flare gen resource <Name> --fields "..."` again, or
`flare gen migration --from-schema`).

## Relations

- `belongsTo` keys must end in `Id` (`companyId` → column `company_id`,
  a foreign key to the target's table). `onDelete` defaults to `restrict`;
  `set null` requires `required: false`.
- `hasMany` stores nothing on this resource — it names the inverse
  relation for Drizzle's `relations()` and for the admin's relation picker.

## Validation, up front

`defineResource` rejects bad names, reserved or duplicate keys, enum
defaults outside their declared options, and unknown `titleField`/
`defaultSort` values — before anything is written to disk.

`createValidators(resource)` derives two Zod schemas from the descriptor at
runtime:

- **create** — required fields without defaults are enforced
- **update** — every field is optional (a PATCH semantics schema)

Both are **strict**: `id`, timestamps, and any key the descriptor doesn't
declare are rejected outright, so there's no mass-assignment path through
the generated API. Required strings must be non-empty (and are trimmed);
`date` must be a real calendar date; `datetime` is ISO-8601 with an offset;
`file` values are validated as R2 object keys with no path traversal.

## Types, for free

```ts
type ContactCreate = (typeof contact)["$types"]["create"];
type ContactUpdate = (typeof contact)["$types"]["update"];
type Contact = (typeof contact)["$types"]["record"];
```

Enums become literal unions, optional fields become `| null`. These types
back the typed client (`resources/contact.client.ts`) directly — there's no
separate codegen step to keep in sync.

Next: the [field type grammar](/concepts/field-grammar/) `gen resource
--fields` accepts, and exactly [what gets generated](/concepts/generated-files/)
from a descriptor.
