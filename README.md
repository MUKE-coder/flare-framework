# Flare

**Laravel + Filament, for the Cloudflare edge.**

Flare is a batteries-included, generator-driven fullstack framework built
on top of [vinext](https://github.com/cloudflare/vinext) (Cloudflare's
Next.js-compatible Vite framework). `flare create myapp`, then
`flare gen resource Contact --fields "name:string, email:string"`, then
`flare deploy` — and within five minutes you have a live, authenticated
CRUD app on Cloudflare Workers with a working admin dashboard. No
hand-wired D1 bindings, no auth library to pick, no admin UI to build by
hand.

**Docs:** [flare-docs.codetotech.com](https://flare-docs.codetotech.com). The
source is in [`docs/src/content/docs/`](./docs/src/content/docs/); run it locally
with `cd docs && npx astro dev`.

## This repository

A pnpm workspace:

| Path | Package | Role |
| --- | --- | --- |
| `packages/cli` | `@flare/cli` (bin: `flare`) | Every CLI verb (including the field grammar parser, `src/generator/grammar.ts`), plus the app template scaffolded by `flare create` |
| `packages/core` | `@flare/core` | Runtime: descriptor types, resource store and validators, Cloudflare/auth/mail/storage helpers, policy checks, realtime |
| `examples/demo` | — | A small CRM, generated entirely through the CLI, used to verify every phase's exit criteria |
| `docs/` | `@flare/docs` | This repo's documentation site (Astro + Starlight), published at [flare-docs.codetotech.com](https://flare-docs.codetotech.com) |

## Working on Flare itself

```bash
pnpm install
pnpm test        # builds every package, then runs the full vitest suite
pnpm typecheck
```

Four files govern how this project is built, and are worth reading in
this order before making a change:

1. **[`project-description.md`](./project-description.md)** — the vision,
   the tech stack, and the core technical decisions (the resource
   descriptor pattern and the codegen overwrite contract, especially).
2. **[`phases.md`](./phases.md)** — the ordered build plan and the single
   source of truth for progress. Work phases in order; don't start a
   phase's tasks while the previous one has unchecked items.
3. **[`style-guide.md`](./style-guide.md)** — the visual system for the
   generated admin dashboard.
4. **[`prompt.md`](./prompt.md)** — the session checklist: how to pick up
   where a previous session left off.

## Documentation site

```bash
cd docs
npx astro dev      # http://localhost:4321
npx astro build    # static site in docs/dist/
```

Source lives in `docs/src/content/docs/`, organized to match
`project-description.md`'s sections but written for people building apps
*with* Flare, not people building Flare itself.

## License

Not yet chosen. There is no LICENSE file in this repository yet.
