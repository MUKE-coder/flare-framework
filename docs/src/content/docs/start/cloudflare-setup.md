---
title: Setting up Cloudflare
description: Everything you need on a Cloudflare account before deploying a Flare app, and what gets created for you.
---

Less than you would expect. You do not create a database, a bucket or a
namespace by hand — Wrangler provisions them on the first deploy from what is
already in `wrangler.jsonc`.

## Before your first deploy

**1. A Cloudflare account.** Free to make at
[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up). No card
needed to sign up, and no domain needed: every Worker gets a
`<app>.<your-subdomain>.workers.dev` URL.

**2. Log Wrangler in, once per machine:**

```bash
npx wrangler login
```

That opens a browser and authorises the CLI. Nothing else is needed for
`flare deploy` to work.

**3. Decide on the Workers Paid plan.** $5/month. You can skip it to start,
but read [the CPU limit](/guides/costs/#the-free-plan-and-the-limit-that-actually-bites)
first — server-rendering React pages exceeds the free plan's 10 ms of CPU per
request, which shows up as intermittent 503s (`error code: 1102`). Most
people should just pay the $5.

## What `flare deploy` creates for you

On the first deploy, Wrangler provisions anything in `wrangler.jsonc` that
does not exist yet, and Flare does the rest:

| Thing | How it appears |
| --- | --- |
| **D1 database** `<app>-db` | Provisioned on first deploy; no `database_id` is written in the config |
| **R2 bucket** `<app>-storage` | Provisioned on first deploy |
| **KV namespace** for the data cache | Provisioned on first deploy |
| **Durable Object** for realtime | Created from the migration in `wrangler.jsonc` |
| **Migrations** | `flare deploy` applies remote D1 migrations *before* the new code goes live, and aborts the deploy if one fails |
| **`BETTER_AUTH_SECRET`** | Generated and uploaded if it isn't set remotely — never your local dev secret |

So the whole first deploy is:

```bash
npx wrangler login     # once per machine
npx flare deploy
```

## In CI, or without a browser

`wrangler login` needs a browser. On a build server, use an API token
instead:

```bash
export CLOUDFLARE_API_TOKEN=…
export CLOUDFLARE_ACCOUNT_ID=…
npx flare deploy
```

Create the token at **My Profile → API Tokens → Create Token**. The
*Edit Cloudflare Workers* template covers a normal deploy; add **D1 Edit** if
your deploy applies migrations, and **Workers R2 Storage Edit** if it
provisions the bucket.

## Optional, when you want the feature

None of these are needed to deploy. Each turns something on:

| Secret | Turns on |
| --- | --- |
| `RESEND_API_KEY`, `MAIL_FROM` | Real email. Without them, mail is printed to the console instead of failing — see the [email guide](/guides/mail/) |
| `GOOGLE_CLIENT_ID` / `_SECRET`, and the other providers | Social sign-in buttons; they only render once the pair is set |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | [Billing](/guides/billing/) |

Set one with:

```bash
npx wrangler secret put RESEND_API_KEY
```

`flare deploy` lists the ones you haven't set, so you never have to remember
this list.

## Using your own domain

Optional — `workers.dev` works fine. To use a domain, add it to Cloudflare
(**Add a site**, then point your registrar at the nameservers Cloudflare
gives you), then add a route in `wrangler.jsonc`:

```jsonc
{
  "routes": [{ "pattern": "shop.example.com", "custom_domain": true }]
}
```

SSL is issued automatically. Set `BETTER_AUTH_URL` to the same origin so
sign-in links point at the right place.

## What you do *not* need

- **A card, to start.** The free plan needs no payment method.
- **A domain.** `workers.dev` gives you a working HTTPS URL.
- **To create the database, bucket or namespace.** The first deploy does it.
- **A CI provider.** `flare deploy` from your machine is a complete deploy.
