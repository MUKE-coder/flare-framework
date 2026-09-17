# Flare — Style Guide

Governs the visual language of the **generated admin dashboard**
(`<ResourceTable>`, `<ResourceForm>`, `<ResourceNav>`, `<StatCard>`, and every
page built from them). This is not a guide for the storefront/public-facing
pages a developer builds themselves — those are theirs to style.

Reference aesthetic: a clean, monochrome-first admin UI (sidebar nav, stat
cards, data tables) in the vein of shadcn/ui admin templates — restrained
color, generous whitespace, information-dense but never cluttered.

## Foundations

**Component library:** Tailwind CSS + shadcn/ui primitives (`@/components/ui/*`).
Do not introduce a second component library. Every generated admin component
is built from shadcn/ui primitives (`Table`, `Card`, `Button`, `Input`,
`Select`, `Dialog`, `Badge`) so a developer who ejects/customizes a generated
page finds familiar, editable code — not an opaque black box.

**Icons:** `lucide-react` exclusively, 16–20px in nav/table contexts, 20–24px
in stat cards. Never mix icon sets.

## Color

Monochrome-first with sparing, meaningful accent use. Define as CSS variables
on `:root` so dark mode is a token swap, not a rewrite.

*Implementation note:* the tokens below are the source of truth in
`app/globals.css`, and shadcn/ui's tokens are derived from them. Because
shadcn uses `--accent` for hover surfaces, this guide's `--accent` is
implemented as shadcn's `--primary`, and shadcn's `--accent`/`--muted`/`--secondary`
map to `--surface-muted`. The status tokens are exposed as Tailwind colors
(`text-success`, `bg-warning/10`, …) and as `Badge` variants `success` / `warning` /
`danger`. Dark mode follows the system unless the theme cookie adds `.dark` or
`.light` to `<html>`.

| Token | Light | Dark | Usage |
| --- | --- | --- | --- |
| `--background` | `#ffffff` | `#0a0a0a` | Page background |
| `--surface` | `#ffffff` | `#111111` | Cards, table rows |
| `--surface-muted` | `#f7f7f8` | `#18181b` | Sidebar, hover states |
| `--border` | `#e5e5e7` | `#27272a` | Card/table borders — always subtle, 1px |
| `--foreground` | `#0a0a0a` | `#fafafa` | Primary text |
| `--foreground-muted` | `#6b7280` | `#9ca3af` | Secondary text, labels, timestamps |
| `--accent` | `#0a0a0a` | `#fafafa` | Primary buttons, active nav item — same tone as foreground, inverted per-theme |
| `--success` | `#16a34a` | `#22c55e` | Positive deltas, "paid"/"fulfilled" status badges |
| `--danger` | `#dc2626` | `#ef4444` | Negative deltas, destructive actions, "cancelled" status |
| `--warning` | `#d97706` | `#f59e0b` | "pending" status, rate-limit warnings |

**Rule:** color is reserved for status and directional meaning (up/down,
success/danger/warning). Everything else — nav, chrome, primary buttons —
stays monochrome. This is what keeps a generated dashboard from looking like
a demo template regardless of how many resources a developer adds.

## Typography

- Font: system sans stack (`ui-sans-serif, -apple-system, "Inter", sans-serif`) — no custom font loading for the admin shell, to keep it fast and dependency-free.
- Scale: `text-2xl font-semibold` (page titles, e.g. "Welcome Toby") · `text-sm font-medium` (card labels, nav items) · `text-3xl font-bold` (stat card numbers) · `text-xs text-muted-foreground` (timestamps, helper text).
- Numbers in stat cards and tables are **tabular-nums** — never let currency/counts jitter in width as they update.

## Spacing & layout

- Base unit: 4px (Tailwind default scale). Card padding `p-6`. Grid gaps `gap-4`/`gap-6`.
- Sidebar: fixed width (~240px), collapsible. Nav items get a subtle rounded-md background on hover/active, never a hard border.
- Content area: max content width unconstrained (admin dashboards use full width), but always with consistent `p-6`/`p-8` outer padding.
- Cards: `rounded-lg border border-border bg-surface`, subtle shadow only on modals/popovers — flat elsewhere. Avoid heavy drop shadows; they read as dated.

## Core components

**`<StatCard>`** — icon + label top row, large bold number, small delta badge
(`+12%` in `--success` or `--danger` with an up/down chevron), "vs last
period" in muted text. This is hand-assembled per-app from real aggregate
queries (see `project-description.md`) — the component itself is generated,
its contents are not.

**`<ResourceTable>`** — header row in `--surface-muted`, row hover in the
same tone, sortable column headers with a subtle chevron on hover, status
values rendered as `<Badge>` using the status color tokens above, pagination
controls bottom-right, a row-count/filter summary bottom-left.

**`<ResourceForm>`** — single-column on narrow viewports, two-column grid on
wide; every field gets a label above it (never inline/floating labels — they
hurt scanability in admin contexts); validation errors appear inline below
the field in `--danger`, never as a toast-only error.

**`<ResourceNav>`** — resource name + icon per item (icon inferred from a
`icon:` option on the resource descriptor, falling back to a generic
document icon), active item gets `--surface-muted` background + `--accent`
text, badge count optional (e.g. pending orders) but off by default.

**Charts** (`<ResourceChart>`) — line/bar charts follow the same monochrome
rule: a single-series chart is rendered in `--accent`, multi-series charts
use the smallest possible palette (2–3 shades of gray plus one accent color
for the primary series), never a rainbow palette.

## Dark mode

Every component above must work unmodified in both themes purely through the
CSS variable tokens — no component should special-case `dark:` classes
beyond what's already expressed in the tokens. Theme toggle lives in the top
bar (sun/moon icon, per the reference layout), state persisted to a cookie
so SSR renders the correct theme on first paint (no flash of wrong theme).

## What NOT to do

- No gradients, no glassmorphism, no heavy shadows — this is a tool people
  use for hours a day, not a marketing page.
- No more than one accent color doing real work at a time (status colors are
  the exception, and they're semantic, not decorative).
- Don't let per-app customization break the shared component contract — a
  developer should be able to reskin colors via tokens without forking
  `<ResourceTable>`/`<ResourceForm>` internals.
