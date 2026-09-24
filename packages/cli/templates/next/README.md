# __APP_NAME__

A [Flare](https://flare-docs.codetotech.com) app on Next.js, Postgres and Prisma.

```bash
cp .env.example .env       # DATABASE_URL and BETTER_AUTH_SECRET, at least
__PM__ run db:migrate      # prisma migrate dev: write and apply a migration
__PM__ run dev             # start the dev server on http://localhost:3000
__PM__ run build           # production build
__PM__ run deploy          # deploy to Vercel
```

After `flare gen resource`, run `__PM__ run db:migrate` to turn the new models
in `prisma/schema/resources.prisma` into a migration.

Docs: https://flare-docs.codetotech.com
