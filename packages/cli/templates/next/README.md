# __APP_NAME__

A [Flare](https://flare-docs.codetotech.com) app on Next.js, Postgres and Prisma.

## Local development

```bash
cp .env.example .env       # DATABASE_URL and BETTER_AUTH_SECRET, at least
__PM__ run db:migrate      # prisma migrate dev: write and apply a migration locally
__PM__ run db:seed         # run seed files in seeds/
__PM__ run dev             # start the dev server on http://localhost:3000
```

After `flare gen resource`, run `__PM__ run db:migrate` to turn the new models
in `prisma/schema/resources.prisma` into a migration.

## Deploying to Vercel

Vercel builds on its own machines, but **does not touch your database during deployment**. A newly provisioned Postgres database starts empty; attempting to sign up or sign in before applying migrations will fail with `500 Internal Server Error`.

Apply migrations and initial seeds once from your local machine against your production database:

```bash
# 1. Apply existing migrations to production (runs prisma migrate deploy)
DATABASE_URL="<your POSTGRES_PRISMA_URL>" npx flare migrate

# 2. Seed initial data (if needed)
DATABASE_URL="<your POSTGRES_PRISMA_URL>" __PM__ run db:seed
```

### Production Database Notes:
- **`POSTGRES_PRISMA_URL` vs `DATABASE_URL`**: Vercel Postgres integration defines `POSTGRES_PRISMA_URL`. Flare and Prisma look for `DATABASE_URL`. Pass it inline as shown above rather than rewriting your local `.env`.
- **Do not run `prisma migrate dev` against production**: Cloud databases reject creating shadow databases. Use `npx flare migrate` (`prisma migrate deploy`) or `npx prisma db push`.
- **`BETTER_AUTH_URL`**: Set without a trailing slash (e.g. `https://myapp.vercel.app`) to avoid 403 origin mismatch errors.

Full guide: https://flare-docs.codetotech.com/guides/vercel-deployment/

## Commands

| Command | What it does |
| --- | --- |
| `__PM__ run dev` | Start dev server on http://localhost:3000 |
| `__PM__ run build` | Generate Prisma client and create production Next.js build |
| `__PM__ run deploy` | Deploy to Vercel (`vercel deploy --prod`) |
| `__PM__ run db:migrate` | Create and apply migrations locally (`prisma migrate dev`) |
| `__PM__ run db:seed` | Run seed scripts in `seeds/` |

Docs: https://flare-docs.codetotech.com
