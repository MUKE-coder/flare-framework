---
title: "Tutorial: a contact app on Next.js"
description: From one command to a working contact manager — tables, API, admin screens and sign-in — on Next.js, Postgres and Prisma 7.
---

Thirty minutes, one resource, and every layer of a Flare app: the database,
the REST API, the admin screens, sign-in and roles. Everything below is a
`flare` command — you will not run Prisma, and you will not write SQL.

You need Node 22+, and Docker Desktop running (it stands in for Postgres;
[a Neon connection string](/start/installation/#prerequisites) works too).

## 1. Create the app

```bash
pnpm create flare-framework contacts
cd contacts
```

It asks five questions — where it runs, where uploads go, the look, sign-in
methods, social providers. Press Enter through all of them: the defaults are
Next.js, R2 against local MinIO, email-and-password sign-in.

## 2. Start the database, the tables, and yourself

```bash
docker compose up -d        # Postgres, on the address .env already has
npx flare migrate           # create the tables
npx flare db:seed           # an account to sign in with
npx flare dev               # http://localhost:3000
```

Open [localhost:3000](http://localhost:3000) and sign in as
**admin@example.com** / **Password**. You're looking at the dashboard:
a **Users** screen with your account in it, observability, and an overview
telling you the three commands you're about to run.

## 3. Your first resource

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

and documented it at [/api/openapi.json](http://localhost:3000/api/openapi.json).
Nothing is hidden: the descriptor is `resources/contact.resource.ts`, the route
handlers are in `app/api/contacts/`, the screens in `app/dashboard/contacts/` —
all yours to edit.

## 4. Change your mind about a field

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

The declared `rename` is why that second command wrote an
`ALTER TABLE … RENAME COLUMN` rather than what Prisma would do on its own —
drop the column and add a new one, taking the data with it. Check the
dashboard: the column is Full Name and all thousand rows are still there.

## 5. Decide who may do what

```bash
npx flare gen policy Contact --roles admin,staff
```

Now only `admin` and `staff` can touch contacts — in the dashboard **and**
over the API, same rule, one file (`policies/contact.policy.ts`). Try it:
make a second account from **Users → New user** with the role `user`, open a
private window and sign in as them. No Contacts in the sidebar, `403` from
the API. Change their role to `staff` from the row menu, and it all appears.

## 6. Where to go next

- **Uploads** — add `avatar:image` to the fields and regenerate; see
  [file uploads](/guides/file-uploads/).
- **Deploy** — a Neon database, `npx flare migrate --deploy` against it, and
  `npx flare deploy` to Vercel; the walk-through is
  [deploying to Vercel](/guides/vercel-deployment/).
- **A bigger build** — [the catalogue tutorial](/tutorials/next-shop/) takes
  this stack further; [the shop with a till](/tutorials/shop/) does the same
  on Cloudflare.

The same app on the other stack is
[a contact app on Cloudflare](/tutorials/contact-cloudflare/) — the commands
are identical from step 3 on, which is rather the point.
