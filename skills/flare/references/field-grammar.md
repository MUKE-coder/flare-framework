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
| `file:[image,pdf]:5mb` | text (an object key) | drop zone; thumbnail for images |
| `belongsTo(Other)` | foreign key | searchable relation picker |
| `hasMany(Other)` | nothing — the other side's key | a table of children on the record page |

## String formats

`email`, `url`, `tel` (or `phone`), `domain`, `country`, `color`, `slug`.
Each one validates, and changes the input and how the value renders — an
email becomes a `mailto:` link, a color shows its swatch.

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
