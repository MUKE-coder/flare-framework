# Changelog

## 0.7.1

**Image uploads on the Next.js stack stored nothing, and said they worked.**

Three faults in the same few lines of `lib/storage.ts`, found by uploading an
actual PNG rather than reading the code:

- The request body arrives as a stream, and S3 refuses a PUT it cannot measure
  — `411 MissingContentLength`. It is buffered now, and the length is set by
  hand, because Next patches the global fetch and that fetch does not derive
  `content-length` even from a buffered body.
- The adapter never looked at the response, so a rejected upload returned 201
  and the field stored a key pointing at nothing.
- The whole object key was passed through `encodeURIComponent`, turning
  `products/2026/09/a.png` into one segment with `%2F` in it. Each segment is
  escaped on its own now.

Verified against a real S3 server: signed, uploaded, read back, byte-identical.

**`flare user:role` works on the Next.js stack.** It looked for a D1 database
and failed with "No d1_databases in wrangler.jsonc" — on an app that has no
wrangler.jsonc. It goes through the app's Prisma client now, and says so when
no account has that email instead of silently changing nothing.

## 0.7.0

**Routes say what they do.**

0.6.0 moved the engine into your app, but a generated route still read as
eighteen lines of wiring: `createResourceHandlers({ ... })`, then four
exports. The code was yours and you still had to be told where it was.

A route now contains its own handlers. Each one shows the policy check, the
cross-origin guard, the JSON read, the store call and the response it builds,
in the order they happen:

```ts
export async function POST(request: Request): Promise<Response> {
  try {
    const denied = await authorize({ request, resource: productResource, action: "create" });
    if (denied) return denied;
    if (crossOrigin(request)) return problem(403, "Cross-origin request blocked.");

    const read = await readJson(request);
    if ("response" in read) return read.response;

    const result = await store.create(read.body);
    if (!result.ok) return failureResponse(result);

    const location = `${new URL(request.url).pathname.replace(/\/$/, "")}/${result.data.id as string}`;
    return Response.json(result.data, { status: 201, headers: { location } });
  } finally {
    await drain(request);
  }
}
```

The guards are named functions in `lib/resource/http.ts` rather than repeated
per route, so nothing is duplicated and nothing is lost: the CSRF check, the
content-type check, and the body drain that stops an early return breaking the
*next* request through wrangler's dev proxy.

`createResourceHandlers` is still there and still works. Routes generated
before this release keep running; regenerate one to get the longer form.

**Upgrading.** Run `flare gen resource <Name> --force` per resource to rewrite
its routes, or leave them. `flare update` brings in `lib/resource/http.ts`.

## 0.6.2

**The Prisma engines download could fail, and took the install with it.**

0.6.1 allowed `@prisma/engines` to run its postinstall, which downloads engine
binaries. On a slow link, behind a proxy, or for any other reason the download
fails, `pnpm install` failed with it — after the packages were already on disk,
so the app looked installed and wasn't.

It is refused now. A Flare app on the Next.js stack talks to Postgres through a
driver adapter, so it never needs what that postinstall fetches. Confirmed
without it: `prisma generate`, `prisma validate`, `prisma migrate diff` and
`next build` all work, and the install is faster.

## 0.6.1

**A new Next.js app couldn't finish its first install.**

`pnpm install` stopped with `ERR_PNPM_IGNORED_BUILDS`, naming four versions
of esbuild. 0.6.0 gave each stack its own list of dependency build scripts to
allow, and esbuild was left off the Next.js one — the Vercel CLI depends on
it, so every new Next.js app hit this on the very first command after
scaffolding.

The two lists are now one list, the union of what either stack needs. Naming
a package a stack doesn't install costs nothing, because the entry is never
consulted; leaving one out breaks the first thing somebody runs. Tests pin
both stacks' entries, and the fix was confirmed by installing both for real
rather than reading the list again.

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
