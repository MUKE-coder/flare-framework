# Releasing

Flare publishes three packages together, always at the same version:
`@flaredev/core`, `@flaredev/cli` and `create-flare-framework`.

1. Bump `version` in `packages/core`, `packages/cli` and
   `packages/create-flare-framework`, plus `FLARE_VERSION` in
   `packages/core/src/index.ts` (a test fails if they differ).
2. `pnpm build && node scripts/build-lockfiles.mjs` — regenerates
   `packages/cli/templates/locks/*`, which is what makes a new app install in
   about half the time. It pins the version being released, so it has to run
   after the bump. Regenerate `templates/app/worker-configuration.d.ts` too when
   the wrangler version changes: `wrangler types` inside a scaffolded app.
3. Commit on `main` with a clean tree.
4. `pnpm release:check` builds, runs the tests and does a dry-run publish.
5. `npm login` (once per machine), then `pnpm release`. pnpm publishes in
   dependency order (core, then cli, then create-flare-framework) and turns
   `workspace:*` into the real version. With 2FA on, it asks for a one-time code.
6. Tag it: `git tag v<version> && git push --tags`.
7. Redeploy the docs (`cd docs && pnpm run deploy`) if they changed.

Versions can't be republished on npm. To fix a bad release, publish a new
patch version, then `npm deprecate @flaredev/cli@<bad> "<reason>"`.
