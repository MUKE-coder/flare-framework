import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./db/schema.ts",
  // Must match `migrations_dir` for the DB binding in wrangler.jsonc.
  out: "./migrations",
});
