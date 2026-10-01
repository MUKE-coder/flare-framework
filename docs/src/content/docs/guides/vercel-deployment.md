---
title: Deploying to Vercel
description: Deploying a Flare app on the Next.js stack, what the platform owns, and the two things it will not do for you.
---

```bash
npx flare deploy
```

runs the Vercel CLI (`vercel deploy --prod`) from the app's own
`node_modules`, so there is nothing to install globally and every project
pins its own version. Anything you add is forwarded straight through:

```bash
npx flare deploy --yes                 # don't ask
npx flare deploy --scope my-team       # a team other than your default
npx vercel deploy                      # a preview instead of production
```

`vercel` on its own works exactly as well — `flare deploy` is a shortcut, not
a wrapper, and it deliberately does nothing the CLI doesn't. This is the
opposite of [the Cloudflare deploy](/guides/deployment/), which sequences
migrations, secrets and zone rules itself, because on Vercel every one of
those belongs to the platform.

## The first deploy

```bash
npx vercel link      # connect this directory to a Vercel project
npx flare deploy
```

Vercel builds on its own machines, running the `build` script from
`package.json`:

```json
"build": "prisma generate && next build"
```

`prisma generate` has to be there. The generated client is written into
`node_modules`, which is not committed and not cached between builds, so a
build without it fails on the first import.

## Environment variables

Set these on the Vercel project (Settings → Environment Variables), not in a
committed file:

| Variable | |
| --- | --- |
| `DATABASE_URL` | Postgres, pooled. Neon's pooled string, not the direct one |
| `BETTER_AUTH_SECRET` | 32+ random bytes. Generate a new one — never reuse your laptop's |
| `BETTER_AUTH_URL` | The production URL, e.g. `https://shop.example.com` |
| `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | File uploads |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Rate limits shared across instances |
| `RESEND_API_KEY`, `MAIL_FROM` | Email. Without them it prints to the log instead of sending |

`.env.example` in your app lists the same set, which is what to copy from.

:::caution
`BETTER_AUTH_URL` has to match the URL people actually visit. If it points at
a preview domain, sign-in cookies are set for the wrong origin and every
session silently fails.
:::

## Migrations are yours to run

Nothing in the deploy touches your database. That is deliberate: Vercel can
build the same commit several times over, in parallel, and a migration that
runs from a build step runs an unpredictable number of times.

Point `DATABASE_URL` at production and apply them:

```bash
DATABASE_URL="postgres://…" npx flare migrate
```

which runs `prisma migrate deploy` — it applies what is already written in
`prisma/migrations/` and never invents anything, so it is safe to run
repeatedly and safe to run against a database that matters. Writing a *new*
migration is `prisma migrate dev`, on your own machine, against your own
database.

Run migrations **before** the deploy when they add something the new code
needs, and **after** when they drop something the old code still uses. That
ordering is the whole of zero-downtime schema change, and no tool can decide
it for you.

## Files go to R2, not Blob

The storage helpers speak S3, pointed at a Cloudflare R2 bucket, on both
stacks. R2 charges nothing for bandwidth out, and an app that serves files is
mostly bandwidth out — [what it costs](/guides/costs/) has the arithmetic.
Vercel Blob works if you would rather keep everything in one account; you
would reimplement `lib/storage.ts` against its SDK.

## A cold database is not a cold function

Neon's free tier suspends a database that has been idle for five minutes, and
the first query after that waits for it to wake. It reads like a slow
function and isn't: it is the plan, and the fix is a paid tier with no
scale-to-zero, not anything in your code.

## What doesn't come with this stack

Realtime. `realtimeChannel().publish()` delivers nothing here, because
Cloudflare's half of it is a Durable Object per channel and Vercel has no
equivalent. It warns once per channel rather than failing quietly, and the write
that triggered it still succeeds. The
observability page links to Vercel's own dashboard rather than charting your
traffic in the app. [Choosing a stack](/start/stacks/) is the honest list.
