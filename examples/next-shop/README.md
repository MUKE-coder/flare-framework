# next-shop

The [Flare](https://flare-docs.codetotech.com) Next.js stack, against a real
Postgres: Next.js 16, Prisma 7 and Better Auth, with the same dashboard,
descriptors and generated code the Cloudflare stack uses.

It is the worked example behind
[the Next.js tutorial](https://flare-docs.codetotech.com/tutorials/next-shop/).

## Local development

```bash
cp .env.example .env       # DATABASE_URL, BETTER_AUTH_SECRET
npx prisma migrate deploy  # or: npx flare migrate
npx flare seed             # 2,000 products across three categories
pnpm run dev
```

Three resources — Category, Product, Order — generated with
`flare gen resource`, plus two things written by hand:

- `prisma/migrations/*_product_search_index` adds a generated `tsvector`
  column and a GIN index over it.
- `lib/search.ts` and `app/dashboard/search` query it with `plainto_tsquery`
  and rank the results, with the timing shown on the page. Its comments carry
  the measurements, including the case where the index is the slower choice.

## Deploying to Vercel

Vercel builds the application on deploy, but does not run migrations against your production database. To provision and seed the remote database:

```bash
# Apply migrations to production (runs prisma migrate deploy)
DATABASE_URL="<your POSTGRES_PRISMA_URL>" npx flare migrate

# Populate sample data
DATABASE_URL="<your POSTGRES_PRISMA_URL>" npx flare seed
```

> **Note on Vercel Postgres:**
> - Set `DATABASE_URL` inline using Vercel's `POSTGRES_PRISMA_URL`.
> - Do not run `prisma migrate dev` against production (cloud Postgres instances disallow shadow database creation).
> - Ensure `BETTER_AUTH_URL` has no trailing slash.

Full deployment guide: https://flare-docs.codetotech.com/guides/vercel-deployment/
