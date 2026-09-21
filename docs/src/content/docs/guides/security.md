---
title: Security
description: "Ban lists, rate limits, abuse detection and a security dashboard, at the Worker and (optionally) the zone edge."
---

`flare gen security` protects every request before your app code runs. It also
adds a dashboard at `/admin/security` where you can see what was blocked and ban
or unban IPs by hand.

```sh
npx flare gen security
npx flare migrate
```

## Two layers

| Layer | Runs | Needs |
| --- | --- | --- |
| **Worker** (always on) | In `worker/index.ts`, around every request: the ban list, the API rate limit and the abuse detectors. | Nothing. It works on any plan, `workers.dev` included. |
| **Zone** (optional) | At Cloudflare's edge, before the Worker: IP Access Rules for bans, plus rate-limiting and WAF custom rules. | Your app on a custom domain, and an API token scoped to that zone. |

With the zone layer configured, every ban goes to both layers. The Worker layer
refuses a banned IP immediately, and the zone rule stops its traffic from
reaching the Worker at all.

## What it generates

- **`security.config.ts`**: your detectors, the rate limit and the zone rules.
  It's written once and never overwritten.
- **The `SecurityEvent` resource**: one row per tripped detector and per
  manual ban or unban. Admin and staff can read events; only admins can
  change them, which includes banning.
- **`lib/security.ts`**: the guard `worker/index.ts` calls on every request.
- **`/admin/security`**: active bans with their blocked-request counts, recent
  events, zone firewall activity, and the ban and unban controls. A
  **Security** link is added to the admin sidebar.
- **Bindings in `wrangler.jsonc`**, added without touching your other settings:

| Binding | Kind | Used for |
| --- | --- | --- |
| `FLARE_SECURITY` | KV | The ban list. A ban expires through the key's TTL. |
| `FLARE_SECURITY_MONITOR` | Durable Object (`SecurityMonitor`) | Per-IP counters: one object per IP, so counts are exact. |
| `FLARE_RATE_LIMIT` | Rate limiting | 120 requests a minute per IP on `/api` (change `simple.limit` to adjust). |

You don't need to create any of these first. Wrangler provisions the KV
namespace on the first deploy.

## Detectors

A detector counts matching responses per IP in a sliding window. The request
that reaches the threshold trips it. Each trip is logged as a `SecurityEvent`,
and if the detector has `ban`, the IP is banned for that long.

```ts
// security.config.ts
import { DEFAULT_DETECTORS, defineSecurity } from "@flare/core/security";

export default defineSecurity({
  allow: ["198.51.100.10"], // never banned or rate-limited
  detectors: [
    ...DEFAULT_DETECTORS,
    {
      name: "export-scraping",
      description: "Bulk exports from one IP",
      match: { method: "GET", path: /^\/api\/exports\//, status: [200] },
      threshold: 20,
      windowSeconds: 60,
      ban: { seconds: 3600 },
      severity: "medium",
    },
  ],
  rateLimit: { binding: "FLARE_RATE_LIMIT", paths: /^\/api\// },
});
```

The defaults are:

| Detector | Matches | Trips at | Action |
| --- | --- | --- | --- |
| `login-brute-force` | `POST /api/auth/sign-in/email` answered 401 or 403 | 5 in 60s | Ban for 1 hour (high severity) |
| `checkout-abuse` | `POST /api/billing/checkout` | 10 in 60s | Ban for 30 minutes |
| `api-scraping` | Any `GET /api/…` except auth and health | 300 in 60s | Log only |

Counting happens after the response has been sent (in `waitUntil`), so
detectors never slow a request down. A banned IP gets `403 Access denied.`, and
a rate-limited one gets `429` with `Retry-After`.

The ban list lives in KV. The isolate that sets a ban refuses the IP right
away. Other isolates pick up the ban once KV propagates it, usually within
seconds and at most about a minute later. Unbans propagate the same way.

The client IP comes only from `CF-Connecting-IP`. Cloudflare's edge sets that
header itself, so a client can't forge it in production. If a request has no
such header, it passes through unchecked.

## Banning by hand

On `/admin/security`, an admin enters an IP (IPv4 or IPv6), a reason and a
duration: 1 hour, 24 hours, 7 days, or until unbanned. **Unban** lifts the ban
from both layers and resets that IP's counters. Both actions are logged as
SecurityEvents that name the admin.

From server code:

```ts
import { security } from "@/lib/security";

await security().ban("203.0.113.7", "Chargeback fraud", 86_400, null);
await security().unban("203.0.113.7");
```

## The zone layer

1. Put the app on a domain in your Cloudflare account, for example with a
   `routes` entry of `{ "pattern": "app.example.com", "custom_domain": true }`
   in `wrangler.jsonc`.
2. Create an API token scoped to **that zone only** with these permissions:
   Zone → WAF: Edit, Zone → Firewall Services: Edit, Zone → Analytics: Read and
   Zone → Zone: Read.
3. Deploy with both values in the shell:

```sh
FLARE_SECURITY_ZONE_ID=<zone id> FLARE_SECURITY_API_TOKEN=<token> npx flare deploy
```

`flare deploy` then does two things:

- It pushes `zone.rateLimits` and `zone.customRules` to the zone.
- It uploads both values as Worker secrets, so the app's bans become zone IP
  Access Rules too.

Every rule Flare writes is tagged `flare:<app>:<name>`. On each deploy, Flare
replaces only its own tagged rules; rules you or other apps created in that
zone stay as they are. Flare never creates account-wide rules. To skip this
step, run `flare deploy --skip-security`.

```ts
zone: {
  // The Free plan allows one rate-limiting rule, with a 10-second period.
  rateLimits: [
    { name: "sign-in", expression: 'http.request.uri.path eq "/api/auth/sign-in/email"', requests: 10, periodSeconds: 10, mitigationSeconds: 10 },
  ],
  customRules: [
    { name: "block-scanners", expression: '(http.request.uri.path contains "/wp-login.php") or (http.request.uri.path contains "/.env")', action: "block" },
  ],
},
```

With the zone layer on, the dashboard also shows the zone's firewall events
for the last 24 hours, and marks bans that exist as zone rules.

## Testing locally

The local Workers runtime (`flare start`) passes a `CF-Connecting-IP` header
through, so you can simulate an attacker from one address:

```sh
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "%{http_code} " -X POST localhost:8787/api/auth/sign-in/email \
    -H "content-type: application/json" -H "origin: http://localhost:8787" \
    -H "CF-Connecting-IP: 198.51.100.7" -d '{"email":"x@example.com","password":"wrong-password"}'
done
# 401 401 401 401 401 403
```
