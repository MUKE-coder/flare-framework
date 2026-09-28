---
title: Philosophy
description: Six things Flare believes, what each one costs, and where the line is between what it generates and what is yours.
---

Every framework is an argument about what should be automatic. Here is
Flare's, with the prices attached.

## 1. Describe a thing once

A product has a name, a price and a category. Say it once, and the table, the
API, the validation and the admin screens follow. Saying it four times — in a
migration, a model, a form and a serialiser — is not expressive, it is
transcription, and the four copies drift.

**The cost:** a descriptor has to be expressive enough for real work, or you
end up fighting it. Flare's answer is that hooks, computed values and
hand-written endpoints are first-class, not escape hatches.

## 2. Generate files, don't reflect at runtime

Flare writes real files at a moment you chose. It does not inspect your models
on boot and assemble behaviour from metadata.

A generated file can be read, diffed, stepped through in a debugger and blamed
in git. A stack trace names your code. There is no runtime layer to learn
before you can answer "why did it do that?"

**The cost:** more files in your repository, and regeneration is something you
run rather than something that happens.

## 3. Copy code in, don't hide it in a package

The ~900 lines that turn a request into a response live in your app, the way
[shadcn/ui](https://ui.shadcn.com) copies a component instead of shipping one.

**The cost, stated plainly:** a fix in a later release does not reach you on
its own. `flare diff` and `flare update` exist precisely because that is a
real bill, not a footnote. We think reading and changing your own code is
worth it. If you disagree, that is a reasonable position — it is a trade, not
a free lunch.

## 4. The boring parts should already be done

Auth is not interesting. Nor is pagination, file upload, CSV export, an audit
log, a password reset screen, or a 404 page. They are table stakes that cost
weeks.

A new Flare app has all of them, working, before you write a line. What is
left is the part that is actually your application.

**The cost:** opinions. Better Auth, not the auth library you would have
picked. Tailwind and shadcn/ui, not yours. Where those are wrong for you, the
code is in your repo and you can change it — but you start from someone else's
choice.

## 5. Say what it costs and what it cannot do

Every framework's docs list what it does. Flare's also say
[what it costs to run](/guides/costs/), with measured numbers, and
[what each stack cannot do](/start/stacks/).

The full-text search page says the index is *slower* than a plain `LIKE` for a
common word, with the measurements, because that is true and you would rather
know. The Next.js stack's page says realtime does not work there.

A framework that only tells you the good parts is a framework you will
discover the bad parts of at the worst moment.

## 6. Fast should be the default, not a later project

Cursor pagination, capped counts, a cache that invalidates on writes, indexes
on the columns you sort by — these are in the generated code from the first
day, not a performance sprint after launch.

**The cost:** a little more generated code than the naive version, and a few
places where the simple thing was rejected for the fast one.

## The line

Flare generates the part that is the same in every application. You write the
part that is your application.

| Flare's | Yours |
| --- | --- |
| Tables, migrations, validators | What the fields are |
| REST endpoints and their plumbing | What happens on a write (`hooks`) |
| Admin tables, forms, record pages | What the rules are (`policies`) |
| Auth screens, uploads, CSV, audit log | Anything CRUD does not cover |
| Pagination, caching, error mapping | The bits that make it your product |

When the line is in the wrong place for you, move it: edit the generated code
outside its markers, edit the engine in `lib/resource/`, or delete a piece
entirely. Nothing here is load-bearing in a way you cannot see.

## What Flare is not

- **Not a CMS.** No page builder, no content types in a UI. It generates code
  you own.
- **Not a no-code tool.** You write TypeScript. The descriptor is TypeScript.
- **Not a backend-as-a-service.** Your database, your account, your bill.
- **Not a lock-in.** The output is an ordinary Next.js or vinext app with
  ordinary Drizzle or Prisma. Stop using the CLI and everything keeps working.

That last one is the real test. If deleting the framework leaves you with a
working application, the framework was honest about what it did.
