---
title: Caching
description: The KV data cache, on by default, invalidated automatically.
---

## Data cache — on by default

`vite.config.ts` registers vinext's `kvDataAdapter` against a
`VINEXT_KV_CACHE` namespace with no id — Wrangler provisions it on first
deploy and simulates it locally, the same way it does D1 and R2. Entries
live for a day unless revalidated; a colo may serve its own cached copy
for up to 60 seconds after a write elsewhere.

`lib/cache.ts` is the surface you use:

```ts
import { cached, TTL, resourceTag } from "@/lib/cache";

const dealCount = cached(
  () => db.select({ count: count() }).from(deals),
  ["deal-count"],
  { tags: [resourceTag("Deal")], revalidate: TTL.medium }, // 5 min
);
```

- `cached(fn, keyParts, { tags, revalidate })` wraps `unstable_cache`,
  defaulting to `TTL.medium` (5 min). `TTL.short` is 60s, `TTL.long` 1h.
- `resourceTag("Deal")` → `resource/Deal`;
  `recordTag("Deal", id)` → `resource/Deal/<id>`.
- `revalidateResource(event)` drops both tags immediately (`{ expire: 0 }`
  — no stale-while-revalidate window after a write).

## Invalidation is automatic — you don't wire it per-resource

`createResourceStore` accepts an `onChange` callback, invoked after every
successful create/update/delete and before the operation returns.
Generated API routes and the admin's server actions both pass
`revalidateResource` already, so a write through **either** path
invalidates the cache without your app code remembering to call anything.
The admin's own record counts go through `cached()` too
(`recordCount()` in `lib/admin.ts`). The `/admin` pages themselves are
never cached: they sit behind auth and read the session, so they render
dynamically on every request, and in production they are served with
`cache-control: no-store, must-revalidate`. That header comes from the
page being dynamic, not from anything Flare sets.

## Tag naming

Flare's tags use `/` as the separator (`resource/Deal`,
`resource/Deal/<id>`). Tags can't contain `:`, `\`, or control characters — vinext's KV adapter
silently drops a tag like that, leaving the entry stored but untaggable
(nothing can ever revalidate it). `cached()` throws immediately instead of
letting that happen quietly.

## The CDN cache is off, on purpose

Only the KV data cache is configured. vinext's page-level Workers Cache
(`cdnAdapter`) is **off**, and turning it back on is on the framework's
Backlog. In the current beta,
any page that redirects breaks behind it (`Too many redirects`), and the
experimental warm-cache deploy step failed most routes in testing. Your
pages stay CDN-ready regardless — the root layout applies the saved theme
with an inline script rather than reading `cookies()`, since a layout that
reads cookies makes every page beneath it dynamic. The adapter goes back
on once vinext fixes this upstream; see `phases.md`'s Backlog in the
framework repo.
