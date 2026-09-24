import { describe, expect, it, vi } from "vitest";
import { defineResource, field } from "../src/resource/index.js";
import { createResourceStore } from "../src/server.js";
import { prismaRows, type PrismaDelegate } from "../src/server/prisma-rows.js";

/**
 * A stand-in for a Prisma model delegate.
 *
 * The point of these tests isn't that Prisma works — it's that the translation from a
 * descriptor to a Prisma query is the one we meant, and that the store on top behaves
 * the same as it does over Drizzle. A fake delegate shows both without a database.
 */
function fakeDelegate(rows: Record<string, unknown>[] = []) {
  const calls: { method: string; args: Record<string, unknown> }[] = [];
  const record = (method: string) => (args: Record<string, unknown>) => {
    calls.push({ method, args });
    return args;
  };
  const delegate: PrismaDelegate = {
    findMany: vi.fn(async (args) => (record("findMany")(args), rows)),
    findUnique: vi.fn(async (args) => (record("findUnique")(args), rows[0] ?? null)),
    count: vi.fn(async (args) => (record("count")(args), rows.length)),
    create: vi.fn(async (args) => (record("create")(args), { id: "new", ...(args.data as object) })),
    update: vi.fn(async (args) => (record("update")(args), { id: "1", ...(args.data as object) })),
    delete: vi.fn(async (args) => (record("delete")(args), rows[0] ?? { id: "1" })),
  };
  return { delegate, calls, last: (method: string) => [...calls].reverse().find((call) => call.method === method)?.args };
}

const contact = defineResource({
  name: "Contact",
  fields: {
    name: field.string(),
    email: field.string({ format: "email", unique: true }),
    status: field.enum(["lead", "customer"]),
  },
});

const storeOver = (delegate: PrismaDelegate) => createResourceStore({ resource: contact, rows: prismaRows(delegate, { client: true }) });

describe("prismaRows translation", () => {
  it("turns a search into an insensitive contains across the searchable fields", async () => {
    const { delegate, last } = fakeDelegate();
    await storeOver(delegate).list(new URLSearchParams({ q: "ada" }));
    expect(last("findMany")!.where).toMatchObject({
      OR: [
        { name: { contains: "ada", mode: "insensitive" } },
        { email: { contains: "ada", mode: "insensitive" } },
      ],
    });
  });

  it("passes filters through as equality, and sorts by the field then the id", async () => {
    const { delegate, last } = fakeDelegate();
    await storeOver(delegate).list(new URLSearchParams({ "filter[status]": "lead", sort: "-createdAt" }));
    const args = last("findMany")!;
    expect(args.where).toMatchObject({ status: "lead" });
    expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
  });

  it("asks for one row more than the page, so it knows there is a next one", async () => {
    const { delegate, last } = fakeDelegate();
    await storeOver(delegate).list(new URLSearchParams({ perPage: "10" }));
    expect(last("findMany")!.take).toBe(11);
  });

  it("pages by offset when there is no cursor", async () => {
    const { delegate, last } = fakeDelegate();
    await storeOver(delegate).list(new URLSearchParams({ page: "3", perPage: "10" }));
    expect(last("findMany")!.skip).toBe(20);
  });

  it("caps the count rather than counting a whole table", async () => {
    const { delegate, last } = fakeDelegate();
    await storeOver(delegate).list(new URLSearchParams());
    expect(last("count")!.take).toBe(10_001);
  });

  it("compares the sort field and the id together when following a cursor", async () => {
    // Two rows for a page of one, so the list knows there is a next page to point at.
    const { delegate } = fakeDelegate([
      { id: "1", name: "Ada", email: "a@b.c", status: "lead", createdAt: new Date(5) },
      { id: "2", name: "Bea", email: "b@b.c", status: "lead", createdAt: new Date(9) },
    ]);
    const first = await storeOver(delegate).list(new URLSearchParams({ perPage: "1" }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.meta.nextCursor).toBeTruthy();

    const { delegate: second, last: lastOf } = fakeDelegate();
    await storeOver(second).list(new URLSearchParams({ perPage: "1", cursor: first.data.meta.nextCursor! }));
    // The default sort is newest first, so "the next page" means earlier than the cursor:
    // either past its sort value, or level with it and past its id.
    const and = (lastOf("findMany")!.where as { AND: { OR: unknown[] }[] }).AND;
    expect(and[0]!.OR).toEqual([{ createdAt: { lt: 5 } }, { AND: [{ createdAt: 5 }, { id: { lt: "1" } }] }]);
  });

  it("turns the comparison round when the sort is ascending", async () => {
    const { delegate } = fakeDelegate([
      { id: "1", name: "Ada", email: "a@b.c", status: "lead", createdAt: new Date(5) },
      { id: "2", name: "Bea", email: "b@b.c", status: "lead", createdAt: new Date(9) },
    ]);
    const first = await storeOver(delegate).list(new URLSearchParams({ perPage: "1", sort: "createdAt" }));
    if (!first.ok) throw new Error("setup failed");

    const { delegate: second, last: lastOf } = fakeDelegate();
    await storeOver(second).list(new URLSearchParams({ perPage: "1", sort: "createdAt", cursor: first.data.meta.nextCursor! }));
    const and = (lastOf("findMany")!.where as { AND: { OR: unknown[] }[] }).AND;
    expect(and[0]!.OR).toEqual([{ createdAt: { gt: 5 } }, { AND: [{ createdAt: 5 }, { id: { gt: "1" } }] }]);
  });

  it("selects only the id and the title when resolving relation labels", async () => {
    const { delegate, last } = fakeDelegate([{ id: "1", name: "Ada" }]);
    const titles = await storeOver(delegate).titles(["1"]);
    expect(last("findMany")!.select).toEqual({ id: true, name: true });
    expect(titles).toEqual({ "1": "Ada" });
  });
});

describe("the store behaves the same over Prisma", () => {
  it("validates before writing, and never reaches the database when it fails", async () => {
    const { delegate } = fakeDelegate();
    const result = await storeOver(delegate).create({ name: "Ada", email: "not-an-email", status: "lead" });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.status).toBe(422);
    expect(delegate.create).not.toHaveBeenCalled();
  });

  it("stamps an id and the timestamps on create", async () => {
    const { delegate, last } = fakeDelegate();
    const result = await storeOver(delegate).create({ name: "Ada", email: "ada@example.com", status: "lead" });
    expect(result.ok).toBe(true);
    const data = last("create")!.data as Record<string, unknown>;
    expect(data.id).toEqual(expect.any(String));
    expect(data.createdAt).toBeInstanceOf(Date);
    expect(data.updatedAt).toBeInstanceOf(Date);
  });

  it("turns a unique violation into the same 409 the other stack gives", async () => {
    const { delegate } = fakeDelegate();
    delegate.create = vi.fn(async () => {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: ["email"] } });
    });
    const result = await storeOver(delegate).create({ name: "Ada", email: "ada@example.com", status: "lead" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(result.error).toBe("Email is already taken.");
    expect(result.field).toBe("email");
  });

  it("reads a unique violation reported as a Postgres index name", async () => {
    const { delegate } = fakeDelegate();
    delegate.create = vi.fn(async () => {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002", meta: { target: "contacts_email_key" } });
    });
    const result = await storeOver(delegate).create({ name: "Ada", email: "ada@example.com", status: "lead" });
    expect(!result.ok && result.field).toBe("email");
  });

  it("answers 404 rather than throwing when an update or delete matches nothing", async () => {
    const { delegate } = fakeDelegate();
    const missing = () => {
      throw Object.assign(new Error("Record not found"), { code: "P2025" });
    };
    delegate.update = vi.fn(missing);
    delegate.delete = vi.fn(missing);
    const store = storeOver(delegate);
    expect((await store.update("nope", { name: "Ada" })).ok).toBe(false);
    expect((await store.delete("nope")).ok).toBe(false);
    const deleted = await store.delete("nope");
    expect(!deleted.ok && deleted.status).toBe(404);
  });

  it("runs the descriptor's hooks and computed values, the same as over Drizzle", async () => {
    const { delegate, last } = fakeDelegate();
    const withHooks = defineResource({
      name: "Contact",
      fields: { name: field.string(), email: field.string({ format: "email" }), status: field.enum(["lead", "customer"]) },
      computed: { shouting: (row) => String(row.name).toUpperCase() },
      hooks: { beforeCreate: (input) => ({ ...input, name: `${String(input.name)} Lovelace` }) },
    });
    const store = createResourceStore({ resource: withHooks, rows: prismaRows(delegate, {}) });
    const result = await store.create({ name: "Ada", email: "ada@example.com", status: "lead" });
    expect((last("create")!.data as { name: string }).name).toBe("Ada Lovelace");
    expect(result.ok && result.data.shouting).toBe("ADA LOVELACE");
  });

  it("hands hooks the Prisma client as their db", async () => {
    const { delegate } = fakeDelegate();
    const client = { marker: "prisma" };
    let seen: unknown;
    const resource = defineResource({
      name: "Contact",
      fields: { name: field.string(), email: field.string({ format: "email" }), status: field.enum(["lead", "customer"]) },
      hooks: { beforeCreate: (input, context) => ((seen = context.db), input) },
    });
    await createResourceStore({ resource, rows: prismaRows(delegate, client) }).create({
      name: "Ada",
      email: "ada@example.com",
      status: "lead",
    });
    expect(seen).toBe(client);
  });
});

describe("a store with neither a table nor rows", () => {
  it("says so rather than failing later", () => {
    expect(() => createResourceStore({ resource: contact })).toThrow(/needs either a Drizzle table and getDb, or rows/);
  });
});
