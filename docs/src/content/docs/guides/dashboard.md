---
title: The dashboard
description: "One signed-in area: resources, stats, tables with import and export, forms in a dialog, account, security and observability."
---

Every Flare app ships a dashboard at `/dashboard`. It's the whole signed-in
area — your resources, the account pages, security and observability — and
it's plain source in your app under `app/dashboard/` and
`components/dashboard/`, built from shadcn/ui primitives. Nothing lives in an
opaque package.

Generating a resource is all it takes for it to appear:

```bash
npx flare gen resource Contact --fields 'name:string, email:string!, status:enum(lead,customer)?'
npx flare seed:resource Contact --count 500
```

That writes the list, create and edit pages, and the sidebar picks the
resource up from its descriptor.

:::note
Before 0.3 this lived at `/admin`. It's one area now: `/admin` redirects to
`/dashboard`, and `lib/admin.ts` is `lib/dashboard.ts`.
:::

## What's in it

| Route | |
| --- | --- |
| `/dashboard` | Stats for every resource, what's in the database, and what's left to secure your account |
| `/dashboard/<resource>` | The table: search, filters, sorting, selection, import and export |
| `/dashboard/account` | Profile, password, two-factor, passkeys, connected accounts, signed-in devices |
| `/dashboard/observability` | Traffic, errors, database size and the audit log |
| `/dashboard/security` | Written by [`flare gen security`](/guides/security/): detectors, bans and events |

Who sees what comes from the [policies](/guides/roles-and-policies/): the
sidebar lists only the resources this person may read, and the sections that
manage the app itself are for `ADMIN_ROLES` (`lib/dashboard.ts`).

## Page header and stats

Every page opens the same way, so they all line up:

```tsx
<PageHeader
  title="Contacts"
  description="Everyone you're talking to."
  crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Contacts" }]}
  actions={<Button>New contact</Button>}
/>
```

Above each table, `<ResourceStats resource={contact} />` shows the total, how
many arrived this week and which way that's moving, then a split by the
resource's own status field — its first filterable enum. `<StatCards>` takes
any stats you want on a page of your own:

```tsx
<StatCards
  stats={[
    { label: "Open deals", value: 42, change: 12.5, icon: HandshakeIcon },
    { label: "Overdue", value: 3, goodDirection: "down", hint: "needs chasing" },
  ]}
/>
```

## The table

`<ResourceTable resource searchParams>` is a server component with all of its
state in the URL — `page`, `sort`, `q`, `filter[field]` — so a view can be
linked, bookmarked and shared.

- **Columns** — every field with `list !== false`, plus Created.
- **Cells** — enums render as a `<Badge>` toned by `statusTone()` (`paid` →
  success, `pending` → warning, `cancelled` → danger); `belongsTo` shows the
  related record's title; emails, phones and URLs are links; numbers are
  right-aligned and `tabular-nums`.
- **Toolbar** — search, plus a filter per enum and boolean field.
- **Selection** — tick rows to export or delete them together. Selection is
  per page on purpose: a "select all 40,000" checkbox reads as harmless right
  up until it isn't, so to act on more than a page, filter down to what you
  mean first.
- **Empty and error states** — clear the filters, or create the first record;
  an invalid URL parameter falls back to its default with a notice rather than
  erroring.

### Export

The Export button writes a CSV of **everything matching the current search,
filters and sort**, not just the page on screen — the server reads it through
the same store the table uses, so the file holds exactly what that person is
allowed to see. It stops at 50,000 rows and says so.

### Import

Import CSV reads a file in the browser, matches its headers to the resource's
fields (you can correct any of them), previews the first rows, then sends them
in batches of 500. Each row goes through the same validation as the form and
the API, so a bad row is reported with its line number and the rest still
import. When some fail, "Download failed rows" gives you a CSV of just those,
with a column saying why.

## Forms

Records are created and edited in a dialog over the list, so you keep the
list, its filters and your place in it. Long forms read better on their own
page — switch in `lib/site.ts`:

```ts
export const site = {
  dashboard: {
    forms: "modal", // or "page"
  },
};
```

Both use the same `<ResourceForm>`: one input per stored field from the
descriptor, labels above (never floating), one column on narrow screens and
two on wide, long text spanning both, errors inline under the field and never
toast-only. It validates with the descriptor's Zod schemas in the browser
first (focusing the first invalid field), then a server action validates again
through the same store the REST API uses — including unique-constraint
conflicts, which land back on the field that caused them.

## Field widgets

`components/dashboard/fields/`: text, email, URL, textarea, numbers, switch,
select (with a "None" option when the field is optional), radio group,
multi-select, colour, slug, a searchable country picker, a phone input with
dial codes, date and datetime pickers (values stay in UTC, so a date-only
value never shifts a day across timezones), a relation picker (searches the
target resource's REST API, stores the id, shows its title), and the
[file upload widget](/guides/storage/#the-filefield-widget).

## Observability

`/dashboard/observability` answers "how is this app doing?" in one page:

- **Traffic, errors and CPU time** from Cloudflare's GraphQL Analytics API.
  It needs a token, and the page says so until it has one:

  ```bash
  npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
  npx wrangler secret put CLOUDFLARE_API_TOKEN   # Account Analytics: Read
  ```

- **Database** — how many records each resource holds.
- **Audit log** — every create, edit, delete, import and bulk delete made
  through the dashboard, with who did it and when. It records only the fields
  that changed, never whole records: an audit trail that copies every row is a
  second database of the same data, and somewhere for secrets to leak into.

Write your own entries with the same helper:

```ts
import { recordAudit } from "@/lib/audit";

await recordAudit({ action: "update", resource: "Invoice", recordId: id, changes: { status: { from: "draft", to: "sent" } } });
```

## Theme

The header's toggle writes a `flare-theme` cookie (`light`, `dark` or
`system`). A small inline script in the root layout reads it before first
paint, so there's no flash of the wrong theme. The root layout deliberately
doesn't read `cookies()` on the server — that would make every page beneath it
dynamic (see [Caching](/guides/caching/)) — while the dashboard layout does,
only to give the toggle its initial state. The whole dashboard follows the
app's [theme](/guides/themes/).

## Changing it

Every dashboard component is copied into your app rather than imported from a
package, so changing how a cell renders, or adding a column the descriptor
doesn't know about, is an ordinary edit to
`components/dashboard/resource-table.tsx`. If a file still carries a
`// generated:start` marker, edits inside that block are reported as drift by
`flare sync-types` — that's the check doing its job, not a reason to avoid the
edit.

The repo's [style guide](https://github.com/MUKE-coder/flare-framework/blob/main/style-guide.md)
has the visual language every one of these components follows.
