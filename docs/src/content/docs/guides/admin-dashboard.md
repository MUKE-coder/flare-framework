---
title: The admin dashboard
description: ResourceTable, ResourceForm, and ResourceNav, generated from descriptors.
---

The admin is Filament-style: a handful of components read a resource
descriptor at runtime, and every resource gets a working list, create, and
edit page without hand-authored UI. Every component is built from
shadcn/ui primitives, copied into your app as plain editable source under
`components/ui` and `components/admin` — nothing lives in an opaque
package.

## `<ResourceTable resource searchParams>`

A server component with all of its state in the URL —
`page`, `sort`, `q`, `filter[field]`:

- **Columns** — every field with `list !== false`, plus a Created column.
- **Cells** — enums render as a `<Badge>` toned by `statusTone()` (e.g.
  `paid` → success, `pending` → warning, `cancelled` → danger);
  `belongsTo` shows the related record's title; numbers are
  right-aligned and `tabular-nums`; the first column links to the edit
  page.
- **Toolbar** — search plus a filter select per enum/boolean field.
- **Rows** — a row menu with Edit and a Delete behind a confirmation
  dialog, wired to a server action.
- **Empty and error states** — a clear-filters or create call-to-action
  when there's nothing to show; an invalid URL parameter falls back to
  its default with a notice instead of erroring.

## `<ResourceForm mode="create" | "edit">`

A client component rendering one input per stored field, straight from
the descriptor: labels above every field (never inline/floating), one
column on narrow screens and two on wide, long text spanning both,
validation errors inline under the field — never toast-only.

It validates with the descriptor's own Zod schemas in the browser first
(focusing the first invalid field), then calls a server action that
validates again through the same store the REST API uses — including
unique-constraint conflicts, which map back onto the offending field.

## Field widgets

`components/admin/fields/`: text/email/url input, textarea, numeric input,
switch, select (with a "None" option when the field is optional), date and
datetime pickers (values stay in UTC so a date-only value never shifts a
day across timezones), a relation picker (searches the target resource's
REST API, stores the id, displays its title), and the
[file upload widget](/guides/storage/#the-filefield-widget).

## `<ResourceNav>`

Builds the sidebar from every registered resource: label from
`pluralLabel`, icon from the descriptor's `icon:` option (a curated
lucide-react map, since lucide has no per-icon entry points a dynamic
lookup could use without bundling every icon), the active item from the
current path. It collapses, and the collapsed state persists in a cookie.

## Theme

The header's toggle writes a `flare-theme` cookie (`light`/`dark`/`system`).
A small inline script in the root layout (`app/layout.tsx`) reads that
cookie in the browser and adds the class to `<html>` before first paint, so
there is no flash of the wrong theme. The root layout deliberately doesn't
read `cookies()` on the server: that would make every page beneath it
dynamic (see [Caching](/guides/caching/)). The admin layout does read the
cookie server-side, only to give the toggle its initial state. The theme
follows the system preference until you choose one explicitly.

## Customizing it

Because every admin component is copied into your app, not imported from
a package, changing how a cell renders or adding a column that isn't in
the descriptor is a normal edit to `components/admin/resource-table.tsx` —
the same workflow as customizing any shadcn/ui component. Just remember:
if the file still carries a `// generated:start` marker, edits inside that
block will be reported as drift by `flare sync-types` (which is fine —
that's the point of the check, not a reason to avoid the edit).

See the repo's [style guide](https://github.com/MUKE-coder/flare-framework/blob/main/style-guide.md)
for the exact visual language (monochrome-first, color reserved for
status) every one of these components follows.
