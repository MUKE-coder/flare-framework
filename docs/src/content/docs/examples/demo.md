---
title: The demo app
description: A small CRM covering every guide in these docs, in one app.
---

`examples/demo` in the framework repo is a small CRM, built entirely
through the CLI commands these docs describe — no hand-authored resource,
API route, or admin page. It's what M0–M3 of the framework's own build
were verified against, including a real deploy to
`https://demo.<subdomain>.workers.dev`.

## Resources

| Resource | Demonstrates |
| --- | --- |
| **Company** | A `unique` string field, and a `hasMany("Deal")` relation with no column of its own |
| **Contact** | An `enum` field (`lead`/`pending`/`customer`/`churned`) rendered as a status `<Badge>`, a `boolean` toggle, an `email`-formatted string |
| **Deal** | Two `belongsTo` relations to different targets (`Company`, and an *optional* `belongsTo("Contact")` with `onDelete: "set null"`), a `date` field, and a `file:[pdf,image]` field wired end to end to R2 |

Generated with:

```bash
npx flare gen resource Company --fields "name:string!, deals:hasMany(Deal)"
npx flare gen resource Contact --fields "name:string, email:string, phone:string?, status:enum(lead,pending,customer,churned)?, vip:boolean?"
npx flare gen resource Deal --fields "title:string, amount:float?, company:belongsTo(Company), owner:belongsTo(Contact)?, closeOn:date?, contract:file:[pdf,image]?"
```

## Policy

```bash
npx flare gen policy Deal --roles admin,staff --delete-roles admin
```

`Contact` and `Company` have no policy file, so — per the
[roles & policies](/guides/roles-and-policies/) default — they stay
readable and writable by any signed-in user, while `Deal` is restricted:
`staff` can read/create/update but not delete, and a role with neither
`admin` nor `staff` sees no `Deal` link in the sidebar at all and gets
`403` calling the API directly.

## Seeds

`seeds/companies.seed.ts`, `contacts.seed.ts`, and `deals.seed.ts` (in
that file-name order, so companies and contacts exist before deals
reference them) — written with `flare seed:make <name> --resource <Name>`
and filled in by hand, then run with:

```bash
npx flare seed
```

## Running it yourself

```bash
git clone https://github.com/MUKE-coder/flare-framework.git
cd flare-framework
pnpm install
pnpm build           # builds @flaredev/core and @flaredev/cli, which the demo uses
cd examples/demo
npx flare migrate    # apply migrations to local D1
npx flare seed       # seeds/companies, contacts, deals, in that order
pnpm run dev
```

Sign up, then grant yourself `admin` locally:

```bash
npx flare user:role you@example.com admin
```

## What was verified against it

- `scripts/e2e-auth.sh` — 13/13, sign-up through forged-cookie rejection
- `scripts/e2e-crud.sh` — 21/21, every HTTP verb and error path, run
  against both local D1 and the live deploy
- `scripts/e2e-file-field.mjs` — 15/15 against the built production
  worker, including the server-side content check with the browser's
  check bypassed
- A three-user check of `Deal`'s policy (admin, staff, no role) against
  the live deploy, confirming the API answers `403` exactly where the UI
  already hides the action — see
  [roles & policies](/guides/roles-and-policies/#verify-its-not-ui-only)
