import { defineResource, definePolicy, field } from "@flaredev/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createResourceStore } from "../templates/app/lib/resource/store.js";
import type { ConstraintHit, ResourceRows, Row, RowsQuery } from "../templates/app/lib/resource/rows.js";

/**
 * Per-record ownership, against the engine itself.
 *
 * The store is a template file rather than a compiled module, but it imports only
 * `@flaredev/core` and its own siblings, so it runs here exactly as it runs in an app.
 * That makes this both the test for ownership and the worked example of the in-memory
 * `rows` the store's own comments promise you can write.
 */
const invoice = defineResource({
  name: "Invoice",
  fields: {
    number: field.string(),
    total: field.float(),
    userId: field.belongsTo("User"),
  },
});

/** A ResourceRows over a plain array: enough of one to drive the store. */
function memoryRows(seed: Row[] = []): ResourceRows & { all: Row[] } {
  const all = [...seed];
  const matches = (row: Row, query: Pick<RowsQuery, "search" | "filters">) => {
    for (const [key, value] of Object.entries(query.filters)) {
      if (value === null ? row[key] != null : row[key] !== value) return false;
    }
    if (query.search) {
      const term = query.search.term.toLowerCase();
      if (!query.search.fields.some((key) => String(row[key] ?? "").toLowerCase().includes(term))) return false;
    }
    return true;
  };
  return {
    all,
    db: { memory: true },
    async find(query) {
      const found = all.filter((row) => matches(row, query));
      found.sort((a, b) => {
        const left = String(a[query.sort.field] ?? "");
        const right = String(b[query.sort.field] ?? "");
        return (left < right ? -1 : left > right ? 1 : 0) * (query.sort.direction === "desc" ? -1 : 1);
      });
      return found.slice(query.offset ?? 0, (query.offset ?? 0) + query.limit);
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

const policy = definePolicy({
  resource: "Invoice",
  read: ["staff", "admin"],
  create: ["staff", "admin"],
  update: ["staff", "admin"],
  delete: ["admin"],
  own: { field: "userId", except: ["admin"] },
});

const ada = { id: "user-ada", email: "ada@example.com", role: "staff" };
const bob = { id: "user-bob", email: "bob@example.com", role: "staff" };
const root = { id: "user-root", email: "root@example.com", role: "admin" };

let rows: ReturnType<typeof memoryRows>;
let signedInAs: { id: string; email: string; role: string } | null;

/** A store as a route builds one: the resource, the rows, the policy, the session. */
const store = () => createResourceStore({ resource: invoice, rows, policy, currentUser: () => signedInAs });

beforeEach(() => {
  rows = memoryRows([
    { id: "a1", number: "A-1", total: 10, userId: ada.id, createdAt: new Date(1), updatedAt: new Date(1) },
    { id: "b1", number: "B-1", total: 20, userId: bob.id, createdAt: new Date(2), updatedAt: new Date(2) },
  ]);
  signedInAs = ada;
});

describe("a list", () => {
  it("returns only the rows the user owns", async () => {
    const result = await store().list(new URLSearchParams());
    expect(result.ok && result.data.data.map((row) => row.id)).toEqual(["a1"]);
    expect(result.ok && result.data.meta.total).toBe(1);
  });

  it("cannot be widened by a filter on the owner field", async () => {
    // The obvious attack: ask for another user's rows by name. The owner filter is set
    // for you and any value sent for it is replaced, the same way create fills it in —
    // so this returns your own rows, and never bob's.
    const result = await store().list(new URLSearchParams({ "filter[userId]": bob.id }));
    expect(result.ok && result.data.data.map((row) => row.id)).toEqual(["a1"]);
    expect(result.ok && result.data.data.some((row) => row.userId === bob.id)).toBe(false);
  });

  it("gives an exempt role every row", async () => {
    signedInAs = root;
    const result = await store().list(new URLSearchParams());
    expect(result.ok && result.data.data.map((row) => row.id)).toEqual(["a1", "b1"]);
  });
});

describe("reading one record", () => {
  it("finds your own", async () => {
    expect((await store().get("a1")).ok).toBe(true);
  });

  it("reports another user's as missing, not forbidden", async () => {
    // 403 would confirm the record exists, which is the thing being withheld.
    const result = await store().get("b1");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.status).toBe(404);
  });
});

describe("creating", () => {
  it("fills in the owner, so the client never sends it", async () => {
    const result = await store().create({ number: "A-2", total: 5 });
    expect(result.ok, result.ok ? "" : JSON.stringify(result)).toBe(true);
    expect(result.ok && result.data.userId).toBe(ada.id);
  });

  it("overrides an attempt to create a row in another name", async () => {
    const result = await store().create({ number: "A-3", total: 5, userId: bob.id });
    expect(result.ok && result.data.userId).toBe(ada.id);
  });
});

describe("updating", () => {
  it("changes your own", async () => {
    const result = await store().update("a1", { total: 99 });
    expect(result.ok && result.data.total).toBe(99);
  });

  it("will not touch another user's, and does not admit it exists", async () => {
    const result = await store().update("b1", { total: 99 });
    expect(!result.ok && result.status).toBe(404);
    expect(rows.all.find((row) => row.id === "b1")?.total).toBe(20);
  });

  it("refuses to give a record away rather than ignoring the attempt", async () => {
    const result = await store().update("a1", { userId: bob.id });
    expect(!result.ok && result.status).toBe(422);
    expect(!result.ok && result.error).toMatch(/change which user/i);
    expect(rows.all.find((row) => row.id === "a1")?.userId).toBe(ada.id);
  });

  it("accepts the owner field when it is unchanged", async () => {
    // A client that round-trips a whole record should not be punished for sending it back.
    expect((await store().update("a1", { userId: ada.id, total: 7 })).ok).toBe(true);
  });
});

describe("replacing", () => {
  it("keeps the owner, which PUT would otherwise clear", async () => {
    const result = await store().replace("a1", { number: "A-1b", total: 1, userId: ada.id });
    expect(result.ok && result.data.userId).toBe(ada.id);
  });

  it("will not replace another user's", async () => {
    const result = await store().replace("b1", { number: "taken", total: 1, userId: ada.id });
    expect(!result.ok && result.status).toBe(404);
    expect(rows.all.find((row) => row.id === "b1")?.number).toBe("B-1");
  });
});

describe("deleting", () => {
  it("removes your own", async () => {
    expect((await store().delete("a1")).ok).toBe(true);
    expect(rows.all.map((row) => row.id)).toEqual(["b1"]);
  });

  it("leaves another user's where it is", async () => {
    const result = await store().delete("b1");
    expect(!result.ok && result.status).toBe(404);
    expect(rows.all.map((row) => row.id)).toEqual(["a1", "b1"]);
  });
});

describe("without a session", () => {
  it("refuses rather than returning everything", async () => {
    // The dangerous failure: a missing session read as "no restriction".
    signedInAs = null;
    const result = await store().list(new URLSearchParams());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.status).toBe(403);
  });
});

describe("a store built with no currentUser at all", () => {
  it("is unrestricted, which is how a seed writes rows for anybody", async () => {
    const seeding = createResourceStore({ resource: invoice, rows, policy });
    const result = await seeding.list(new URLSearchParams());
    expect(result.ok && result.data.data.map((row) => row.id)).toEqual(["a1", "b1"]);
    expect((await seeding.create({ number: "S-1", total: 1, userId: bob.id })).ok).toBe(true);
  });
});

describe("a policy naming a field the resource has not got", () => {
  it("fails when the store is built, not on the first query", async () => {
    expect(() =>
      createResourceStore({
        resource: invoice,
        rows,
        policy: definePolicy({ resource: "Invoice", read: ["staff"], own: { field: "ownerId" } }),
        currentUser: () => ada,
      }),
    ).toThrow(/own\.field is "ownerId"/);
  });
});

describe("a resource with no policy", () => {
  it("is unchanged: every row, as before", async () => {
    const open = createResourceStore({ resource: invoice, rows, currentUser: () => ada });
    const result = await open.list(new URLSearchParams());
    expect(result.ok && result.data.data.map((row) => row.id)).toEqual(["a1", "b1"]);
  });
});
