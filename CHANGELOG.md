# Changelog

## 0.6.0

The release that takes the magic out.

### The resource engine moved into your app

The code that turns a descriptor into a working endpoint — query parsing,
validation, hooks, pagination, constraint errors and the database adapters,
about 800 lines — used to live in `@flaredev/core` where you could not read
it. It is now copied into your app at `lib/resource/`, the way
[shadcn/ui](https://ui.shadcn.com) copies a component. Generated routes
import `@/lib/resource`, not the framework.

Two commands come with that: `flare diff` shows how your copies differ from
the version Flare ships, and `flare update` applies it — refusing without
`--yes`, because overwriting your edits quietly is the one thing this design
must never do.

**Upgrading an existing app.** Nothing to do. The next `flare gen resource`
notices `lib/resource/` is missing and writes it, naming each file as it
goes. Your old routes keep working until you regenerate them, because
`@flaredev/core/server` still exports what it always did.

`createResourceStore` in your app now takes `rows` rather than
`table`/`getDb`, so the adapter is named at the call site:

```ts
rows: drizzleRows(products, getDb),          // Cloudflare
rows: prismaRows(prisma.product, prisma),    // Next.js
```

The copy in `@flaredev/core` keeps the old signature, so nothing breaks until
you move to the app's version.

### The Next.js stack does the rest of the verbs

`flare dev`, `build`, `start` and `deploy` work there now, delegating to Next
and the Vercel CLI instead of throwing. `flare deploy` is
`vercel deploy --prod` with your flags forwarded; `flare build` runs
`prisma generate` first. The Vercel CLI is a dev dependency, so there is
nothing to install globally.

### 404, error and loading pages

Both stacks get a public not-found and error page, dashboard versions that
keep the sidebar, and loading skeletons shaped like the page they wait for —
`gen resource` writes four per resource, with the column and field counts
taken from the descriptor.

### Smaller things

- File fields show a thumbnail in tables and on record pages instead of the
  raw object key.
- Dependencies install with pnpm whenever it is on the machine, whatever
  started the command. An app is ~340 packages: minutes under npm, seconds
  under pnpm. `--pm npm` overrides.
- `flare create` asks which stack in a terminal. The flag worked before; the
  question was never asked.
- A new Next.js app no longer carries `.dev.vars.example` or a README telling
  it to deploy with wrangler.
- `flare seed:resource` stopped printing a Durable Object warning about
  something seeds never touch.
- An agent skill (`npx skills add MUKE-coder/flare-framework@flare`), a
  generated `/llms.txt`, and a "Build with AI" prompt on every docs page.

## 0.5.1

The stack question in the interactive `flare create`, which 0.5.0 shipped
without, and the docs that tell people the choice exists.

## 0.5.0

The Next.js stack: `flare create --stack next` builds an app on Next.js 16,
Neon Postgres and Prisma 7, from the same descriptors, with the same
dashboard. `flare gen resource`, `flare migrate` and `flare seed` all work
there.
