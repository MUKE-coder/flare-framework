import { describe, expect, it } from "vitest";
import { defineResource, field, type Resource } from "@flaredev/core";
import { bulkInsert, insertStatements, sqlLiteral, type Row } from "../src/seed/bulk.js";
import { createInsertMany } from "../src/seed/insert-many.js";
import { seedColumns, seedRows } from "../src/seed/rows.js";
import { parseCount } from "../src/commands/seed-resource.js";

const contact: Resource = defineResource({
  name: "Contact",
  fields: {
    name: field.string(),
    email: field.string({ format: "email", unique: true }),
    phone: field.string({ required: false }),
    status: field.enum(["lead", "customer", "churned"], { required: false }),
    tags: field.multiselect(["vip", "press", "partner"], { required: false }),
    score: field.int({ min: 0, max: 10 }),
    vip: field.boolean({ required: false }),
    notes: field.text({ required: false }),
    companyId: field.belongsTo("Company", { required: false }),
  },
});

const rowsOf = (resource: Resource, count: number, options = {}) => [...seedRows(resource, count, { seed: 7, ...options })];

describe("parseCount", () => {
  it("reads plain numbers, separators and suffixes", () => {
    expect(parseCount(1000)).toBe(1000);
    expect(parseCount("1,000,000")).toBe(1_000_000);
    expect(parseCount("1_000")).toBe(1000);
    expect(parseCount("25k")).toBe(25_000);
    expect(parseCount("1m")).toBe(1_000_000);
    expect(parseCount("1.5k")).toBe(1500);
    expect(parseCount(undefined)).toBe(25);
  });

  it("refuses what isn't a count", () => {
    expect(() => parseCount("lots")).toThrow(/not a number of rows/);
    expect(() => parseCount("0")).toThrow(/at least one row/);
  });
});

describe("sqlLiteral", () => {
  it("quotes and escapes strings", () => {
    expect(sqlLiteral("Ada")).toBe("'Ada'");
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
    expect(sqlLiteral("-- drop'; DELETE FROM users; --")).toBe("'-- drop''; DELETE FROM users; --'");
  });

  it("stores the other kinds the way Drizzle does", () => {
    expect(sqlLiteral(42)).toBe("42");
    expect(sqlLiteral(true)).toBe("1");
    expect(sqlLiteral(false)).toBe("0");
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(undefined)).toBe("NULL");
    expect(sqlLiteral(new Date(1700000000000))).toBe("1700000000000");
    expect(sqlLiteral(["vip", "press"])).toBe(`'["vip","press"]'`);
    expect(sqlLiteral(Number.NaN)).toBe("NULL");
  });
});

describe("insertStatements", () => {
  const rows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: `id-${i}`, name: `Person ${i}` }));

  it("puts every row in exactly one statement", () => {
    const statements = [...insertStatements("contacts", ["id", "name"], rows(500), 1000)];
    expect(statements.length).toBeGreaterThan(1);
    expect(statements.reduce((total, statement) => total + statement.rows, 0)).toBe(500);
    expect(statements[0]!.sql.startsWith(`INSERT INTO "contacts" ("id","name") VALUES `)).toBe(true);
  });

  it("keeps statements under the byte limit", () => {
    for (const statement of insertStatements("contacts", ["id", "name"], rows(400), 800)) {
      expect(statement.sql.length).toBeLessThanOrEqual(800 + 40);
    }
  });

  it("writes one statement when everything fits", () => {
    const statements = [...insertStatements("contacts", ["id", "name"], rows(10))];
    expect(statements).toHaveLength(1);
    expect(statements[0]!.rows).toBe(10);
  });
});

describe("bulkInsert", () => {
  it("batches statements and reports progress once per batch", async () => {
    const calls: string[] = [];
    const progress: number[] = [];
    const rows = Array.from({ length: 300 }, (_, i) => ({ id: `id-${i}` }));
    const written = await bulkInsert(
      { exec: async (sql) => void calls.push(sql) },
      { table: "contacts", columns: ["id"], rows, maxBytes: 200, statementsPerCall: 3, onProgress: (count) => progress.push(count) },
    );
    expect(written).toBe(300);
    expect(calls.length).toBe(progress.length);
    expect(progress.at(-1)).toBe(300);
    // Each call holds at most three statements.
    for (const call of calls) expect(call.split(";\n").length).toBeLessThanOrEqual(3);
  });

  it("does nothing when there are no rows", async () => {
    let calls = 0;
    const written = await bulkInsert({ exec: async () => void calls++ }, { table: "contacts", columns: ["id"], rows: [] });
    expect(written).toBe(0);
    expect(calls).toBe(0);
  });
});

describe("seedRows", () => {
  it("writes a value for every column, in the descriptor's order", () => {
    expect(seedColumns(contact)).toEqual(["id", "name", "email", "phone", "status", "tags", "score", "vip", "notes", "company_id", "created_at", "updated_at"]);
    const [row] = rowsOf(contact, 1);
    for (const column of seedColumns(contact)) expect(row).toHaveProperty(column);
  });

  it("respects the field definitions", () => {
    for (const row of rowsOf(contact, 50)) {
      expect(row.name).toMatch(/\w+ \w+/);
      expect(row.email).toMatch(/^[^@\s]+@[^@\s]+$/);
      expect(row.score).toBeGreaterThanOrEqual(0);
      expect(row.score).toBeLessThanOrEqual(10);
      if (row.status !== null) expect(["lead", "customer", "churned"]).toContain(row.status);
      if (row.tags !== null) for (const tag of row.tags as string[]) expect(["vip", "press", "partner"]).toContain(tag);
      // Required fields are always there; optional ones are sometimes empty.
      expect(row.name).not.toBeNull();
    }
  });

  it("keeps unique columns unique, whatever the field looks like", () => {
    const emails = rowsOf(contact, 2000).map((row) => row.email);
    expect(new Set(emails).size).toBe(2000);

    // A reference, a slug and a plain name: none of these carry a counter of their own.
    const order = defineResource({
      name: "Order",
      fields: {
        reference: field.string({ unique: true }),
        handle: field.string({ format: "slug", unique: true }),
        title: field.string({ unique: true }),
      },
    });
    const rows = rowsOf(order, 1000);
    for (const key of ["reference", "handle", "title"]) {
      expect(new Set(rows.map((row) => row[key])).size, key).toBe(1000);
    }
  });

  it("gives every row its own sortable id", () => {
    const ids = rowsOf(contact, 500).map((row) => String(row.id));
    expect(new Set(ids).size).toBe(500);
    expect([...ids].sort()).toEqual(ids);
  });

  it("spreads the timestamps over the past year, updated after created", () => {
    const now = Date.UTC(2026, 5, 1);
    for (const row of rowsOf(contact, 200, { now })) {
      expect(row.created_at).toBeLessThanOrEqual(now);
      expect(row.created_at).toBeGreaterThan(now - 367 * 86_400_000);
      expect(row.updated_at).toBeGreaterThanOrEqual(row.created_at as number);
      expect(row.updated_at).toBeLessThanOrEqual(now);
    }
  });

  it("is repeatable with a seed, and different without one", () => {
    const first = rowsOf(contact, 5).map((row) => row.name);
    const again = rowsOf(contact, 5).map((row) => row.name);
    expect(again).toEqual(first);
    const different = [...seedRows(contact, 5, { seed: 8 })].map((row) => row.name);
    expect(different).not.toEqual(first);
  });

  it("points belongsTo at an existing parent, and leaves it empty when there are none", () => {
    const parents = new Map([["Company", ["company-1", "company-2"]]]);
    for (const row of rowsOf(contact, 20, { parentIds: parents })) {
      expect(["company-1", "company-2"]).toContain(row.company_id);
    }
    expect(rowsOf(contact, 5)[0]!.company_id).toBeNull();
  });

  it("says which resource to seed first when a required parent has no rows", () => {
    const invoice = defineResource({ name: "Invoice", fields: { customerId: field.belongsTo("Customer") } });
    expect(() => rowsOf(invoice, 1)).toThrow(/Seed Customer first/);
  });

  it("names people and companies from the field and resource name", () => {
    const company = defineResource({ name: "Company", fields: { name: field.string(), city: field.string() } });
    const [row] = rowsOf(company, 1);
    expect(String(row!.name)).toMatch(/(Labs|Works|Group|Studio|Systems|Partners|Supply|Analytics|Foods|Logistics)$/);
    expect(String(row!.city).length).toBeGreaterThan(2);
  });
});

describe("insertMany", () => {
  const columns = {
    id: { name: "id", defaultFn: () => "generated" },
    name: { name: "full_name" },
    active: { name: "active", mapToDriverValue: (value: unknown) => (value ? 1 : 0) },
  };
  const drizzle = { getTableName: () => "people", getTableColumns: () => columns };

  it("maps property names to columns and Drizzle's stored values", async () => {
    const calls: string[] = [];
    const insertMany = createInsertMany({ exec: async (sql) => void calls.push(sql) }, drizzle);
    const written = await insertMany(null, 2, (i) => ({ name: `Person ${i}`, active: i === 0 }));
    expect(written).toBe(2);
    expect(calls.join("\n")).toContain(`INSERT INTO "people" ("id","full_name","active")`);
    expect(calls.join("\n")).toContain(`('generated','Person 0',1)`);
    expect(calls.join("\n")).toContain(`('generated','Person 1',0)`);
  });

  it("takes an array of rows too", async () => {
    const insertMany = createInsertMany({ exec: async () => {} }, drizzle);
    expect(await insertMany(null, [{ name: "Ada" }, { name: "Grace" }])).toBe(2);
    expect(await insertMany(null, [])).toBe(0);
  });

  it("names a column that doesn't exist", async () => {
    const insertMany = createInsertMany({ exec: async () => {} }, drizzle);
    await expect(insertMany(null, 1, () => ({ nickname: "Ada" }))).rejects.toThrow(/no column called nickname/);
  });
});
