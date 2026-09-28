---
title: Installation
description: Prerequisites and every way to install the Flare CLI.
---

## Prerequisites

- **Node.js 22+** and a package manager: npm, pnpm, yarn or bun. Flare detects
  the one you use to run it and scaffolds the app with that manager's lockfile.
- **A Cloudflare account**, but not yet. You don't need one to create an app
  or run it locally: `flare dev` and `flare start` simulate D1, R2 and KV
  through Wrangler. You only need `wrangler login` when you're ready to run
  `flare deploy`.

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

## If it scaffolds an old version

`pnpm create` and `npm create` cache the package they run. pnpm keeps it for
**24 hours by default**, so the day after a Flare release, `pnpm create
flare-framework` can still be running the version you used yesterday —
quietly, without asking the registry. The banner it prints is the giveaway:

```
+ create-flare-framework 0.5.0
```

Adding `@latest` does not help, because the cache is keyed before the version
is resolved. Ask for the version you want by number:

```bash
pnpm create flare-framework@0.6.0 myapp
```

Or clear pnpm's cache of it, which lives in `dlx` inside pnpm's cache
directory (`pnpm store path` points at the neighbouring store):

```bash
# macOS / Linux
rm -rf "$(dirname "$(pnpm store path)")/dlx"
# Windows PowerShell
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\pnpm-cache\dlx"
```

npm's equivalent is `npm cache clean --force`.

An app already created is unaffected — it pins its own `@flaredev/cli` in
`devDependencies`, and `npx flare --version` inside it tells you which.

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

```bash
cd myapp
npm run dev
```

This starts `vinext dev`. Open the printed local URL. You should see the
app's home page, with sign-up and sign-in already wired to Better Auth over a
local D1 database, and no Cloudflare login or configuration needed.

## Upgrading

Upgrade an app by bumping `@flaredev/core` and `@flaredev/cli` together in its
`package.json` (they share a version), then reinstall. Upgrade the global
command by rerunning the install command or script.

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
