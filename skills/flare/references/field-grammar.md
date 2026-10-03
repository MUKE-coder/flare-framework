# The field grammar

What goes in `--fields`, and what each one generates.

```
name:string, email:email!, bio:text?, price:float, active:boolean,
status:enum(draft,published), avatar:file:[image]:5mb?,
category:belongsTo(Category)?, notes:hasMany(Note)
```

## Suffixes

- `?` — optional (nullable)
- `!` — unique (a unique index, and a 409 with a per-field message on conflict)
- Both, in either order: `sku:string!?`

## Types

| Written | Column | In the dashboard |
| --- | --- | --- |
| `string` | text | single-line input |
| `text` | text | textarea, full width |
| `int`, `float` | integer / real | number input, digits grouped |
| `boolean` | boolean | switch |
| `date`, `datetime` | timestamp | date picker; rendered in the viewer's timezone |
| `enum(a,b)` / `select(a,b)` | text or a Postgres enum | dropdown, shown as a badge |
| `radio(a,b)` | same | radio buttons |
| `multiselect(a,b)` | JSON array | multi-select, shown as badges |
| `tags` | JSON array (text[] on Postgres) | type a label, press Enter; badges |
| `json` | JSON (jsonb on Postgres) | textarea that says whether it parses |
| `markdown` (`richtext`) | text | Write / Preview panes, rendered on the record page |
| `file:[image,pdf]:5mb` | text (an object key) | drop zone; thumbnail for images |
| `belongsTo(Other)` | foreign key | searchable relation picker |
| `hasMany(Other)` | nothing — the other side's key | a table of children on the record page |

## Formats (all stored as text)

`email`, `url` (alias `website`), `tel` (alias `phone`), `domain`, `country`,
`color`, `slug`, `username`, `ip`, `uuid`, `timezone`, `locale`, `currency`,
`postcode`.

## Number shorthands

`percent` and `rating` are an ordinary `float`/`int` column; the shorthand
changes the input and how it is shown. `rating` is bounded 0–5 unless `min`/`max`
say otherwise.

**`money` is stored in whole minor units** — cents, fils, yen — because a column
of doubles drifts. The store converts at its boundary, so you still send and
receive `19.99` everywhere; only the column holds `1999`. More decimal places
than the currency has is a 422, not a silent round. Negatives are refused unless
`min` allows them.

## Relationships

`belongsTo` is the only real one — a foreign key column. `hasMany` stores
nothing; it is a view of the other side.

- **One to many:** `category:belongsTo(Category)?` on the *many* side, and
  `products: field.hasMany("Product")` on the one side to see the children.
- **One to one:** `user:belongsTo(User)!` — the `!` makes the key unique.
- **Many to many:** no such field. Make the join a resource with two
  `belongsTo` (`OrderItem`), because it nearly always grows columns. For a
  fixed vocabulary with no data of its own, use `multiselect` instead.
- `onDelete` defaults to `set null` when optional and `cascade` when required;
  `restrict` refuses the delete and answers 409.

## File fields

`file:[image]:5mb` is the field, the categories it accepts, and the size cap.
Categories: `image`, `video`, `audio`, `pdf`, `doc`, `sheet`, `archive`,
`any`. The limit is enforced in the browser **and** when the server signs the
upload.

The column stores a key, not the bytes. Objects live in R2 and are private;
URLs are signed on demand.

## Relations

`belongsTo` adds the foreign key and, on the other side, the list. Prisma
refuses one-sided relations, so on the Next.js stack the generator
synthesises the reverse field.

`onDelete` defaults to `set null` for an optional relation and `cascade` for a
required one. Override it in the descriptor:

```ts
category: field.belongsTo("Category", { required: false, onDelete: "set null" }),
```

## Beyond the grammar

The grammar is for the command line. The descriptor itself takes more —
`label`, `help`, `placeholder`, `default`, `min`/`max`, `rows`, `hidden`,
`readOnly`, plus `computed`, `hooks`, `titleField`, `icon` and `group`. Write
those in `resources/<name>.resource.ts` and run `flare sync-types`.
