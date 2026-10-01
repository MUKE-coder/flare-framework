import { defineResource, field } from "@flaredev/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createResourceStore } from "../templates/app/lib/resource/store.js";
import type { ConstraintHit, ResourceRows, Row, RowsQuery } from "../templates/app/lib/resource/rows.js";
import { renderCollectionRoute, renderItemRoute, renderTableModule } from "../src/generator/render.js";
import { renderPrismaModel } from "../src/generator/prisma.js";
import type { LoadedResource } from "../src/generator/load.js";

/**
 * `softDelete: true` — a delete stamps `deletedAt`, every read leaves those rows out.
 *
 * The failure worth guarding against is not an error. It is a deleted record turning up
 * somewhere, or a restore that quietly does nothing.
 */
const ticket = defineResource({
  name: "Ticket",
  softDelete: true,
  fields: { subject: field.string(), status: field.enum(["open", "closed"]) },
});
const plain = defineResource({ name: "Note", fields: { title: field.string() } });
const loaded = (resource: typeof ticket): LoadedResource => ({ resource, stem: "ticket", file: "resources/ticket.resource.ts" });

/** A ResourceRows over an array, with enough of a filter to show the column working. */
function memoryRows(seed: Row[] = []): ResourceRows & { all: Row[] } {
  const all = [...seed];
  const matches = (row: Row, query: Pick<RowsQuery, "search" | "filters" | "deleted">) => {
    for (const [key, value] of Object.entries(query.filters)) {
      if (value === null ? row[key] != null : row[key] !== value) return false;
    }
    // The adapters' half of the feature: translating `deleted` into a where clause.
    if (query.deleted === "exclude" && row.deletedAt != null) return false;
    if (query.deleted === "only" && row.deletedAt == null) return false;
    return true;
  };
  return {
    all,
    db: {},
    async find(query) {
      return all.filter((row) => matches(row, query)).slice(query.offset ?? 0, (query.offset ?? 0) + query.limit);
    },
    async countUpTo(query, limit) {
      return Math.min(all.filter((row) => matches(row, query)).length, limit);
    },
    async byId(id) {
      return all.find((row) => row.id === id) ?? null;
    },
    async titles(ids, titleField) {
      return all.filter((row) => ids.includes(String(row.id))).map((row) => ({ id: String(row.id), title: row[titleField] }));
    },
    async insert(values) {
      all.push({ ...values });
      return { ...values };
    },
    async update(id, values) {
      const row = all.find((entry) => entry.id === id);
      if (!row) return null;
      for (const [key, value] of Object.entries(values)) if (value !== undefined) row[key] = value;
      return { ...row };
    },
    async remove(id) {
      const at = all.findIndex((row) => row.id === id);
      if (at === -1) return false;
      all.splice(at, 1);
      return true;
    },
    constraint(): ConstraintHit | undefined {
      return undefined;
    },
  };
}

let rows: ReturnType<typeof memoryRows>;
const store = () => createResourceStore({ resource: ticket, rows });

beforeEach(() => {
  rows = memoryRows([
    { id: "a", subject: "Alive", status: "open", createdAt: new Date(1), updatedAt: new Date(1), deletedAt: null },
    { id: "b", subject: "Binned", status: "open", createdAt: new Date(2), updatedAt: new Date(2), deletedAt: null },
  ]);
});

describe("deleting", () => {
  it("keeps the row and stamps it", async () => {
    expect((await store().delete("b")).ok).toBe(true);
    const row = rows.all.find((entry) => entry.id === "b");
    expect(row, "the row was removed, not stamped").toBeDefined();
    expect(row!.deletedAt).toBeInstanceOf(Date);
  });

  it("removes it for good with force", async () => {
    expect((await store().delete("b", { force: true })).ok).toBe(true);
    expect(rows.all.map((row) => row.id)).toEqual(["a"]);
  });

  it("refuses a second delete rather than moving the date", async () => {
    await store().delete("b");
    const stamped = rows.all.find((row) => row.id === "b")!.deletedAt;
    const again = await store().delete("b");
    expect(!again.ok && again.status).toBe(404);
    expect(rows.all.find((row) => row.id === "b")!.deletedAt).toBe(stamped);
  });

  it("still removes the row on a resource that does not soft-delete", async () => {
    const notes = memoryRows([{ id: "n", title: "x", createdAt: new Date(), updatedAt: new Date() }]);
    const open = createResourceStore({ resource: plain, rows: notes });
    expect((await open.delete("n")).ok).toBe(true);
    expect(notes.all).toEqual([]);
  });
});

describe("reading", () => {
  it("leaves deleted rows out of the list and the count", async () => {
    await store().delete("b");
    const result = await store().list(new URLSearchParams());
    expect(result.ok && result.data.data.map((row) => row.id)).toEqual(["a"]);
    expect(result.ok && result.data.meta.total).toBe(1);
  });

  it("shows them with ?deleted=only, and both with all", async () => {
    await store().delete("b");
    const trash = await store().list(new URLSearchParams({ deleted: "only" }));
    expect(trash.ok && trash.data.data.map((row) => row.id)).toEqual(["b"]);
    const both = await store().list(new URLSearchParams({ deleted: "all" }));
    expect(both.ok && both.data.data.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("refuses a ?deleted it does not understand", async () => {
    const result = await store().list(new URLSearchParams({ deleted: "perhaps" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.status).toBe(400);
  });

  it("answers 404 for a deleted record read directly", async () => {
    await store().delete("b");
    const result = await store().get("b");
    expect(!result.ok && result.status).toBe(404);
    // The trash view has to be able to read one, which is what the option is for.
    expect((await store().get("b", { deleted: "only" })).ok).toBe(true);
  });
});

describe("restoring", () => {
  it("clears the stamp", async () => {
    await store().delete("b");
    const restored = await store().restore("b");
    expect(restored.ok).toBe(true);
    expect(rows.all.find((row) => row.id === "b")!.deletedAt).toBeNull();
    const result = await store().list(new URLSearchParams());
    expect(result.ok && result.data.data.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("is 404 for a record that is not in the trash", async () => {
    const result = await store().restore("a");
    expect(!result.ok && result.status).toBe(404);
  });

  it("is 404 on a resource that does not keep deleted rows", async () => {
    // There is nothing to restore, and pretending otherwise would be worse than saying so.
    const notes = memoryRows([{ id: "n", title: "x", createdAt: new Date(), updatedAt: new Date() }]);
    const open = createResourceStore({ resource: plain, rows: notes });
    const result = await open.restore("n");
    expect(!result.ok && result.status).toBe(404);
  });
});

describe("the column", () => {
  it("is nullable and indexed on Drizzle", () => {
    const table = renderTableModule(loaded(ticket), [loaded(ticket)]);
    expect(table).toContain('deletedAt: integer("deleted_at", { mode: "timestamp_ms" })');
    expect(table).not.toContain('deleted_at", { mode: "timestamp_ms" }).notNull()');
    // Every read filters on it, so this is not an optional index.
    expect(table).toContain('index("tickets_deleted_at_idx").on(table.deletedAt)');
  });

  it("is nullable and indexed on Prisma", () => {
    const model = renderPrismaModel(loaded(ticket), [loaded(ticket)]);
    expect(model).toContain('deletedAt DateTime? @map("deleted_at")');
    expect(model).toContain("@@index([deletedAt])");
  });

  it("is absent on a resource that does not ask for it", () => {
    const note: LoadedResource = { resource: plain, stem: "note", file: "resources/note.resource.ts" };
    expect(renderTableModule(note, [note])).not.toContain("deleted_at");
    expect(renderPrismaModel(note, [note])).not.toContain("deleted_at");
  });
});

describe("the generated route", () => {
  it("offers ?force=true on delete", () => {
    const item = renderItemRoute(loaded(ticket));
    expect(item).toContain('searchParams.get("force") === "true"');
    expect(item).toContain("store.delete(id, { force })");
  });

  it("says what delete does now, in the route's own comment", () => {
    expect(renderItemRoute(loaded(ticket))).toMatch(/move one ticket to the trash/i);
  });

  it("leaves an ordinary resource's delete alone", () => {
    const note: LoadedResource = { resource: plain, stem: "note", file: "resources/note.resource.ts" };
    const item = renderItemRoute(note);
    expect(item).toContain("await store.delete(id)");
    expect(item).not.toContain("force");
  });

  it("does not change the collection route", () => {
    // Soft delete is about one record; listing already filters through the store.
    expect(renderCollectionRoute(loaded(ticket))).not.toContain("force");
  });
});
