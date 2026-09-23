import { drizzle } from "drizzle-orm/sql-js";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import initSqlJs from "sql.js";
import { beforeEach, describe, expect, it } from "vitest";
import { defineResource, field, type Resource } from "../src/resource/index.js";
import { createResourceStore } from "../src/server.js";

const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  reference: text("reference").notNull(),
  quantity: integer("quantity").notNull(),
  price: real("price").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

const SQL = await initSqlJs();
let db: ReturnType<typeof drizzle>;

beforeEach(() => {
  const sqlite = new SQL.Database();
  sqlite.run(`CREATE TABLE orders (
    id TEXT PRIMARY KEY, reference TEXT NOT NULL, quantity INTEGER NOT NULL, price REAL NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  db = drizzle(sqlite);
});

const store = (resource: Resource, currentUser?: () => { id: string; email: string } | null) =>
  createResourceStore({ resource, table: orders, getDb: () => db, currentUser });

const base = { reference: "a-1", quantity: 2, price: 5 };

describe("resource hooks", () => {
  it("lets beforeCreate change the input, and tells afterCreate what was saved", async () => {
    const seen: Record<string, unknown>[] = [];
    const order = defineResource({
      name: "Order",
      fields: { reference: field.string(), quantity: field.int(), price: field.float() },
      hooks: {
        beforeCreate: (input, context) => ({ ...input, reference: `${String(input.reference).toUpperCase()}-${context.user?.id ?? "anon"}` }),
        afterCreate: (record) => void seen.push(record),
      },
    });

    const result = await store(order, () => ({ id: "u1", email: "ada@example.com" })).create(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.reference).toBe("A-1-u1");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.reference).toBe("A-1-u1");
  });

  it("refuses a write when a hook throws, and writes nothing", async () => {
    const order = defineResource({
      name: "Order",
      fields: { reference: field.string(), quantity: field.int(), price: field.float() },
      hooks: {
        beforeCreate: () => {
          throw new Error("Orders are closed today.");
        },
      },
    });
    await expect(store(order).create(base)).rejects.toThrow(/closed today/);
    const listed = await store(defineResource({ name: "Order", fields: { reference: field.string(), quantity: field.int(), price: field.float() } })).list(
      new URLSearchParams(),
    );
    expect(listed.ok && listed.data.data).toHaveLength(0);
  });

  it("hands beforeUpdate the record as it was, and afterUpdate both versions", async () => {
    let before: unknown;
    let previous: unknown;
    const plain = defineResource({ name: "Order", fields: { reference: field.string(), quantity: field.int(), price: field.float() } });
    const created = await store(plain).create(base);
    if (!created.ok) throw new Error("setup failed");

    const order = defineResource({
      name: "Order",
      fields: { reference: field.string(), quantity: field.int(), price: field.float() },
      hooks: {
        beforeUpdate: (input, context) => {
          before = context.current;
          return input;
        },
        afterUpdate: (_record, context) => void (previous = context.previous),
      },
    });
    const updated = await store(order).update(String(created.data.id), { quantity: 9 });
    expect(updated.ok).toBe(true);
    expect((before as { quantity: number }).quantity).toBe(2);
    expect((previous as { quantity: number }).quantity).toBe(2);
  });

  it("lets beforeDelete refuse, leaving the record there", async () => {
    const plain = defineResource({ name: "Order", fields: { reference: field.string(), quantity: field.int(), price: field.float() } });
    const created = await store(plain).create(base);
    if (!created.ok) throw new Error("setup failed");

    const order = defineResource({
      name: "Order",
      fields: { reference: field.string(), quantity: field.int(), price: field.float() },
      hooks: {
        beforeDelete: ({ current }) => {
          if ((current as { quantity: number } | null)?.quantity) throw new Error("This order has been placed.");
        },
      },
    });
    await expect(store(order).delete(String(created.data.id))).rejects.toThrow(/has been placed/);
    const still = await store(plain).get(String(created.data.id));
    expect(still.ok).toBe(true);
  });
});

describe("computed fields", () => {
  const order = defineResource({
    name: "Order",
    fields: { reference: field.string(), quantity: field.int(), price: field.float() },
    computed: {
      total: (record) => Number(record.quantity) * Number(record.price),
      // A computed value that throws shouldn't take the record with it.
      broken: () => {
        throw new Error("nope");
      },
    },
  });

  it("adds them to created, fetched and listed records", async () => {
    const created = await store(order).create(base);
    expect(created.ok && created.data.total).toBe(10);
    if (!created.ok) return;

    const fetched = await store(order).get(String(created.data.id));
    expect(fetched.ok && fetched.data.total).toBe(10);

    const listed = await store(order).list(new URLSearchParams());
    expect(listed.ok && listed.data.data[0]!.total).toBe(10);
    expect(listed.ok && listed.data.data[0]!.broken).toBeNull();
  });

  it("recomputes after an update rather than keeping the old value", async () => {
    const created = await store(order).create(base);
    if (!created.ok) throw new Error("setup failed");
    const updated = await store(order).update(String(created.data.id), { quantity: 4 });
    expect(updated.ok && updated.data.total).toBe(20);
  });
});
