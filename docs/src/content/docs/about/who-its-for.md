---
title: Who Flare is for
description: The people and projects Flare suits, the ones it doesn't, and how to tell which you are in about a minute.
---

## The short test

Does your application have **things** — orders, patients, invoices, products —
that people **list, search, create and edit**, behind a **login**, with
different people allowed to do different things?

If yes, Flare will save you weeks. If no, it probably will not help much.

## Who it is for

### The solo developer with a client project

You have quoted six weeks for an internal tool. Two of those weeks are auth,
an admin table, file upload, CSV export and a password reset screen — none of
which the client will ever notice, all of which they will notice missing.

Flare does those two weeks in an afternoon. The other four are the part they
are paying for.

### The small team shipping an internal tool

Ops needs a system to track something. It has to exist by Thursday, be correct
about permissions, and not become someone's second job to maintain.

Generated code, a policy file per resource, an audit log of every write, and a
CLI that regenerates when the schema changes.

### The founder validating something

You need a real product with real users and real auth this month, and you do
not yet know which parts matter. Deleting a resource is one command. Adding a
field is one command and a migration.

### The team that has built this five times

You know exactly what a good admin table looks like. You have written
pagination, role checks and CSV export more than once and would rather not
again — but you will not accept a black box that does them nearly right.

Flare puts that code in your repository. Read it, change it, keep what you
like.

### Anyone working with an AI agent

A descriptor is an ideal thing to hand a coding agent: small, declarative, one
obvious right answer. The generated code is consistent, so an agent that
learns one resource knows them all. There is
[a skill](/guides/build-with-ai/) that teaches one the rules.

## Who it is not for

### You need a public marketing site

Use Astro, or plain Next.js. Flare's public pages are a courtesy, not the
point.

### Your data is not table-shaped

Flare assumes resources with fields and relations. A graph database, a
time-series store, an event-sourced ledger — the descriptor will fight you.

### You want a UI to define your models

That is a CMS or a no-code builder. Flare's model lives in TypeScript, in git,
and changes through a CLI. A feature for engineers; an obstacle for everyone
else.

### You have a large existing application

Flare generates a new app; it does not retrofit onto an existing schema. You
can point it at an existing database, but you would be describing your tables
a second time.

### You will not accept the stack

Better Auth, Drizzle or Prisma, Tailwind, shadcn/ui, Cloudflare or Vercel.
Each is replaceable because the code is yours — but if you would replace
*most* of them, start from something thinner.

## The honest comparison

| | |
| --- | --- |
| **Laravel + Filament** | The closest comparison, and the inspiration. More mature, bigger ecosystem, PHP. Flare is the same idea in TypeScript, at the edge. |
| **Rails + ActiveAdmin** | Same trade. Rails reflects at runtime; Flare generates files you read. |
| **Next.js alone** | More control, more weeks. Flare *is* a Next.js app — one where the boring two-thirds is written. |
| **Supabase / Firebase** | They host a backend and you write the front end. Flare gives you the code for both and you host it. |
| **Payload, Strapi, Directus** | Content-first, with a UI for modelling. Flare is code-first, with the model in git. |
| **Prisma or Drizzle alone** | A database toolkit — not endpoints, screens, auth or policies. Flare uses one of them underneath. |

## Still not sure?

The quickstart takes about five minutes and produces a working, authenticated
CRUD app. That is a faster answer than any page can give you.

```bash
pnpm create flare-framework myapp
```

If it feels like it is fighting you, it is not for this project — and that is
a useful thing to learn in five minutes.
