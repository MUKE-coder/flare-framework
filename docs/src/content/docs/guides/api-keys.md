---
title: API keys
description: A credential for clients that cannot hold a cookie — a cron job, a script, a mobile app, a partner integration — that acts as the user who made it.
---

A session cookie works for a browser and for nothing else. Everything else —
a nightly sync, a deploy script, a mobile app, somebody else's server calling
yours — needs a credential it can put in a header.

```bash
npx flare gen apikeys
npx flare migrate          # or: npx prisma migrate dev   (Next.js stack)
```

Then mint one at **/dashboard/api-keys**, and use it:

```bash
curl https://myapp.workers.dev/api/invoices \
  -H "Authorization: Bearer flare_live_…"
```

`x-api-key: <key>` works too, for clients that reserve `Authorization` for
something else.

## A key is its user

This is the whole model, and it is worth being precise about: a key does not
have permissions. It *is* the user who created it. Same role, same policy,
and with [`own`](/guides/roles-and-policies/#per-record-ownership) the same
rows.

| | What the key can do |
| --- | --- |
| Role checks | Exactly what that user's role allows. A key made by a `staff` user is refused wherever `staff` is. |
| Per-record ownership | Only that user's rows. Another user's record is a `404`, as it is for them. |
| Hooks | Run with that user in context, so `beforeCreate` sees the same thing it would in the browser. |

So there is nothing to configure per key, and no way to mint one that can do
more than you can. If a key should be able to do less, that is a second user
with a narrower role — not a setting on the key.

## What the dashboard shows

**/dashboard/api-keys** lists the keys you own: the name you gave it, the
first few characters, how many requests it has served, when it was last used,
and when it expires. Creating one shows the key **once** — the table holds a
hash, so there is nothing to show a second time. Revoking takes effect on its
next request.

A key can be given an expiry in days. An unattended job is the main reason
keys exist and also the main reason they leak, so a key that stops working on
its own is usually the right choice for one.

## What runs where

Better Auth's [`@better-auth/api-key`](https://better-auth.com/docs/plugins/api-key)
plugin owns the `apikey` table, the minting, the hashing, expiry, revocation
and a per-key rate limit. `flare gen apikeys` adds it to `lib/auth.ts`, puts
the table in your schema, writes the dashboard screen, and leaves the one
piece Better Auth hands back to the application: turning a verified key into
a user.

That piece is `lib/api-keys.ts`, which is [in your app](/concepts/no-magic/):

```ts
const verified = await auth.api.verifyApiKey({ body: { key }, headers });
if (!verified?.valid) return null;
const user = await (await auth.$context).internalAdapter.findUserById(verified.key.referenceId);
```

`lib/api.ts` calls it from both `authorize()` and `currentUser()` — the first
decides whether the role may act at all, the second is what the store reads to
scope rows. Every app has that call already, whether or not keys are switched
on, so turning them on does not change the shape of a route.

:::note[Why not the one-line option]
The plugin has an `enableSessionForAPIKeys` flag that mocks a session for any
request carrying a valid key. Its own documentation says it is not recommended
for production, so `flare gen apikeys` leaves it off and verifies the key
explicitly instead. It is a few more lines, in a file you can read.
:::

## CSRF, and why a key is not blocked by it

Every generated write calls `crossOrigin(request)` first. That guard exists
because a browser attaches cookies to a cross-site request automatically; it
refuses a request whose `Origin` is some *other* site.

A script sends no `Origin`, so it passes. A page on another origin cannot use
your API at all — nothing here answers a CORS preflight — so there is no case
where the guard needed an exception for keys, and none was made.

## Rate limits

The plugin rate-limits each key. `flare gen apikeys` sets 600 requests a
minute, because its default of ten a day is aimed at a different thing than a
sync job. It is an argument in `lib/auth.ts`:

```ts
apiKey({ rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 600 } }),
```

This is per key, and separate from any edge rate limiting
[`flare gen security`](/guides/security/) adds.

## What it is not

**Not a scoped token.** There are no per-key permissions here. The plugin
supports them; Flare does not wire them up, because a key that can do less
than its user is a second role, and roles already exist.

**Not machine-to-machine without a user.** Every key belongs to a user
account. A service that is nobody still needs an account of its own — make
one, give it the narrowest role that works, and mint the key as that account.

**Not a way around a policy.** If a key gets a `403`, the answer is the
user's role, not the key.
