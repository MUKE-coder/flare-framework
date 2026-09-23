---
title: Quickstart
description: Scaffold, generate, and deploy a live CRUD app in about five minutes.
---

This walks through the whole loop: a scaffolded app, a generated resource
with a working REST API and admin UI, and a live deploy to Cloudflare
Workers — no hand-written boilerplate at any step.

## 1. Scaffold the app

```bash
npm create flare-framework@latest myapp
cd myapp
```

(`pnpm create flare-framework myapp` works too. For a global `flare` command
or the install scripts, see [Installation](/start/installation/).)

`flare create` writes a vinext app with TypeScript and Tailwind already
configured, and wires up:

- **D1 + Drizzle** — a `DB` binding with no `database_id`, so Wrangler
  auto-provisions the database on first deploy and simulates it locally.
  `db/schema.ts` is the single Drizzle schema entry point.
- **Better Auth** — email/password sign-up and sign-in, session cookies,
  and a Drizzle adapter over the same database. Add
  `--auth-providers google,github` to also scaffold OAuth buttons (they
  only render once you set the matching client ID/secret).
- **R2** — a `STORAGE` binding and `lib/storage.ts` with signed upload/read
  URL helpers.
- **Resend** — `lib/mail.ts`, with a transactional email template. Without
  a `RESEND_API_KEY`, emails print to the console instead of failing.

It installs dependencies and runs `wrangler types` for you, so
`env.DB`/`env.STORAGE`/etc. are typed immediately.

## 2. Generate a resource

```bash
npx flare gen resource Contact --fields 'name:string, email:string!, status:enum(lead,customer)'
```

One command, one [resource descriptor](/concepts/resource-descriptor/),
and Flare emits everything that descriptor implies:

- a Drizzle table and a D1 migration
- Zod validators (strict — no mass assignment)
- a REST API (`GET`/`POST` on `/api/contacts`, `GET`/`PATCH`/`PUT`/`DELETE`
  on `/api/contacts/[id]`)
- a typed fetch client (`resources/contact.client.ts`)
- admin pages: list, create, and edit — wired to `<ResourceTable>` and
  `<ResourceForm>`, with no hand-written UI

See [what `gen resource` emits](/concepts/generated-files/) for the full
file list.

## 3. Apply the migration and run it

```bash
npx flare migrate
npx flare dev
```

Open `/dashboard` and sign up — the first account can see the new **Contacts**
resource in the sidebar immediately, with a working list, create, and edit
flow, form validation, and empty/error states, all generated.

## 4. Deploy

```bash
npx flare deploy
```

This wraps `vinext-cloudflare deploy`:

1. Applies remote D1 migrations before the new code goes live (a failed
   migration aborts the deploy; a first deploy lets Wrangler provision the
   database, then migrates it).
2. Builds and deploys the Worker.
3. Generates and uploads `BETTER_AUTH_SECRET` if it isn't set remotely yet
   (never reusing your local dev secret), and lists any other optional
   secrets (OAuth credentials, `RESEND_API_KEY`) you haven't set.

You'll need `wrangler login` once, the first time you deploy anything.

## 5. Make yourself an admin

Sign-up creates a user with no elevated role. Grant yourself `admin`:

```bash
npx flare user:role you@example.com admin --remote
```

Reload `/dashboard` — you now see every action the `admin` role allows. See
[roles & policies](/guides/roles-and-policies/) to restrict what other
roles can do.

## What you just got

A live URL, backed by D1, with:

- email/password auth end-to-end
- a `Contact` resource with a real REST API and validation
- an admin dashboard styled per Flare's [style guide](https://github.com/MUKE-coder/flare-framework/blob/main/style-guide.md) — monochrome, accessible, dark-mode-ready
- a KV-backed data cache invalidated automatically on every write

No file in this loop was hand-written. Edit the descriptor and re-run `gen
resource` any time — see the
[codegen overwrite contract](/concepts/codegen-contract/) for exactly what
survives a re-run.
