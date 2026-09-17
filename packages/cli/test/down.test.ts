import { describe, expect, it } from "vitest";
import { deriveDown, splitStatements } from "../src/generator/down.js";

describe("splitStatements", () => {
  it("splits drizzle-kit breakpoints and semicolons, ignoring comments and quoted semicolons", () => {
    const sql = "CREATE TABLE `a` (x text DEFAULT 'a;b');--> statement-breakpoint\n-- a comment; with semicolon\nCREATE INDEX `i` ON `a` (`x`);";
    expect(splitStatements(sql)).toEqual(["CREATE TABLE `a` (x text DEFAULT 'a;b')", "CREATE INDEX `i` ON `a` (`x`)"]);
  });
});

describe("deriveDown", () => {
  it("reverses a drizzle-kit create-table migration in reverse order", () => {
    const up = `CREATE TABLE \`deals\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`company_id\` text NOT NULL,
\tFOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX \`deals_company_id_idx\` ON \`deals\` (\`company_id\`);--> statement-breakpoint
CREATE UNIQUE INDEX \`deals_title_unique\` ON \`deals\` (\`title\`);`;
    expect(deriveDown(up)).toEqual({
      reversible: true,
      sql: "DROP INDEX IF EXISTS `deals_title_unique`;\nDROP INDEX IF EXISTS `deals_company_id_idx`;\nDROP TABLE IF EXISTS `deals`;\n",
    });
  });

  it("reverses added columns and renames", () => {
    const up = "ALTER TABLE `contacts` ADD `phone` text;\nALTER TABLE `contacts` RENAME COLUMN `mail` TO `email`;\nALTER TABLE `people` RENAME TO `contacts`;";
    expect(deriveDown(up)).toEqual({
      reversible: true,
      sql: "ALTER TABLE `contacts` RENAME TO `people`;\nALTER TABLE `contacts` RENAME COLUMN `email` TO `mail`;\nALTER TABLE `contacts` DROP COLUMN `phone`;\n",
    });
  });

  it.each([
    ["table rebuilds", "PRAGMA foreign_keys=OFF;--> statement-breakpoint\nCREATE TABLE `__new_contacts` (`id` text);--> statement-breakpoint\nINSERT INTO `__new_contacts` SELECT * FROM `contacts`;"],
    ["drops", "DROP TABLE `contacts`;"],
    ["data changes", "UPDATE `contacts` SET `vip` = 1;"],
    ["FK columns SQLite can't drop", "ALTER TABLE `deals` ADD `owner_id` text REFERENCES contacts(id);"],
    ["unique columns", "ALTER TABLE `deals` ADD `code` text UNIQUE;"],
    ["empty migrations", "-- nothing here\n"],
  ])("refuses %s", (_label, up) => {
    const result = deriveDown(up);
    expect(result.reversible).toBe(false);
  });

  it("explains which statement blocks the rollback", () => {
    expect(deriveDown("CREATE TABLE `a` (x text);\nDROP TABLE `b`;")).toEqual({
      reversible: false,
      reason: "can't automatically reverse: DROP TABLE `b`",
    });
  });
});
