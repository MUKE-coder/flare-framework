import { describe, expect, it } from "vitest";
import { repairRebuildMigration, snapshotColumns } from "../src/generator/repair.js";

const REBUILD = `PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE \`__new_contacts\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`status\` text,
	CONSTRAINT "contacts_status_check" CHECK("__new_contacts"."status" in ('lead', 'customer'))
);
--> statement-breakpoint
INSERT INTO \`__new_contacts\`("id", "name", "status") SELECT "id", "name", "status" FROM \`contacts\`;--> statement-breakpoint
DROP TABLE \`contacts\`;--> statement-breakpoint
ALTER TABLE \`__new_contacts\` RENAME TO \`contacts\`;--> statement-breakpoint
PRAGMA foreign_keys=ON;`;

describe("repairRebuildMigration", () => {
  it("copies only columns the old table had, and defers foreign keys for D1", () => {
    const { sql, changes } = repairRebuildMigration(REBUILD, { contacts: ["id", "name", "created_at"] });
    expect(sql).toContain('INSERT INTO `__new_contacts`("id", "name") SELECT "id", "name" FROM `contacts`;');
    expect(sql).toContain("PRAGMA defer_foreign_keys = on;");
    expect(sql).toContain("PRAGMA defer_foreign_keys = off;");
    expect(sql).not.toMatch(/PRAGMA foreign_keys/);
    expect(changes).toEqual([
      "contacts: don't copy new column(s) status from the old table",
      "use PRAGMA defer_foreign_keys (D1) instead of PRAGMA foreign_keys",
    ]);
  });

  it("leaves copies alone when every column already existed", () => {
    const { sql, changes } = repairRebuildMigration(REBUILD, { contacts: ["id", "name", "status"] });
    expect(sql).toContain('SELECT "id", "name", "status" FROM `contacts`;');
    expect(changes).toEqual(["use PRAGMA defer_foreign_keys (D1) instead of PRAGMA foreign_keys"]);
  });

  it("does nothing to plain migrations", () => {
    const plain = "ALTER TABLE `deals` ADD `notes` text;";
    expect(repairRebuildMigration(plain, {})).toEqual({ sql: plain, changes: [] });
  });

  it("reads table columns from a drizzle-kit snapshot", () => {
    expect(snapshotColumns({ tables: { contacts: { columns: { id: {}, name: {} } }, user: { columns: {} } } })).toEqual({
      contacts: ["id", "name"],
      user: [],
    });
  });
});
