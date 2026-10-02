import { describe, expect, it } from "vitest";
import { destructiveStatements, isDestructive } from "../src/generator/destructive.js";

/**
 * The scan that stops `flare gen migration` applying a migration that throws data away.
 *
 * The case it exists for: Prisma cannot see a hand-written GIN index, generated column or
 * trigger, decides the database has drifted, and writes a migration that drops them.
 */
describe("what counts as destructive", () => {
  it("finds a dropped column, and says it is the values that go", () => {
    const found = destructiveStatements('ALTER TABLE "contacts" DROP COLUMN "phone";');
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toMatch(/values/);
  });

  it("finds the objects Prisma does not know it is deleting", () => {
    // The review's example, verbatim in spirit: things the schema cannot describe.
    const sql = `
DROP INDEX "contacts_search_gin";
DROP TRIGGER "contacts_touch" ON "contacts";
DROP FUNCTION "touch_contacts"();
`;
    const kinds = destructiveStatements(sql).map((entry) => entry.kind);
    expect(kinds).toHaveLength(3);
    expect(kinds[0]).toMatch(/cannot recreate it/);
    expect(kinds[1]).toMatch(/will not put it back/);
  });

  it("finds a dropped table and a truncate", () => {
    expect(destructiveStatements('DROP TABLE "orders";')[0]!.kind).toMatch(/every row/);
    expect(destructiveStatements('TRUNCATE "orders";')[0]!.kind).toMatch(/every row/);
  });

  it("reports them in the order they would run, with line numbers", () => {
    const sql = ['CREATE TABLE "a" ("id" TEXT);', 'DROP TABLE "b";', 'ALTER TABLE "c" ADD COLUMN "x" TEXT;', 'DROP INDEX "d";'].join("\n");
    const found = destructiveStatements(sql);
    expect(found.map((entry) => entry.line)).toEqual([2, 4]);
    expect(found[0]!.statement).toContain('DROP TABLE "b"');
  });

  it("passes a migration that only adds things", () => {
    const sql = `
CREATE TABLE "tickets" ("id" TEXT NOT NULL, "subject" TEXT NOT NULL);
ALTER TABLE "tickets" ADD COLUMN "deleted_at" TIMESTAMP;
CREATE INDEX "tickets_deleted_at_idx" ON "tickets"("deleted_at");
`;
    expect(destructiveStatements(sql)).toEqual([]);
    expect(isDestructive(sql)).toBe(false);
  });
});

describe("what it must not mistake for a statement", () => {
  it("ignores Prisma's own step comments", () => {
    // Prisma annotates its output with these. They describe a statement; they are not one.
    const sql = `-- DropTable\n-- DropColumn\nCREATE TABLE "a" ("id" TEXT);`;
    expect(destructiveStatements(sql)).toEqual([]);
  });

  it("ignores a block comment", () => {
    expect(destructiveStatements('/* DROP TABLE "a"; */ CREATE TABLE "b" ("id" TEXT);')).toEqual([]);
  });

  it("ignores the word inside a string literal", () => {
    // A seeded row or a column default can say anything.
    const sql = `INSERT INTO "settings" ("key", "value") VALUES ('policy', 'drop table on reset');`;
    expect(destructiveStatements(sql)).toEqual([]);
  });

  it("ignores a quoted identifier that happens to contain it", () => {
    expect(destructiveStatements('CREATE TABLE "drop table" ("id" TEXT);')).toEqual([]);
  });

  it("is not fooled by a doubled quote inside a literal", () => {
    const sql = `INSERT INTO "notes" ("body") VALUES ('it''s fine to drop column here');`;
    expect(destructiveStatements(sql)).toEqual([]);
  });

  it("still catches a statement that follows a comment mentioning one", () => {
    const sql = `-- this migration will DROP TABLE nothing\nDROP TABLE "real";`;
    expect(destructiveStatements(sql)).toHaveLength(1);
  });

  it("does not report DROP DEFAULT or DROP NOT NULL, which lose no data", () => {
    // Prisma writes these constantly and they are not destructive.
    const sql = `
ALTER TABLE "a" ALTER COLUMN "x" DROP DEFAULT;
ALTER TABLE "a" ALTER COLUMN "y" DROP NOT NULL;
`;
    expect(destructiveStatements(sql)).toEqual([]);
  });
});
