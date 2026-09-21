---
title: Deploying to Cloudflare
description: What flare deploy does beyond vinext-cloudflare deploy, and how to control it.
---

```bash
npx flare deploy
```

wraps `vinext-cloudflare deploy` with the parts a Cloudflare app always
needs and almost always forgets the first time:

1. **Migrations before code.** For every D1 database declared in
   `wrangler.jsonc`: if it already exists (checked with `wrangler d1
   info`), remote migrations apply **before** the deploy, and a failed
   migration aborts it — your new code never runs against an old schema.
   If the database doesn't exist yet (a first deploy), Wrangler creates it
   during deploy and migrations run immediately after.
2. **Build and deploy** — `vinext-cloudflare deploy --config
   dist/server/wrangler.json`.
3. **Secrets.** If `BETTER_AUTH_SECRET` isn't set on the Worker yet, Flare
   generates a fresh 32-byte value and uploads it over stdin — **never**
   the value from your local `.dev.vars`. Any other secret named in
   `.dev.vars.example` that's still unset in production is listed with
   the exact `wrangler secret put` command to set it.

## Flags

| Flag | Effect |
| --- | --- |
| `--skip-migrations` | Don't touch D1 at all this deploy |
| `--skip-secrets` | Don't check or generate secrets this deploy |
| `--skip-security` | Don't push `security.config.ts` zone rules this deploy (see [Security](/guides/security/)) |
| `--env <name>` | Forwarded to every Wrangler call (migrations, secrets, deploy) |
| `--preview` | Shorthand for `--env preview` |
| `--dry-run` / `--help` | Delegate straight through — nothing remote is touched |

## First deploy

You need `wrangler login` once. After that:

```bash
npx flare deploy
```

D1, R2, and the KV cache namespace are all auto-provisioned by name (no
IDs in `wrangler.jsonc` to manage), migrations apply right after
provisioning, and `BETTER_AUTH_SECRET` is generated for you. Your app is
live at `<name>.<subdomain>.workers.dev`.

## Environments

Wrangler environments (`--env staging`, `--env production`, …) work the
normal way — declare them in `wrangler.jsonc`, then pass `--env` to every
`flare` command that touches remote state (`migrate`, `deploy`,
`role:add --remote`, `user:role --remote`). Flare forwards it consistently
rather than requiring you to repeat Wrangler flags by hand.

## Custom domains

Once you attach a custom domain in the Cloudflare dashboard, set
`BETTER_AUTH_URL` to it (as a secret or plain var) — otherwise Better Auth
falls back to the `localhost`/`workers.dev` allowlist described in
[the auth guide](/guides/auth/#base-url-and-allowed-hosts).

## Verifying a deploy

The framework repo's own `scripts/e2e-crud.sh <url>` and
`scripts/e2e-auth.sh <url>` are worth copying into your own app if you
want a repeatable smoke test against a live deploy — they exercise every
HTTP verb and the full auth flow, including the paths that are supposed
to fail (`401`/`403`/`404`/`409`/`415`/`422`).
