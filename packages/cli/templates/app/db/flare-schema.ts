import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Roles a user can hold (`user.role` from Better Auth's admin plugin).
 * Register them with `flare role:add <name>`, assign with `flare user:role <email> <role>`,
 * and grant access per resource with `flare gen policy <Resource> --roles ...`.
 */
export const role = sqliteTable("role", {
  name: text("name").primaryKey(),
  label: text("label").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
});
