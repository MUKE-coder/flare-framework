---
title: Installation
description: Prerequisites and every way to install the Flare CLI.
---

## Prerequisites

- **Node.js 22+** and a package manager: npm, pnpm, yarn or bun. Flare detects
  the one you use to run it and scaffolds the app with that manager's lockfile.
- **A Postgres database**, on the Next.js stack — which is the default. Docker
  Desktop is the easy answer: every new app ships a `docker-compose.yml` and a
  `.env` already pointing at it. A [Neon](https://neon.tech) connection string
  works just as well.
- **Nothing**, on the Cloudflare stack. Wrangler simulates D1, R2 and KV
  locally, so there is no database to provision and no account to make. You
  need `wrangler login` only when you run `flare deploy`.

Neither stack needs an account to create an app or run it.

## Create an app (no install)

The fastest start. This runs the latest CLI once and scaffolds the app:

```bash
pnpm create flare-framework myapp
```

Or with your package manager of choice:

```bash
npm create flare-framework@latest myapp
yarn create flare-framework myapp
bun create flare-framework myapp
```

Whichever you start with, the dependencies are installed with **pnpm** when
it's on your machine, and the command says so when it does. An app is around
340 packages; pnpm does that in seconds where npm takes minutes, and its
shared store means the second app is quicker still. `--pm npm` (or `yarn`,
`bun`) overrides it.

On the Cloudflare stack the first install downloads the Workers runtime and the
build toolchain (about 300 packages), so it takes a few minutes; on the Next.js
stack it's Next, Prisma and the UI packages instead. pnpm is the quickest
either way: its shared store means your second Flare app installs in seconds.

`flare create` flags pass straight through, e.g.
`npm create flare-framework@latest myapp -- --auth-providers google,github`, so
`-- --stack next` picks the stack without being asked
([Choosing a stack](/start/stacks/)).

Every app lists `@flaredev/cli` as a dev dependency, so inside it you run
`npx flare …` (or `pnpm flare …`) and each project keeps its own CLI version.

## What it asks you

In a terminal, `create` asks five questions. Each has a flag, and `--yes`
takes the default for anything you don't answer.

| It asks | Default | Flag |
| --- | --- | --- |
| Where will it run? | Next.js | `--stack next\|cloudflare` ([stacks](/start/stacks/)) |
| Where do uploaded files go? | Cloudflare R2 | `--storage r2\|disk\|cloudinary\|uploadthing` ([storage](/storage/)) |
| Pick a look | default | `--theme` ([themes](/guides/themes/)) |
| How can people sign in? | all methods | `--auth` ([auth](/guides/auth/)) |
| Social sign-in? | none | `--auth-providers` |

Answering nothing is a reasonable app: Next.js, Postgres, R2 against local
MinIO, email and password sign-in. The storage answer is the one worth a
thought — it decides which variables land in your `.env`, and picking
Cloudinary or UploadThing installs that provider's SDK with everything else.
The full list of flags is in the [CLI reference](/reference/cli/#flare-create-dir).

Nothing here is permanent except the stack, which is recorded in
`package.json`. The theme, the sign-in methods and the storage driver are all
one line to change afterwards.

## If it scaffolds an old version

The day a Flare version is released, `pnpm create flare-framework` keeps
giving you the one before it. The banner says so:

```
Flare v0.12.0 · myapp        # when 0.12.1 is the latest
```

This is pnpm doing what it is designed to do. Since pnpm 11,
**`minimumReleaseAge` defaults to 1440 minutes** — 24 hours — and pnpm refuses
to resolve a tag to anything published more recently than that. It falls back,
silently, to the newest version outside the window. It is a supply-chain
measure: a package compromised and published at 3am is not one you install at
4am.

Two things that look like fixes and are not:

- **`@latest` does not help.** `latest` is the tag pnpm is declining to follow.
- **Clearing the cache does not help.** It is not a caching problem. Wiping
  pnpm's `dlx` directory and its registry metadata changes nothing; the next
  resolution reads a packument that correctly says `latest: 0.12.1` and still
  picks `0.12.0`.

Ask for the version by number, which bypasses the tag entirely — the
[command builder](/start/builder/) does this for you, always pinning the
version these docs describe:

```bash
pnpm create flare-framework@0.12.1 myapp
```

Or use npm, which has no such policy:

```bash
npm create flare-framework@latest myapp
```

For an ordinary `pnpm add` you can also set the window to zero —
`pnpm add some-package --config.minimumReleaseAge=0` — but prefer pinning the
version. The setting exists for a reason, and turning it off applies to every
package in the command, not just the one you were impatient about.

Wait 24 hours and the plain command is right again, with no action from you.

### A genuinely stale cache

Separately, `pnpm create` and `npm create` do cache the package they run, which
can keep an old copy around after the release-age window has passed. If the
version is more than a day old and still wrong:

```bash
# macOS / Linux
rm -rf "$(dirname "$(pnpm store path)")/dlx"
# Windows PowerShell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\pnpm-cache\dlx"
```

npm's equivalent is `npm cache clean --force`.

An app already created is unaffected either way — it pins its own
`@flaredev/cli` in `devDependencies`, and `npx flare --version` inside it tells
you which.

## Install the `flare` command globally

If you'd rather have `flare` on your PATH:

```bash
npm install -g @flaredev/cli
# or
pnpm add -g @flaredev/cli
```

### Install script: macOS and Linux

```bash
curl -fsSL https://flare-docs.codetotech.com/install.sh | bash
```

### Install script: Windows (PowerShell)

```powershell
irm https://flare-docs.codetotech.com/install.ps1 | iex
```

Both scripts check for Node.js 22+ and then install `@flaredev/cli` with npm.
They explain what to do if Node is missing or npm can't write to its global
directory. Two environment variables change what they install:

| Variable | Effect |
| --- | --- |
| `FLARE_VERSION` | Install a specific version, e.g. `0.1.0` (default: `latest`) |
| `FLARE_PM` | `pnpm` to install with pnpm instead of npm |

```bash
curl -fsSL https://flare-docs.codetotech.com/install.sh | FLARE_PM=pnpm bash
```

```powershell
$env:FLARE_VERSION = "0.1.0"; irm https://flare-docs.codetotech.com/install.ps1 | iex
```

Then:

```bash
flare --version
flare create myapp
```

## Verify it worked

On the **Next.js** stack (the default), a new app needs a database before it
does anything. The `docker-compose.yml` in your app brings up Postgres, MinIO
and Redis on the addresses the generated `.env` already points at, so there is
nothing to edit:

```bash
cd myapp
docker compose up -d        # Postgres, MinIO and Redis
npx flare migrate           # create the tables
npx flare db:seed           # an account to sign in with
npx flare dev               # http://localhost:3000
```

Open the printed URL. Sign in with **admin@example.com** / **Password** — that
is what `flare db:seed` writes, with the `admin` role, so the dashboard is reachable
straight away. It is a development convenience on a database you just created;
replace it with [`flare user:add`](/reference/cli/#flare-useradd-email) before
the app is anywhere but your machine. Running the seed again leaves an existing
account alone.

Without Docker, put a Postgres connection string in `DATABASE_URL` first — a
free [Neon](https://neon.tech) project is enough — then run the same commands
without the `docker compose` line.

On the **Cloudflare** stack there is nothing to provision: Wrangler simulates
D1, R2 and KV locally.

```bash
cd myapp
npx flare dev               # http://localhost:3000
```

Either way you should see the app's home page with sign-up and sign-in already
wired to Better Auth.

:::note[`prisma generate` runs on install]
Prisma writes its client into `lib/generated/prisma`, which is git-ignored, so
a fresh checkout does not have one. New apps run `prisma generate` from
`postinstall`, which covers your first `pnpm install` and a teammate's first
clone. On an app scaffolded before 0.12.1, add it:

```bash
npm pkg set scripts.postinstall="prisma generate"
pnpm db:generate
```
:::

## Upgrading

Upgrade an app by bumping `@flaredev/core` and `@flaredev/cli` together in its
`package.json` (they share a version), then reinstall. Upgrade the global
command by rerunning the install command or script.

:::danger[Do not take Prisma's upgrade advice literally]
A Next.js app is on **Prisma 7**, pinned exactly: `prisma`, `@prisma/client`
and `@prisma/adapter-pg` all at the same `7.x`.

`prisma@latest` is currently an **8.0 release candidate**, and Prisma's update
notifier prints this inside the output of `prisma migrate`:

```
npm i --save-dev prisma@latest
npm i @prisma/client@latest
```

Running those puts your app on a prerelease that Flare's generated code is not
written against. If you want a newer Prisma 7, ask for it by number and move
all three together:

```bash
pnpm add -D prisma@7.10.1
pnpm add @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1
pnpm db:generate
```

`npx flare doctor` checks this for you: it fails an app that has drifted off 7,
and an app whose three Prisma packages disagree — a client the installed CLI
did not generate fails on the first query rather than at build.
:::

## Working on Flare itself

To run the CLI from a checkout of the repo:

```bash
git clone https://github.com/MUKE-coder/flare-framework.git
cd flare-framework
pnpm install
pnpm build                                   # builds @flaredev/core and @flaredev/cli
node packages/cli/bin/flare.js create ../myapp
```

When it runs from a checkout, `flare create` points the app at the local
packages (a `link:`/`file:` path, or `workspace:*` inside the repo's
workspace) instead of the published ones.

Next: [the five-minute quickstart](/start/quickstart/).
