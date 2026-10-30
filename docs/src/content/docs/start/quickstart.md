---
title: Quickstart
description: Scaffold, generate, and deploy a live CRUD app in about five minutes.
---

import { Tabs, TabItem } from '@astrojs/starlight/components';

This walks through the whole loop: a scaffolded app, a generated resource
with a working REST API and admin UI, and a live deploy to Cloudflare
Workers — no hand-written boilerplate at any step.

## Do you need Docker?

Depends on the stack, and it is worth knowing before you start.

<Tabs>
<TabItem label="Next.js — with Docker">

The Next.js stack uses real Postgres, real S3 and real Redis, so those have to
come from somewhere. With Docker they come from the `docker-compose.yml` in
your new app:

```bash
pnpm create flare-framework myapp --stack next
cd myapp
docker compose up -d        # Postgres, MinIO and Redis
npx flare migrate
npx flare dev
```

That is the whole setup. `flare create` already wrote a `.env` holding a fresh
`BETTER_AUTH_SECRET` and the addresses these three services listen on, so
there is nothing to edit first.

| Service | What it stands in for | Where |
| --- | --- | --- |
| `postgres` | Neon, or any Postgres | `127.0.0.1:5432` |
| `minio` | Cloudflare R2 (it speaks S3, so the same code works) | `127.0.0.1:9000`, console on `:9001` |
| `redis` + `redis-http` | Upstash (the proxy speaks Upstash's REST protocol) | `127.0.0.1:8079` |

`docker compose down` stops them; add `-v` to throw the data away too.

</TabItem>
<TabItem label="Next.js — without Docker">

You need a Postgres database and somewhere to put files. The free tiers are
enough:

1. **Postgres** — create a project on [Neon](https://neon.tech) and copy the
   pooled connection string into `DATABASE_URL`.
2. **Files** — create an [R2](https://developers.cloudflare.com/r2/) bucket and
   an API token, then set `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` and
   `R2_SECRET_ACCESS_KEY`.
3. **Redis** — optional. Rate limits fall back to in-memory without it, which
   is fine on one machine. For the real thing, create an
   [Upstash](https://upstash.com) database and set the two `UPSTASH_` variables.

```bash
pnpm create flare-framework myapp --stack next
cd myapp
# edit .env with the values above
npx flare migrate
npx flare dev
```

Uploads are the one thing that will not work until R2 is set: `lib/storage.ts`
signs URLs against whatever `R2_ENDPOINT` points at, and there is no local
fallback.

</TabItem>
</Tabs><TabItem label="Cloudflare — no Docker">

**Nothing to install.** Wrangler simulates the whole platform on your machine:
D1 is a local SQLite file, R2 is a local directory, KV and Durable Objects run
in the same process. `flare dev` is the only command, and there is no database
to provision and no bucket to create.

```bash
pnpm create flare-framework myapp
cd myapp
npx flare dev
```

This is the stack the rest of this page uses.

</TabItem>


:::tip[Which stack?]
**Next.js** is the default, and what most people reach for: real Postgres,
Prisma, and Vercel. **Cloudflare** is the one to pick when you want the
cheapest thing to run and the least to install — no Docker, no accounts, one
command to deploy. [Choosing a stack](/start/stacks/) compares them properly.
:::

## 1. Scaffold the app

```bash
pnpm create flare-framework myapp
cd myapp
```

(`npm create flare-framework@latest myapp` works too, and still installs with
pnpm when you have it — an app is around 340 packages, which is minutes under
npm and seconds under pnpm. For a global `flare` command or the install
scripts, see [Installation](/start/installation/).)

It asks where the app will run first. The default is **Next.js** — Next.js 16,
Postgres and Prisma, deployed to Vercel — and
[the Next.js tutorial](/tutorials/next-shop/) follows it end to end.

**The rest of this page takes the other answer, Cloudflare**, because it is the
shorter path to something deployed: Workers, D1 and Drizzle, with nothing to
install and one command to ship. Pass `--stack cloudflare` to skip the
question. The descriptors, generated code and dashboard are identical either
way; only the database commands differ, which is why the two have separate
pages. [Choosing a stack](/start/stacks/) compares them properly.

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
