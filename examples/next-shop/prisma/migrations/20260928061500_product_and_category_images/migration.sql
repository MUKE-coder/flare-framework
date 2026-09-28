-- An image for a product and for a category.
--
-- Written by hand rather than by `prisma migrate dev`, and the reason is worth
-- knowing: the search column added by the previous migration is a generated tsvector,
-- which Prisma's schema cannot express. Prisma therefore believes it shouldn't exist
-- and offers to drop it on every diff — along with all 302,000 rows' worth of index.
--
-- Adding the columns by hand keeps both. See the tutorial's note on this.
ALTER TABLE "products" ADD COLUMN "image" TEXT;
ALTER TABLE "categories" ADD COLUMN "image" TEXT;
