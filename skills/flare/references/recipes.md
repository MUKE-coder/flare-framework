# Recipes

## A relation, both ways

```bash
npx flare gen resource Category --fields 'name:string!, slug:string!'
npx flare gen resource Product  --fields 'name:string, category:belongsTo(Category)?'
```

The product form gets a searchable picker; the category's record page gets a
table of its products. To show the child table, add the other side:

```ts
// resources/category.resource.ts, outside the generated block
products: field.hasMany("Product"),
```

## File uploads

```bash
--fields 'image:file:[image]:5mb?'
```

Needs the four `R2_*` variables. Uploads go straight from the browser to R2
through a signed URL; the column holds the key. Images show as thumbnails in
the table and on the record page.

## Search

The dashboard's table search is `contains` over the resource's searchable
string fields — no setup. For real ranked search on Postgres, add a generated
`tsvector` column and a GIN index in a hand-written migration, then query it
with `$queryRaw` and `plainto_tsquery`. Read the caution in `rules.md` first:
Prisma will try to drop that column.

Measured on 302,000 rows: the index wins decisively on a rare term (0.26 ms
against 2.07 ms for `ILIKE`), and *loses* on a common one (44 ms against
1 ms), because ranking scores every match while a `LIKE` with a `LIMIT` stops
at twenty. Use it for the searches that would otherwise degrade, not as a
reflex.

## Auth

Better Auth is wired at `flare create`: email and password always, plus any of
magic links, email codes, passkeys, authenticator app and email 2FA, and
social providers. `lib/auth-config.ts` holds the choice. Make someone an
admin with `flare user:role <email> admin`.

Sessions come from `requireSession()` in a server component; never trust a
role from the client.

## Billing

```bash
npx flare gen billing
```

Stripe checkout, a billing portal and a webhook that syncs subscription
status. Keys go in `.dev.vars` / `.env` and the platform's secrets — never in
the repo.

## Policies

```bash
npx flare gen policy Invoice --roles admin,finance --delete-roles admin
```

A policy is roles per action — plain data, not functions:

```ts
export default definePolicy({
  resource: "Invoice",
  read: ["admin", "finance"],
  create: ["admin", "finance"],
  update: ["admin", "finance"],
  delete: ["admin"],
});
```

**There is no per-row scoping.** A policy cannot say "only your own records";
anyone with the role reads every row. If an app needs ownership, scope the
query in a hand-written endpoint and do not expose the resource's own list
route to that role. Do not invent a function-shaped policy — `definePolicy`
takes string arrays and will reject anything else.

## An endpoint the resource doesn't give you

```bash
npx flare gen endpoint Invoice recalculate --record --method POST --action update
```

Writes `app/api/invoices/[id]/recalculate/route.ts` with the policy check
already in place.

## Costs

Both stacks have a free tier that a small app stays inside. The dashboard has
a `/dashboard/costs` page that estimates from the app's own usage, and
https://flare-docs.codetotech.com/guides/costs/ has the arithmetic.

## Themes

Six, picked at `flare create` with `--theme`, changed later with
`flare theme <name>`: `default`, `coral`, `amber`, `sky`, `mono`, `emerald`.
Each changes the palette *and* the sign-in screen's layout.

A theme is CSS variables in `app/globals.css` and `data-theme` on `<html>`.
Change colours there; components read semantic tokens (`bg-card`,
`text-muted-foreground`), never raw values. Dark mode comes with each theme.

## Seeds that don't fight you

- Write dates as `new Date(fake.date())` on the Next.js stack. Prisma maps a
  `date` field to `DateTime @db.Date`; `fake.date()` returns a date-only
  string, which SQLite takes and Postgres refuses.
- A failed seed leaves behind what it already wrote, so the next run trips on
  a unique constraint and hides the original error. Clear the tables first.
- The back-reference of a `belongsTo` is named after the model, plural:
  `Order` + `OrderItem` gives `order.orderItems`, not `order.items`. Check
  `prisma/schema/resources.prisma` when unsure.
- `seeds/` doesn't exist until `flare seed:make` creates it.
