# Flare docs

The documentation site for Flare, built with [Astro](https://astro.build) +
[Starlight](https://starlight.astro.build). It is a fully static site; it is
not published anywhere yet.

## Run it

From this `docs/` folder (after `pnpm install` at the repo root):

```bash
npx astro dev       # dev server at http://localhost:4321
npx astro build     # static build in dist/, with a Pagefind search index
npx astro preview   # serve the built dist/ locally
```

## Where things live

| Path | What |
| --- | --- |
| `src/content/docs/` | Every page, as Markdown/MDX. The file path is the URL (`guides/realtime.md` is `/guides/realtime/`). |
| `astro.config.mjs` | Site title, GitHub links, and the **sidebar**: a new page must be added there to appear in the navigation. |
| `src/styles/flare-theme.css` | Theme overrides. |
| `src/assets/` | Logo and images referenced from pages. |
| `public/` | Static files copied as-is (favicon). |
| `wrangler.jsonc` | Serves `dist/` as Workers Static Assets, for a future `wrangler deploy`. |

Frontmatter `description:` values that contain a colon must be quoted, or
the build fails.

Write for people building apps *with* Flare, and check every claim against
the code in `packages/` and the app template in `packages/cli/templates/app/`.
