---
title: Field type grammar
description: The --fields string flare gen resource parses.
---

`flare gen resource <Name> --fields "..."` accepts a comma-separated list
of `name:type` pairs. Commas inside `(...)` or `[...]` don't split the
list, so `enum(a,b,c)` and `file:[image,pdf]` are each one field.

## Types

| Syntax | Drizzle column | Admin widget |
| --- | --- | --- |
| `string` | `text` | text input |
| `text` | `text` (long) | textarea |
| `int` / `float` | `integer` / `real` | number input |
| `boolean` | `integer` (0/1) | toggle |
| `date` / `datetime` | `text` (ISO) | date picker |
| `enum(a,b,c)` | `text` + CHECK constraint | select |
| `file:[image,pdf,...]` | `text` (R2 key) | file upload, MIME-restricted to the bracketed categories |
| `belongsTo(Model)` | FK column | relation picker |
| `hasMany(Model)` | — (inverse relation only) | inline table |

## Modifiers

Append `?` to make a field optional (nullable), `!` to make it unique.
They combine: `sku:string!?`.

```bash
npx flare gen resource Product --fields "sku:string!?, price:float, inStock:boolean?"
```

`hasMany` fields can't take suffixes — they don't store a column.

## Naming

Field names are camelCased: `first_name` becomes `firstName`.
`company:belongsTo(Company)` becomes the key `companyId` (Drizzle column
`company_id`). An **optional** `belongsTo` automatically gets
`onDelete: "set null"`.

String fields named `email` or ending in `Email` get `format: "email"`
automatically. Fields named `url`/`website`, or ending in `Url`/`Website`,
get `format: "url"`.

## File categories

`file:[...]` requires at least one category:

| Category | Accepts |
| --- | --- |
| `image` | png, jpeg, gif, webp, avif — **not** SVG, which can carry script |
| `pdf` | PDF |
| `video`, `audio`, `text`, `csv` | as named |
| `document` | common word-processor formats |
| `spreadsheet` | common spreadsheet formats |
| `archive` | zip only (`application/zip`) |

## Typos are caught early

Unknown types or categories get a "did you mean `string`?" suggestion
rather than a cryptic failure, and the whole descriptor is validated with
`defineResource` before anything is written — a bad `--fields` string
leaves your app untouched.

## Relations end to end

```bash
npx flare gen resource Company --fields "name:string"
npx flare gen resource Contact --fields "name:string, company:belongsTo(Company)?"
```

This gives `Contact` a `companyId` column (FK, indexed, `onDelete: "set
null"` because it's optional) and a Drizzle relation both directions.
`Company` doesn't need a matching `hasMany` declared for the foreign key to
work, but add one if you want the admin to know about the inverse:

```ts
// resources/company.resource.ts
fields: {
  name: field.string({ maxLength: 120 }),
  contacts: field.hasMany("Contact"),
}
```

A `hasMany` whose target doesn't exist yet is left *pending* and linked
automatically once you generate that resource. A `hasMany` whose target
exists but has no matching `belongsTo` back-reference is an error before
anything is written.
