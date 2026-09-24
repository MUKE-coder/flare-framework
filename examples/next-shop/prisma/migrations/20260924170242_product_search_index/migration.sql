-- Full-text search over a product's name and description.
--
-- Written by hand rather than generated: Prisma's schema has no way to express a
-- generated tsvector column or the GIN index over it, and this is the thing the
-- Postgres stack exists for. `prisma migrate dev --create-only` makes the empty
-- migration; the SQL is yours.
--
-- The column is STORED, so it is maintained by Postgres on every write and there is
-- nothing to keep in sync from application code.
ALTER TABLE "products"
  ADD COLUMN "search" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX "products_search_idx" ON "products" USING GIN ("search");
