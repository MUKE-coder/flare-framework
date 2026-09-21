# demo

A small CRM — the reference app every Flare phase (M0–M3) is verified
against. Three resources generated entirely through the CLI, with no
hand-authored resource, API route, or admin page:

- **Company** — a unique field and a `hasMany` relation with no column of
  its own
- **Contact** — an enum status field, a boolean, an email-formatted string
- **Deal** — two `belongsTo` relations to different targets, a date field,
  and a `file:[pdf,image]` field wired end to end to R2, plus a policy
  (see `policies/deal.policy.ts`) restricting delete to `admin`

Full write-up, including the exact `flare gen resource`/`gen policy`
commands used to build it and what was verified against it, is in
the docs (`docs/src/content/docs/examples/demo.md`
in this repo).

## Running it locally

```bash
pnpm install
npx flare migrate    # apply migrations to local D1
npx flare seed       # seeds/companies, contacts, deals — in that order
pnpm run dev
```

Sign up at the printed local URL, then grant yourself `admin` so `/admin`
shows every action:

```bash
npx flare user:role you@example.com admin
```

## Other scripts

```bash
pnpm run dev      # start the dev server
pnpm run build    # production build
pnpm run start    # serve the production build locally in workerd
pnpm run deploy   # migrate, build, and deploy to Cloudflare Workers
```
