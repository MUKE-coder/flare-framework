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
| `tags` | `text` (JSON array) on D1, `String[]` on Postgres | type a label, press Enter; badges in the table |
| `json` | `text` (JSON) on D1, `jsonb` on Postgres | textarea that says whether it parses |
| `markdown` (or `richtext`) | `text` | Write / Preview panes; rendered on the record page |
| `file:[image,pdf,...]` | `text` (R2 key) | file upload, MIME-restricted to the bracketed categories; `:5mb` sets the limit |
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
| `username` | `ada_lovelace` — letters, digits, `_` and `.`, 2–32 | text input with an `@` prefix | text |
| `ip` | `192.168.1.1` or `2001:db8::1` | monospace input | monospace |
| `uuid` | `3f2504e0-4f89-11d3-9a0c-0305e82c3301`, lower-cased | monospace input | monospace |
| `timezone` | IANA zone: `Africa/Kampala` | input with the browser's own zone list | text |
| `locale` | BCP-47 tag: `en-GB` | monospace input | text |
| `currency` | ISO 4217 code: `UGX`, upper-cased | three-letter input | text |
| `postcode` | `SW1A 1AA`, upper-cased | text input | text |

`website` is an alias for `url`, and `phone` for `tel`.

## Three that hold more than a value

**`tags`** is for labels you did not decide in advance — `labels:tags?` gives
`["urgent", "q3"]`. `multiselect` is the one to reach for when the vocabulary
is fixed: it validates against its options and renders a picker. `tags`
validates only that each one is non-blank, at most 32 characters, and not
already there — case-insensitively, since "Urgent" and "urgent" as two tags is
a mistake every time. `minItems`, `maxItems` and `maxLength` set the rest.

**`json`** is for what is not table-shaped: a settings blob, a webhook
payload, metadata. It is validated as parseable and nothing more, because not
declaring the shape is the point. `field.json({ object: true })` insists on an
object, for a settings bag where a bare string is a mistake. If you find
yourself reaching for it to hold something with a known shape, that shape
wants fields of its own.

One difference between the stacks worth knowing: Postgres `jsonb` is a parsed
representation, so it **normalises key order**, while D1 stores the text you
gave it. Values, nesting and types are identical either way — only the order
of an object's keys can change, which is not part of what JSON means. Don't
write code that depends on it.

**`markdown`** is a `text` column with a different editor: Write and Preview
panes, and the record page renders it. Not a WYSIWYG editor — that means a
large dependency and stored HTML you have to sanitise everywhere it appears,
where Markdown is text that diffs and survives being edited by a script.

The preview and the record page share one renderer,
`components/dashboard/fields/markdown.tsx`, which builds React elements
rather than an HTML string. There is no `dangerouslySetInnerHTML` in it, so
stored text cannot become markup: a `<img onerror=…>` in the text shows up as
those characters, and a `[click](javascript:…)` link renders as plain text
because an href is checked against `https:`, `http:`, `mailto:`, `tel:`, `/`
and `#`. It handles headings, lists, quotes, code, bold, italic, links and
`---`; tables, images and raw HTML appear as what you typed. It is in your
app — swap it for a parser you prefer.

## Number shorthands

`percent` and `rating` are an ordinary `float` and `int` — the shorthand changes
how the number is entered and shown, not how it is stored. `money` is the
exception, and the next section says why.

| Syntax | Column | Admin input | Shown as |
| --- | --- | --- | --- |
| `money` | **integer minor units** | grouped digits with a currency prefix | `1,250.00` |
| `percent` | `float` | grouped digits with a `%` suffix | `12.5%` |
| `rating` | `int` | a row of stars, click to set, click again to clear | ★★★★☆ |

`money` cannot be negative unless the descriptor sets a `min` — a refund
resource would say `field.float({ format: "money", min: -1000 })`. A `rating`
is bounded 0–5 unless `min`/`max` say otherwise. A `percent` is left alone,
because 150% is a real number.

### Money is stored in cents

A `money` column holds whole **minor units** — cents, fils, yen — because a
column of doubles drifts. Three 7p items add up to `0.21000000000000002` in
binary floating point, and a total that is a penny out is not something you can
explain to an accountant.

Nothing above the database sees that. `lib/resource/store.ts` converts at its
boundary, so you keep writing and reading the units people use:

```ts
await productClient.create({ name: "Mug", price: 19.99 });  // you send 19.99
// the column holds 1999
const { data } = await productClient.list();
data[0].price;                                              // 19.99 again
```

The API, the forms, the CSV export, computed values and the typed client all
work in major units. The integer is the database's business.

Two consequences worth knowing:

- **More decimal places than the currency has is refused, not rounded.** `19.999`
  is a `422`, because quietly storing `20.00` changes a number somebody will
  reconcile against a statement. The currency decides how many places: two by
  default, none for `JPY` or `UGX`, three for `KWD`.
- **A money field is not filterable by default** (nor is any number — only
  `enum`, `boolean` and `belongsTo` are). Set `filterable: true` and
  `?filter[price]=19.99` works, converted the same way.

Flare's own billing tables have always stored amounts this way (`amount:int`,
rendered as `cents / 100`). This brings `money` fields in line with them.

:::caution[Upgrading an app that already has money columns]
Before 0.10.0 a `money` field was a `REAL`/`Float` column holding `19.99`.
Those values are now read as 19 cents. `flare gen migration` will change the
column type, but it cannot know whether the numbers in it are old-style — so
multiply them yourself, once, in that migration:

```sql
-- Cloudflare (D1): multiply, then round, before the column becomes an integer.
UPDATE products SET price = CAST(ROUND(price * 100) AS INTEGER);
```

```sql
-- Postgres: same idea, and the column is BigInt afterwards.
UPDATE products SET price = ROUND(price * 100);
```

Check a row before and after. If an app has no rows yet, there is nothing to do.
:::

```bash
npx flare gen resource Vendor --fields 'name:string, handle:username!, fee:money, commission:percent, score:rating?'
```

```bash
npx flare gen resource Supplier --fields 'name:string, email:email, phone:tel?, website:website?, domain:domain?, country:country?, timezone:timezone?, currency:currency?, brandColor:color?, tier:radio(bronze,silver,gold), services:multiselect(design,build,hosting)?'
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
| `archive` | zip, gzip, 7z, rar — including the names browsers give a .zip |
| `any` | anything at all |

Every category but `any` also checks the file's leading bytes against the
type it claims, so a `.exe` renamed `.png` is refused. `any` checks nothing
beyond the size limit — reach for it when the point is that anything goes (a
drive, an attachment, a backup), not out of convenience.

## File size limits

A file field allows 10 MB unless you say otherwise. Write the limit after
the category list:

```bash
npx flare gen resource File --fields 'content:file:[any]:100mb'
npx flare gen resource Deal --fields 'contract:file:[pdf]:2mb?'
```

`b`, `kb`, `mb` and `gb` are all understood, and the suffixes still work
after it (`:2mb?` is an optional field with a 2 MB limit). The most a field
can take is `100mb`: an upload streams through the Worker, and that's what
one request will carry.

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
