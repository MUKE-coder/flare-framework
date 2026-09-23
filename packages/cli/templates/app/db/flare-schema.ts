import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

/**
 * Who changed what, and when. Written by the dashboard's actions (lib/audit.ts) for
 * every create, update, delete and import, and read by /dashboard/observability.
 *
 * `changes` holds only the fields that moved, as JSON, never the whole record: an audit
 * trail that copies every row is a second database of the same data, and a place for
 * secrets to leak into.
 */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    /** "create", "update", "delete", "import" or "bulk-delete". */
    action: text("action").notNull(),
    /** The resource's descriptor name, e.g. "Contact". */
    resource: text("resource").notNull(),
    /** The record, when the action was about one. */
    recordId: text("record_id"),
    /** How the record reads afterwards, for the log's own listing. */
    recordLabel: text("record_label"),
    userId: text("user_id"),
    userEmail: text("user_email"),
    /** Fields that changed: { field: { from, to } }, or a count for bulk actions. */
    changes: text("changes", { mode: "json" }).$type<Record<string, unknown> | null>(),
    ip: text("ip"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  },
  (table) => [index("audit_log_created_at_idx").on(table.createdAt), index("audit_log_resource_idx").on(table.resource)],
);

/**
 * A filtered, sorted, column-picked view of a resource that someone wanted to keep, like
 * "Overdue invoices". The query is the table's own URL query string, so saving a view is
 * saving what's in the address bar — nothing about the table has to know views exist.
 */
export const savedView = sqliteTable(
  "saved_view",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    /** The resource's descriptor name, e.g. "Invoice". */
    resource: text("resource").notNull(),
    name: text("name").notNull(),
    /** "q=ada&filter[status]=lead&sort=-createdAt", without the leading "?". */
    query: text("query").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  },
  (table) => [index("saved_view_user_idx").on(table.userId, table.resource)],
);
