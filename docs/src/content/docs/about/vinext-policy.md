---
title: Depending on vinext
description: Which vinext version each Flare release is tested against, how an upgrade reaches an existing app, and what happens if vinext stalls.
---

The Cloudflare stack runs on [vinext](https://vinext.dev), Cloudflare's
Next-compatible RSC framework. If you are choosing a stack for a client's
project, that is the dependency worth asking about — so here is the answer
before you have to ask.

## Which version each release is tested against

| Flare | vinext | `@vinext/cloudflare` | react |
| --- | --- | --- | --- |
| 0.12.x | 1.4.3 | 1.3.3 | 19.3.1 |
| 0.11.x | 1.0.0-beta.10 | 1.0.0-beta.8 | 19.3.0 |

Exact versions, not ranges. Six packages have to move together — vinext,
`@vinext/cloudflare`, react, react-dom, react-server-dom-webpack and
`@vitejs/plugin-rsc` — because `@vinext/cloudflare` peer-depends on an exact
vinext minor, and vinext peer-depends on particular react and plugin-rsc
versions. Bumping one alone gives you an app that will not install. So Flare
pins the set it has actually built and run, and
`packages/cli/src/versions.ts` says why in a comment beside it.

Each set is verified by scaffolding an app on it, installing, building,
starting it and signing in — not by reading the version ranges and hoping.

## How an upgrade reaches an existing app

Your `package.json` is yours. Flare does not reach into it, so an upgrade is
two steps, taken when you want them:

```bash
# 1. See the versions a new app would get
npx flare@latest create reference-app --skip-install --yes
# compare reference-app/package.json with yours, and bump

# 2. Take the template changes that go with them
npx flare update
```

`flare update` shows how your copy of each engine file differs from the
version Flare now ships and applies only the parts you choose — see
[nothing is hidden](/concepts/no-magic/). `flare diff` is the same without
applying anything, and `flare doctor` tells you when your app's
`@flaredev/core` has fallen behind the CLI.

Nothing upgrades on its own. An app that works keeps working on the versions
it was built against, `npm install` included, because they are pinned rather
than ranged.

## If vinext stalls

The honest answer: your app does not stop working, and Flare has a way out
that has not been built yet.

**Your app keeps running.** It is pinned to exact versions and deployed as a
Worker. A framework that stops being released does not stop being deployable.

**What you would lose** is new vinext releases — so eventually new React
features, and eventually fixes in vinext itself. That is the real risk, and it
is a question of how long you are willing to run on a frozen framework, not
whether the app falls over next week.

**What Flare would do.** Add a second Cloudflare option: Next.js on Workers
through [OpenNext](https://opennext.js.org), which does not depend on vinext
at all. It is not built. Building it now would mean a third stack to keep
green in CI before anybody needs it.

What makes it a credible fallback rather than a hope is how little it would
have to replace. vinext is the framework layer only. Everything above it —
the descriptors, the engine in `lib/`, the dashboard, the API, the policies,
every component — is the same code the Next.js stack already runs. Flare's
Next.js stack is the proof, because it is that same swap already made in the
other direction.

**What you can do today.** If this risk decides a project, use the Next.js
stack: it is the default, it runs on Next.js 16 directly, and
[switching later](/start/stacks/#can-i-switch-later) is real in both
directions because the descriptors and the engine do not change.

## Why vinext at all, then

Because it is what makes the Cloudflare stack worth having: React Server
Components on Workers, with D1 and R2 as bindings rather than network calls,
and no Node server anywhere. The Next.js stack cannot do that, and for plenty
of projects — users far from one region, or a bill that matters at low traffic
— it is the better answer. The dependency is the price of that, and it is
worth naming rather than hiding.
