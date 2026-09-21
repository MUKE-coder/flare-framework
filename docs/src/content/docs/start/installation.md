---
title: Installation
description: Prerequisites and how to install the Flare CLI.
---

## Prerequisites

- **Node.js 22+** and a package manager: pnpm, npm, yarn, or bun. Flare
  detects whichever one you use to run its own CLI and scaffolds the app
  with that manager's lockfile.
- **A Cloudflare account** — but not yet. You don't need one to scaffold an
  app or run it locally. `flare dev` and `flare start` simulate D1, R2, and
  KV locally through Wrangler. You only need `wrangler login` when you're
  ready to run `flare deploy`.

:::note
Flare is pre-1.0 and its packages are **not published to npm yet**, so
`npx @flare/cli ...` won't resolve today. The package name isn't finalized
either — these docs use `@flare/cli`, the workspace package name. The
`flare` binary name and every command below are stable regardless of how
the package ends up published. Until then, run the CLI from a checkout of
the repo, as below.
:::

## Run the CLI from this repo (for now)

```bash
git clone https://github.com/MUKE-coder/flare-framework.git
cd flare-framework
pnpm install
pnpm build                                   # builds @flare/core and @flare/cli
node packages/cli/bin/flare.js create ../myapp
```

When the CLI runs from a checkout, `flare create` points the new app's
`@flare/core` and `@flare/cli` dependencies at the local packages (a
`link:`/`file:` path, or `workspace:*` if the app is inside the repo's
workspace), so inside the app `npx flare ...` works as documented.

## Install the CLI

```bash
npm install --save-dev @flare/cli
```

You don't have to install it globally. `flare create` scaffolds a new app
that adds `@flare/cli` as a dev dependency automatically, so every command
after that runs through your package manager:

```bash
npx flare gen resource Contact --fields "name:string, email:string"
# or, with pnpm
pnpm flare gen resource Contact --fields "name:string, email:string"
```

For the very first command — scaffolding the app itself — run the CLI
directly with your package manager's one-off runner:

```bash
npx @flare/cli create myapp
# or
pnpm dlx @flare/cli create myapp
```

## Verify it worked

```bash
cd myapp
npm run dev
```

This starts `vinext dev`. Open the printed local URL — you should see the
scaffolded app's home page, with sign-up and sign-in already wired to
Better Auth over a local D1 database. No Cloudflare login, no configuration.

Next: [the five-minute quickstart](/start/quickstart/).
