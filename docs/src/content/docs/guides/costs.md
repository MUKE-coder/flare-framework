---
title: What it costs
description: What a real Flare app costs to run on Cloudflare, with measured numbers from the example shop rather than estimates.
---

The short answer: **$5 a month** for a small-to-middling app, and that $5 is
the Workers Paid subscription rather than usage. Most apps never pay a cent
beyond it. A hobby project can run at **$0** on the free plan, with one
serious caveat about CPU time covered below.

Prices here were checked against Cloudflare's pricing pages on 24 September
2026. Cloudflare publishes the current ones at
[workers](https://developers.cloudflare.com/workers/platform/pricing/),
[D1](https://developers.cloudflare.com/d1/platform/pricing/),
[R2](https://developers.cloudflare.com/r2/pricing/) and
[KV](https://developers.cloudflare.com/kv/platform/pricing/).

## What a Flare app uses

A new app binds five things, and only the first four cost anything:

| Service | What Flare uses it for |
| --- | --- |
| **Workers** | Runs the app — every page, API route and server action |
| **D1** | The database: your resources, users, sessions, audit log |
| **R2** | Uploads for `file:[…]` fields |
| **KV** | The data cache behind `cached()` |
| **Durable Objects** | Realtime channels, and the security monitor |

## The free plan, and the limit that actually bites

| | Free | Paid ($5/month) |
| --- | --- | --- |
| Worker requests | 100,000 / day | 10 million / month, then $0.30/million |
| **Worker CPU** | **10 ms per invocation** | 30 million CPU-ms/month, then $0.02/million |
| D1 rows read | 5 million / day | 25 billion / month, then $0.001/million |
| D1 rows written | 100,000 / day | 50 million / month, then $1.00/million |
| D1 storage | 5 GB | 5 GB, then $0.75/GB-month |
| R2 storage | 10 GB-month | $0.015/GB-month |
| R2 reads (Class B) | 10 million / month | $0.36/million |
| R2 writes (Class A) | 1 million / month | $4.50/million |
| KV reads | 100,000 / day | 10 million/month, then $0.50/million |
| **KV writes** | **1,000 / day** | 1 million/month, then $5.00/million |
| Durable Objects | SQLite-backed only | $0.15/million requests + $12.50/million GB-s |

Two rows are in bold because they are the two that decide whether the free
plan works for you.

**10 ms of CPU per invocation.** That is CPU, not wall-clock — waiting on the
database costs nothing. But server-rendering a React page is real CPU work,
and a dashboard page with a table, a chart and four stat cards will sail past
10 ms. When a Worker exceeds it, Cloudflare returns a 503 with `error code:
1102`, "Worker exceeded resource limits". If you see intermittent 503s on a
free-plan app, this is almost always why. **Budget the $5.**

**1,000 KV writes a day.** Every cache miss writes an entry, and every record
you save drops the entries tagged for that resource, so the next page view
writes them again. An afternoon of editing records in the dashboard can spend
a free day's KV writes. On the paid plan the allowance is 1 million a month
and this stops mattering.

## What the example shop actually used

These are real figures from `shop-db`, the database behind the
[shop tutorial](/tutorials/shop/), after a day that involved far more traffic
than a small shop would see — dozens of sign-ups, hundreds of page loads,
orders placed through the till and the shop front, file uploads, and an
automated test suite run repeatedly:

```
database_size      274 kB
read_queries_24h   16,619
write_queries_24h  108
rows_read_24h      21,615
rows_written_24h   358
```

21,615 rows read against a free allowance of 5,000,000 a day: **0.4%**. 358
rows written against 100,000: **0.4%**. The database holding a catalogue,
customers, orders and the audit log is **274 kB** against 5 GB.

Note the ratio: 16,619 queries but only 21,615 rows read — about 1.3 rows per
query. That is what indexed, cached, paginated reads look like, and it is why
D1 costs nothing at this size.

## Three scenarios

Modelled from the measured numbers above, on the **paid plan**:

**A small internal tool — 20 people, 2,000 page views a day.**
Requests 60,000/month against 10 million. Rows read maybe 2 million/month
against 25 billion. Storage under a gigabyte. **$5/month**, all of it the
subscription.

**A busy shop — 100,000 page views a month, 5 GB of product images.**
Requests 100,000 plus asset requests. Rows read perhaps 20 million/month —
0.08% of the included 25 billion. R2 at 5 GB is $0.075/month once past the
10 GB free tier, which it isn't. **$5/month.**

**Something genuinely large — 10 million page views a month, 1 TB in R2.**
Requests: 10 million included, so the overage is on what you serve past that.
D1 rows read at 5 per view is 50 million — still inside 25 billion. R2 storage
1 TB is **$15/month**. Egress from R2 is **free**, which is the line item that
would dominate this bill on AWS. Call it **$25–40/month** with CPU overage.

The shape to take away: Cloudflare's included allowances are large enough
that the $5 subscription is the bill until you are properly busy, and R2's
free egress is what keeps a file-heavy app cheap.

## The things that cost more than you would guess

**`count(*)` reads every row.** Measured on the shop's products table: a
`select count(*)` reports 8 rows read for 8 products. On a table with a
million rows, one stat card is a million rows read. Cached for a minute, that
is up to 1,440 million-row scans a day — 40% of the *paid* daily average, from
one number on one page. Flare caches these counts and the resource table caps
its count at 10,000, but if you write your own dashboards, count with care.

**The audit log writes a row per action.** Every create, update and delete in
the dashboard writes an `audit_log` row. That is the point of it, but it is
also D1 writes and storage that grow forever. Prune it if you do not need
years of history.

**Durable Objects bill for duration, not just requests.** A realtime channel
with someone connected is billed by GB-second while it is alive. Flare only
spins one up when something subscribes, so an app that never uses realtime
never pays for it.

## What Flare does to keep it down

- **Cached counts and stats.** The dashboard's numbers go through `cached()`
  with a short TTL and a per-resource tag, so a write drops exactly the
  entries it invalidates rather than the whole cache.
- **Capped counts.** A resource table stops counting at 10,000 and says
  "10,000+", so paging a large table never scans it.
- **Cursor pagination.** Deep pages use a keyset cursor rather than `OFFSET`,
  so page 400 reads the same number of rows as page 1.
- **Indexes by default.** `gen resource` indexes `created_at`, the default
  sort field, filterable enums and every `belongsTo`, which is what keeps
  reads at ~1.3 rows per query.
- **Uploads go straight to R2.** The browser PUTs to a signed URL, so a
  100 MB file never passes through the Worker and costs no CPU.

## Can I self-host it?

Partly, and it is probably not worth it. See
[self-hosting](/guides/self-hosting/) for the honest version.

## When Cloudflare stops being the cheap option

Be fair about where this breaks down:

- **Heavy compute.** Image processing, PDF generation, long analytical
  queries. CPU-ms adds up and Workers are not the place for it.
- **Relational queries D1 can't do well.** D1 is SQLite. If you need window
  functions over millions of rows, full-text search at scale, or Postgres
  extensions, you want Postgres — and the
  [Next.js stack](/start/stacks/) exists for that.
- **Egress-light, compute-heavy workloads.** R2's free egress is worth most
  when you serve a lot of bytes. If you serve very few, that advantage is
  theoretical.
