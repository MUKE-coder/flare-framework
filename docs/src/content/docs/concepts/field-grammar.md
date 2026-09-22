---
title: Field type grammar
description: The --fields string flare gen resource parses.
---

`flare gen resource <Name> --fields '...'` accepts a comma-separated list
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
| `enum(a,b,c)` or `select(a,b,c)` | `text` + CHECK constraint | dropdown |
| `radio(a,b,c)` | `text` + CHECK constraint | radio buttons |
| `multiselect(a,b,c)` | `text` (JSON array) | checkboxes; badges in the table |
| `file:[image,pdf,...]` | `text` (R2 key) | file upload, MIME-restricted to the bracketed categories |
| `belongsTo(Model)` | FK column | relation picker |
| `hasMany(Model)` | — (inverse relation only) | inline table |

## Formats

These are strings (a `text` column, searchable and sortable) with their own
validation, input and display:

| Syntax | Stored as | Admin input | Shown as |
| --- | --- | --- | --- |
| `email` | `ada@example.com` | email input | `mailto:` link |
| `url` | `https://example.com/about` (http or https only) | URL input | link |
| `tel` (or `phone`) | E.164: `+256772123456`, validated for its country | searchable country-code picker + number | `+256 772 123456`, `tel:` link |
| `domain` | `example.com` (a pasted URL is trimmed to its host) | text input | link |
| `country` | ISO 3166-1 code: `UG` | searchable country list with flags | 🇺🇬 Uganda |
| `color` | `#f2541d` | colour picker + hex | swatch |
| `slug` | `my-first-post` (typed text is slugified) | text input | text |

```bash
npx flare gen resource Vendor --fields 'name:string, email:email, phone:tel?, website:url?, domain:domain?, country:country?, brandColor:color?, handle:slug!?, tier:radio(bronze,silver,gold), services:multiselect(design,build,hosting)?'
```

A field named `email`, `…Email`, `url`, `website` or `…Url` declared as
`string` becomes `email` or `url` automatically.

In a descriptor, the same types have builders: `field.email()`, `field.tel()`,
`field.url()`, `field.domain()`, `field.country()`, `field.color()`,
`field.slug()`, `field.select([...])`, `field.radio([...])` and
`field.multiselect([...], { minItems, maxItems })`.

## Modifiers

Append `?` to make a field optional (nullable), `!` to make it unique.
They combine: `sku:string!?`.

```bash
npx flare gen resource Product --fields 'sku:string!?, price:float, inStock:boolean?'
```

:::note[Quoting in your shell]
Wrap `--fields` in **single quotes** in bash, zsh (including Git Bash on
Windows) and PowerShell. Inside double quotes, bash reads `!` as a history
command and fails with `event not found` before Flare ever runs. In Windows
`cmd.exe`, which has no single-quote quoting, use double quotes instead.
:::

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
