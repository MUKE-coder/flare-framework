import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 keeps the connection string out of the schema and loads env itself.
 *
 * `schema` points at a folder, not a file: `base.prisma` holds the generator, the
 * datasource and the tables Flare's own features need, and `resources.prisma` is written
 * by `flare gen resource` from your descriptors.
 */
export default defineConfig({
  schema: "prisma/schema",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
