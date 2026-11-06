import { defineResource, field, type Resource } from "@flaredev/core";
import { describe, expect, it } from "vitest";
import type { LoadedResource } from "../src/generator/load.js";
import {
  pendingPrismaRenames,
  pendingRenames,
  prismaMigrationDirName,
  prismaRenameSql,
  renameInSnapshot,
  renameInSql,
  renameProblems,
  renameSql,
  type PendingRename,
  type Snapshot,
} from "../src/generator/rename.js";

const loaded = (resource: Resource, stem: string): LoadedResource => ({ resource, stem, file: `resources/${stem}.resource.ts` });

/** A snapshot shaped the way drizzle-kit 0.31 writes them, with the column mentioned everywhere it can be. */
const snapshot = (): Snapshot => ({
  version: "6",
  dialect: "sqlite",
  id: "aaaa",
  prevId: "bbbb",
  tables: {
    people: {
      name: "people",
      columns: {
        id: { name: "id", type: "text", primaryKey: true, notNull: true },
        name: { name: "name", type: "text", primaryKey: false, notNull: true },
        last_name: { name: "last_name", type: "text", primaryKey: false, notNull: false },
        team_id: { name: "team_id", type: "text", primaryKey: false, notNull: false },
      },
      indexes: {
        people_name_unique: { name: "people_name_unique", columns: ["name"], isUnique: true },
        people_last_name_idx: { name: "people_last_name_idx", columns: ["last_name"], isUnique: false },
      },
      foreignKeys: {
        people_team_id_teams_id_fk: {
          name: "people_team_id_teams_id_fk",
          tableFrom: "people",
          tableTo: "teams",
          columnsFrom: ["team_id"],
          columnsTo: ["id"],
          onDelete: "restrict",
          onUpdate: "no action",
        },
      },
      uniqueConstraints: {},
      compositePrimaryKeys: {},
      checkConstraints: {
        people_name_check: { name: "people_name_check", value: `"people"."name" in ('ada', 'grace')` },
      },
    },
  },
  views: {},
  enums: {},
  _meta: { tables: {}, columns: {} },
});

const rename: PendingRename = { resource: "Person", table: "people", fromKey: "name", toKey: "fullName", from: "name", to: "full_name" };

describe("pendingRenames (#56)", () => {
  const person = (extra: Record<string, unknown> = {}) =>
    loaded(
      defineResource({
        name: "Person",
        table: "people",
        fields: { fullName: field.string({ rename: { from: "name" }, ...extra }) },
      }),
      "person",
    );

  it("finds a declared rename the snapshot has not had yet", () => {
    expect(pendingRenames([person()], snapshot())).toEqual([
      { resource: "Person", table: "people", fromKey: "name", toKey: "fullName", from: "name", to: "full_name" },
    ]);
  });

  it("finds nothing once the column has been renamed", () => {
    // Which is what makes it safe to leave the declaration in the descriptor for ever.
    const done = snapshot();
    done.tables.people!.columns = { full_name: { name: "full_name" } };
    expect(pendingRenames([person()], done)).toEqual([]);
  });

  it("finds nothing when both names are somehow present", () => {
    const both = snapshot();
    both.tables.people!.columns.full_name = { name: "full_name" };
    expect(pendingRenames([person()], both)).toEqual([]);
  });

  it("finds nothing on a first run, when there is no snapshot at all", () => {
    expect(pendingRenames([person()], undefined)).toEqual([]);
  });

  it("ignores a table the snapshot does not have", () => {
    const other = snapshot();
    delete other.tables.people;
    expect(pendingRenames([person()], other)).toEqual([]);
  });
});

describe("renameProblems (#56)", () => {
  it("refuses a rename from a field that still exists", () => {
    const both = loaded(
      defineResource({
        name: "Person",
        fields: { name: field.string(), fullName: field.string({ rename: { from: "name" } }) },
      }),
      "person",
    );
    expect(renameProblems([both])[0]).toMatch(/Person\.name still exists/);
  });

  it("refuses a rename from itself", () => {
    const self = loaded(defineResource({ name: "Person", fields: { name: field.string({ rename: { from: "name" } }) } }), "person");
    expect(renameProblems([self])[0]).toMatch(/renames from itself/);
  });

  it("refuses a name that is not a field name", () => {
    const bad = loaded(defineResource({ name: "Person", fields: { fullName: field.string({ rename: { from: "1 bad" } }) } }), "person");
    expect(renameProblems([bad])[0]).toMatch(/not a field name/);
  });

  it("is quiet about a rename that is fine", () => {
    const ok = loaded(defineResource({ name: "Person", fields: { fullName: field.string({ rename: { from: "name" } }) } }), "person");
    expect(renameProblems([ok])).toEqual([]);
  });
});

describe("renameInSnapshot (#56)", () => {
  const { snapshot: next, indexes } = renameInSnapshot(snapshot(), rename);
  const table = next.tables.people!;

  it("renames the column, both as a key and inside", () => {
    expect(Object.keys(table.columns)).toEqual(["id", "full_name", "last_name", "team_id"]);
    expect(table.columns.full_name!.name).toBe("full_name");
    expect(table.columns.full_name!.notNull).toBe(true);
  });

  it("keeps the column in its original position", () => {
    // Not cosmetic: drizzle-kit compares snapshots and a reordered one reads as a change.
    expect(Object.keys(table.columns).indexOf("full_name")).toBe(1);
  });

  it("renames the index that was on it, key and name together", () => {
    expect(table.indexes!.people_full_name_unique).toEqual({ name: "people_full_name_unique", columns: ["full_name"], isUnique: true });
    expect(table.indexes!.people_name_unique).toBeUndefined();
  });

  it("leaves an index on a column that merely looks similar alone", () => {
    // `last_name` contains `name`; renaming it too would be a corrupted snapshot.
    expect(table.indexes!.people_last_name_idx).toEqual({ name: "people_last_name_idx", columns: ["last_name"], isUnique: false });
  });

  it("rewrites the check constraint's SQL on a word boundary", () => {
    expect(table.checkConstraints!.people_full_name_check!.value).toBe(`"people"."full_name" in ('ada', 'grace')`);
  });

  it("leaves a foreign key on another column untouched", () => {
    expect(table.foreignKeys!.people_team_id_teams_id_fk!.columnsFrom).toEqual(["team_id"]);
  });

  it("reports the indexes that have to be recreated", () => {
    expect(indexes).toEqual([{ from: "people_name_unique", to: "people_full_name_unique", columns: ["full_name"], unique: true }]);
  });

  it("does not touch the snapshot it was given", () => {
    const original = snapshot();
    renameInSnapshot(original, rename);
    expect(Object.keys(original.tables.people!.columns)).toContain("name");
  });

  it("does nothing when the column is not there", () => {
    const missing = snapshot();
    delete missing.tables.people!.columns.name;
    const { indexes: none } = renameInSnapshot(missing, rename);
    expect(none).toEqual([]);
  });
});

describe("renameInSql (#56)", () => {
  it("renames a quoted identifier", () => {
    expect(renameInSql(`"people"."name" in ('a')`, "name", "full_name")).toBe(`"people"."full_name" in ('a')`);
    expect(renameInSql("`people`.`name` > 0", "name", "full_name")).toBe("`people`.`full_name` > 0");
  });

  it("renames a bare identifier", () => {
    expect(renameInSql("length(name) > 2", "name", "full_name")).toBe("length(full_name) > 2");
  });

  it("leaves a string literal that happens to read the same alone", () => {
    // `status in ('name', 'other')` must keep its values; this is why it is not a
    // string replace.
    expect(renameInSql(`"status" in ('name', 'other')`, "name", "full_name")).toBe(`"status" in ('name', 'other')`);
  });

  it("leaves a longer identifier that merely contains it alone", () => {
    expect(renameInSql(`"last_name" is not null`, "name", "full_name")).toBe(`"last_name" is not null`);
  });
});

describe("renameSql (#56)", () => {
  it("renames the column and recreates the index that carried its name", () => {
    const sql = renameSql(rename, [{ from: "people_name_unique", to: "people_full_name_unique", columns: ["full_name"], unique: true }]);
    expect(sql).toContain("ALTER TABLE `people` RENAME COLUMN `name` TO `full_name`;");
    expect(sql).toContain("DROP INDEX IF EXISTS `people_name_unique`;");
    expect(sql).toContain("CREATE UNIQUE INDEX `people_full_name_unique` ON `people` (`full_name`);");
    // Statements are separated the way drizzle's runner expects.
    expect(sql.split("--> statement-breakpoint")).toHaveLength(3);
  });

  it("is a single statement when no index mentioned the column", () => {
    const sql = renameSql(rename, []);
    expect(sql).toBe("ALTER TABLE `people` RENAME COLUMN `name` TO `full_name`;");
  });

  it("never drops or recreates the table, which is what would lose the data", () => {
    const sql = renameSql(rename, [{ from: "a", to: "b", columns: ["full_name"], unique: false }]);
    expect(sql).not.toMatch(/DROP TABLE|CREATE TABLE|__new_/);
  });
});

describe("the Prisma half of a rename (#56)", () => {
  const person = loaded(
    defineResource({ name: "Person", table: "people", fields: { fullName: field.string({ rename: { from: "name" } }) } }),
    "person",
  );

  it("is pending while no migration directory mentions it", () => {
    expect(pendingPrismaRenames([person], ["20260101000000_init"])).toEqual([
      { resource: "Person", table: "people", fromKey: "name", toKey: "fullName", from: "name", to: "full_name" },
    ]);
  });

  it("is done once one does, so a second run writes nothing", () => {
    // Prisma keeps its history in the database, so the directory name is the only thing
    // on disk that can say the rename already happened.
    const dirs = ["20260101000000_init", "20260102030405_rename_people_name_to_full_name"];
    expect(pendingPrismaRenames([person], dirs)).toEqual([]);
  });

  it("writes a Postgres rename, not a drop and an add", () => {
    const rename = pendingPrismaRenames([person], [])[0]!;
    const sql = prismaRenameSql(rename);
    expect(sql).toContain('ALTER TABLE "people" RENAME COLUMN "name" TO "full_name";');
    expect(sql).not.toMatch(/DROP COLUMN|ADD COLUMN/);
  });

  it("names the directory the way Prisma orders them, with both columns in it", () => {
    const rename = pendingPrismaRenames([person], [])[0]!;
    const dir = prismaMigrationDirName(rename, new Date("2026-01-02T03:04:05Z"));
    expect(dir).toBe("20260102030405_rename_people_name_to_full_name");
  });
});
