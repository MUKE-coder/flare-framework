---
title: Authentication
description: Better Auth, wired to D1, with optional OAuth providers.
---

Every scaffolded app ships [Better Auth](https://better-auth.com) 1.7 with
the Drizzle adapter (sqlite provider), over the same `getDb()` client the
rest of your app uses. `lib/auth.ts` is a module-level instance that reads
its bindings from `cloudflare:workers`; `app/api/auth/[...all]/route.ts`
mounts it.

## Password hashing

Passwords are hashed with **PBKDF2-SHA256 at 100,000 iterations** via
WebCrypto — not Better Auth's default scrypt. Scrypt in pure JS costs
roughly 250–300ms of CPU per hash, well over the Workers free-plan CPU
budget; PBKDF2 at the same strength costs about 45ms. 100k is the highest
iteration count Workers' WebCrypto implementation accepts, and it's stored
alongside each hash so it can change later without breaking existing
users.

## Session gating

Two layers, on purpose:

1. **`proxy.ts`** does an optimistic, cookie-only redirect — no database
   call — so unauthenticated visitors bounce off protected routes
   immediately.
2. **`requireSession()` / `getSession()`** in `lib/session.ts` validate the
   session against D1 inside the page or route handler itself. The proxy
   is a fast, best-effort gate; these are the real one.

```ts
// a protected server component
import { requireSession } from "@/lib/session";

export default async function DashboardPage() {
  const session = await requireSession(); // redirects to /sign-in if absent
  return <p>Welcome, {session.user.name}</p>;
}
```

`scripts/e2e-auth.sh <url>` in the framework repo exercises the whole
flow — sign-up, duplicate/wrong-password rejection, sign-in, session,
protected routes, sign-out, and a forged cookie — against a running app.

## Base URL and allowed hosts

Set `BETTER_AUTH_URL` once you have a custom domain. Until then, Flare
allows `localhost:*`, `127.0.0.1:*`, and `<app>.*.workers.dev`, so local
dev on any port and your first `workers.dev` deploy both work with zero
configuration.

## Secrets

`flare create` writes a random `BETTER_AUTH_SECRET` to `.dev.vars`
(git-ignored). `flare deploy` generates and uploads a **separate** secret
for production the first time you deploy — it never reuses the local dev
value.

## OAuth providers

```bash
npx @flare/cli create myapp --auth-providers google,github
```

Adds a `socialProviders` entry per provider, but each one only activates
once **both** `<PROVIDER>_CLIENT_ID` and `<PROVIDER>_CLIENT_SECRET` are
set — so the app scaffolds, runs, and deploys before you have credentials
at all. Empty placeholders land in `.dev.vars` (so `wrangler types` types
them), and `.dev.vars.example` documents the console link and the
callback URL to register:

```text
<app URL>/api/auth/callback/<provider>
```

Sign-in and sign-up pages render one button per *configured* provider —
none, until you fill in the credentials.

## Admin access

The `admin` plugin adds `user.role` (default `"user"`) and ban fields.
`adminSession()` in `lib/admin.ts` decides who reaches `/admin`:

- any role in `ADMIN_ROLES` (`admin` and `staff` by default), or
- any role that may **read** at least one resource under its
  [policy](/guides/roles-and-policies/). A resource with no policy file is
  readable by every signed-in user, so while any resource has no policy,
  every signed-in user gets in (and sees only what they may read).

Signed-out visitors go to `/sign-in?next=…`; everyone else is sent to
`/?error=forbidden`. Grant a role:

```bash
npx flare user:role you@example.com admin --remote
```

See [roles & policies](/guides/roles-and-policies/) for restricting what
each role can do once they're in.
