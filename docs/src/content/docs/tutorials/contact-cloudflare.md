---
title: "Tutorial: a contact app on Cloudflare"
description: From one command to a working contact manager — tables, API, admin screens and sign-in — on Workers, D1 and Drizzle, with nothing to provision.
---

The same half hour as [the Next.js version](/tutorials/contact-next/), on the
other stack — and nothing to install or sign up for. Wrangler simulates the
whole platform on your machine: D1 is a local SQLite file, R2 a local
directory, KV and Durable Objects run in the same process. You need Node 22+
and nothing else; a Cloudflare account only matters on the day you deploy.

## 1. Create the app

```bash
pnpm create flare-framework contacts --stack cloudflare
cd contacts
npx flare dev               # http://localhost:3000
```

That's the whole setup — no database to start, no `.env` to fill in. Open
[localhost:3000](http://localhost:3000) and **sign up**: on this stack the
first account to register becomes the admin, so the dashboard is yours the
moment you're in. (Prefer a seeded account? `npx flare db:seed` makes
**admin@example.com** / **Password**.)

## 2. Your first resource

From a second terminal in the app:

```bash
npx flare gen resource Contact --fields 'name:string, email:email!, status:enum(lead,customer)'
npx flare migrate           # create its table
npx flare seed:resource Contact 1000
```

Refresh the dashboard. **Contacts** is in the sidebar with a thousand rows —
search, filters, sorting, paging, CSV export, a form that already validates
`email` and only offers `lead` or `customer` for `status`. The same descriptor
produced a REST API:

```bash
curl http://localhost:3000/api/contacts
```

documented at [/api/openapi.json](http://localhost:3000/api/openapi.json).
Nothing is hidden: the descriptor is `resources/contact.resource.ts`, the
Drizzle table in `db/schema/`, the route handlers in `app/api/contacts/`, the
screens in `app/dashboard/contacts/` — all yours to edit.

## 3. Change your mind about a field

Rename `name` to `fullName` without losing the thousand rows. In
`resources/contact.resource.ts`:

```ts
fullName: field.string({ rename: { from: "name" } }),
```

```bash
npx flare gen resource Contact                        # regenerate from the descriptor
npx flare gen migration rename_contact --from-schema  # writes ALTER TABLE ... RENAME — "data kept"
npx flare migrate
```

The declared `rename` is what makes that an `ALTER TABLE … RENAME COLUMN`
rather than a drop and an add. The rows survive; check the dashboard.

## 4. Decide who may do what

```bash
npx flare gen policy Contact --roles admin,staff
```

Only `admin` and `staff` can touch contacts now — in the dashboard **and**
over the API, same rule, one file (`policies/contact.policy.ts`). Try it from
**Users → New user**: make an account with the role `user`, sign in as them in
a private window, and Contacts is gone from the sidebar and `403` over the
API. Promote them to `staff` from the row menu and it all appears.

## 5. Where to go next

- **Deploy** — `wrangler login`, then `npx flare deploy`: it migrates D1,
  builds, deploys the Worker and checks your secrets, in one command
  ([deployment](/guides/deployment/)).
- **Uploads** — add `avatar:image` to the fields and regenerate; R2 is already
  bound ([file uploads](/guides/file-uploads/)).
- **A bigger build** — [the shop with a till](/tutorials/shop/) and
  [the drive](/tutorials/drive/) take this stack much further.

The same app on the other stack is
[a contact app on Next.js](/tutorials/contact-next/) — from step 2 on, the
commands are identical, which is rather the point.
