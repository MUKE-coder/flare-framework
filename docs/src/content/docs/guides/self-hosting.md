---
title: Self-hosting
description: What self-hosting a Flare app really involves, which parts are portable, and when it is worth it.
---

The honest answer: **you can, and for most people it isn't worth it.**

Not because anything is locked shut — the runtime Flare targets is open
source and runs anywhere — but because the parts you would have to replace
are the parts you get for free, and replacing them costs more in attention
than the hosting saves in money. [Costs](/guides/costs/) has the numbers: a
small app is $5 a month.

Here is what each piece would actually take, so you can judge for yourself.

## The Worker itself: portable

Workers run on [workerd](https://github.com/cloudflare/workerd), Cloudflare's
runtime, which is Apache-2.0 and ships as a Docker image. `flare build`
produces a standard Worker bundle, and workerd will serve it on your own box.

This part is genuinely fine.

## The bindings: the actual work

Your app doesn't talk to "Cloudflare", it talks to four bindings. Each needs
something behind it:

| Binding | What Flare uses it for | Self-hosted equivalent |
| --- | --- | --- |
| `DB` (D1) | Everything relational | SQLite directly, or Postgres — but Drizzle's D1 driver would need swapping for a Postgres one, and the generated SQL migrations are SQLite dialect |
| `STORAGE` (R2) | `file:[…]` uploads | MinIO, or any S3-compatible store, behind the same signed-URL helpers |
| `VINEXT_KV_CACHE` (KV) | The `cached()` data cache | Redis, or an in-memory map if you run one instance |
| `FLARE_REALTIME` (Durable Object) | Realtime channels | The hardest one. Durable Objects give you a single-threaded, consistent, addressable actor with its own storage. Redis pub/sub gets you the messaging but not the consistency guarantees |

Flare does not ship adapters for any of these. You would be writing and
maintaining them.

## What you would be taking on

Things the platform currently does that become yours:

- **TLS certificates** and renewal
- **A CDN**, or accepting that everything is served from one place
- **DDoS protection** — the thing Cloudflare is actually famous for
- **Database backups**, and testing that they restore
- **Running it in more than one region**, if you want that
- **Patching** workerd, the OS, and everything underneath

Set against a $5 subscription.

## When self-hosting genuinely makes sense

There are real reasons, and they aren't about money:

- **Data residency.** A regulator, a contract or a client says the data
  stays on specific hardware in a specific country.
- **Air-gapped deployment.** It runs inside a network with no route to the
  internet.
- **You already run infrastructure.** If there is a Kubernetes cluster and a
  team who looks after it, one more service is a small addition.

If one of those applies, start from workerd in Docker, replace the bindings
one at a time, and expect the Durable Object to be the piece that takes the
longest.

## The middle option most people want

Usually "can I self-host?" means "I don't want to be locked in." For that,
look at what is actually portable:

- **Your descriptors, hooks, computed fields and policies** are ordinary
  TypeScript with no Cloudflare in them.
- **Your React components** are React.
- **Your schema and migrations** are Drizzle and SQL.
- **Your data** comes out with `wrangler d1 export`, as SQL.

What is Cloudflare-specific is the deployment target and four bindings —
maybe a few dozen files in `lib/`, most of them thin. That is a real answer
to lock-in, and a much cheaper one than running the platform yourself.

If you would rather not be on Cloudflare at all, Flare also targets
[Next.js on Vercel with Postgres](/start/stacks/), which is a different set
of trade-offs rather than a smaller one.
