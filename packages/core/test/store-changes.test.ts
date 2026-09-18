import { drizzle } from "drizzle-orm/sql-js";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import initSqlJs from "sql.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineResource, field } from "../src/resource/index.js";
import { createResourceStore, type ChangeEvent } from "../src/server.js";

const deal = defineResource({ name: "Deal", fields: { title: field.string({ unique: true }), amount: field.int({ required: false }) } });

const deals = sqliteTable("deals", {
  id: text("id").primaryKey(),
  title: text("title").notNull().unique(),
  amount: integer("amount"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

const SQL = await initSqlJs();

let db: ReturnType<typeof drizzle>;
let changes: ChangeEvent[];

beforeEach(() => {
  const sqlite = new SQL.Database();
  sqlite.run(
    `CREATE TABLE deals (id TEXT PRIMARY KEY, title TEXT NOT NULL UNIQUE, amount INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  );
  db = drizzle(sqlite);
  changes = [];
});

const store = (onChange?: (event: ChangeEvent) => void | Promise<void>) =>
  createResourceStore({ resource: deal, table: deals, getDb: () => db, onChange });

const record = (onChange = (event: ChangeEvent) => void changes.push(event)) => store(onChange);

describe("resource store change events", () => {
  it("reports every successful write, with the record's id", async () => {
    const deals = record();
    const created = await deals.create({ title: "First" });
    expect(created.ok).toBe(true);
    const id = created.ok ? (created.data.id as string) : "";

    await deals.update(id, { amount: 10 });
    await deals.replace(id, { title: "First", amount: 20 });
    await deals.delete(id);

    expect(changes).toEqual([
      { resource: "Deal", action: "create", id },
      { resource: "Deal", action: "update", id },
      { resource: "Deal", action: "update", id },
      { resource: "Deal", action: "delete", id },
    ]);
  });

  it("stays quiet when a write doesn't happen", async () => {
    const deals = record();
    await deals.create({ title: "Taken" });
    changes = [];

    await deals.create({ title: "Taken" }); // unique violation
    await deals.create({ amount: 3 }); // fails validation
    await deals.update("missing-id", { amount: 1 });
    await deals.delete("missing-id");
    // Reads never announce anything.
    await deals.list(new URLSearchParams());
    await deals.get("missing-id");

    expect(changes).toEqual([]);
  });

  it("announces before the caller sees the result, so a cache can't be read back stale", async () => {
    const order: string[] = [];
    const deals = store(async () => {
      await Promise.resolve();
      order.push("invalidated");
    });
    await deals.create({ title: "Ordered" });
    order.push("returned");
    expect(order).toEqual(["invalidated", "returned"]);
  });

  it("keeps the write when the listener throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const deals = store(() => {
      throw new Error("cache is down");
    });

    const created = await deals.create({ title: "Survives" });
    expect(created.ok).toBe(true);
    expect(await deals.list(new URLSearchParams())).toMatchObject({ data: { meta: { total: 1 } } });
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
