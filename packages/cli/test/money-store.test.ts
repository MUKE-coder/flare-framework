import { defineResource, field } from "@flaredev/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createResourceStore } from "../templates/app/lib/resource/store.js";
import { decodeCursor } from "../templates/app/lib/resource/query.js";
import type { ConstraintHit, ResourceRows, Row, RowsQuery } from "../templates/app/lib/resource/rows.js";

/**
 * The money boundary in the store.
 *
 * A money column holds whole minor units, and the store is the only place that knows it.
 * These watch the seam from both sides: what reaches the row adapter, and what comes back
 * out of the store.
 */
const invoice = defineResource({
  name: "Invoice",
  fields: {
    number: field.string(),
    total: field.float({ format: "money", filterable: true }),
    tip: field.float({ format: "money", required: false }),
    yen: field.int({ format: "money", currency: "JPY" }),
    weight: field.float(),
  },
  computed: {
    // Written against the units the descriptor talks about, so it must see 19.99.
    withTip: (row) => Number(row.total) + Number(row.tip ?? 0),
  },
});

/** A ResourceRows that records exactly what it was handed. */
function memoryRows(seed: Row[] = []) {
  const all = [...seed];
  const seen: { inserted: Row[]; updated: Row[]; queries: RowsQuery[] } = { inserted: [], updated: [], queries: [] };
  const matches = (row: Row, query: Pick<RowsQuery, "filters">) =>
    Object.entries(query.filters).every(([key, value]) => (value === null ? row[key] == null : row[key] === value));

  const rows: ResourceRows & { all: Row[]; seen: typeof seen } = {
    all,
    seen,
    db: {},
    async find(query) {
      seen.queries.push(query);
      const found = all.filter((row) => matches(row, query));
      found.sort((a, b) => Number(a[query.sort.field] ?? 0) - Number(b[query.sort.field] ?? 0));
      const after = query.cursor ? found.filter((row) => Number(row[query.cursor!.field]) > Number(query.cursor!.value)) : found;
      return after.slice(query.offset ?? 0, (query.offset ?? 0) + query.limit);
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
      seen.inserted.push({ ...values });
      all.push({ ...values });
      return { ...values };
    },
    async update(id, values) {
      seen.updated.push({ ...values });
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
  return rows;
}

let rows: ReturnType<typeof memoryRows>;
const store = () => createResourceStore({ resource: invoice, rows });

beforeEach(() => {
  rows = memoryRows();
});

describe("on the way in", () => {
  it("hands the adapter whole minor units", async () => {
    const result = await store().create({ number: "A-1", total: 19.99, tip: 0.07, yen: 1500, weight: 1.5 });
    expect(result.ok, result.ok ? "" : JSON.stringify(result)).toBe(true);
    const written = rows.seen.inserted[0]!;
    expect(written.total).toBe(1999);
    expect(written.tip).toBe(7);
    // A zero-exponent currency is already whole, so it is stored as given.
    expect(written.yen).toBe(1500);
    // An ordinary float is not money and is left alone.
    expect(written.weight).toBe(1.5);
  });

  it("converts an update too", async () => {
    const created = await store().create({ number: "A-1", total: 10, yen: 1, weight: 1 });
    await store().update(String((created as { data: Row }).data.id), { total: 0.03 });
    expect(rows.seen.updated.at(-1)!.total).toBe(3);
  });

  it("converts a replace, which rewrites every field", async () => {
    const created = await store().create({ number: "A-1", total: 10, yen: 1, weight: 1 });
    await store().replace(String((created as { data: Row }).data.id), { number: "A-2", total: 2.5, yen: 7, weight: 2 });
    expect(rows.seen.updated.at(-1)!.total).toBe(250);
  });
});

describe("on the way out", () => {
  it("gives back the amounts that went in", async () => {
    const created = await store().create({ number: "A-1", total: 19.99, tip: 0.07, yen: 1500, weight: 1.5 });
    const data = (created as { data: Row }).data;
    expect(data.total).toBe(19.99);
    expect(data.tip).toBe(0.07);
    expect(data.yen).toBe(1500);
  });

  it("converts a list as well as a single record", async () => {
    await store().create({ number: "A-1", total: 19.99, yen: 1, weight: 1 });
    const listed = await store().list(new URLSearchParams());
    expect(listed.ok && listed.data.data[0]!.total).toBe(19.99);
  });

  it("reads a bigint back, which is what Prisma hands over", async () => {
    // The Postgres column is BigInt, so the adapter returns a bigint rather than a number.
    rows.all.push({ id: "x", number: "A-9", total: 1999n, tip: null, yen: 5, weight: 1, createdAt: new Date(), updatedAt: new Date() });
    const result = await store().get("x");
    expect(result.ok && result.data.total).toBe(19.99);
  });

  it("shows a computed value the amounts, not the cents", async () => {
    // `withTip` adds total and tip. Against stored units it would be 2006, not 20.06.
    const created = await store().create({ number: "A-1", total: 19.99, tip: 0.07, yen: 1, weight: 1 });
    expect((created as { data: Row }).data.withTip).toBe(20.06);
  });
});

describe("querying", () => {
  it("converts a filter, so it is written in the units the caller knows", async () => {
    await store().create({ number: "A-1", total: 19.99, yen: 1, weight: 1 });
    await store().create({ number: "A-2", total: 5, yen: 1, weight: 1 });
    const listed = await store().list(new URLSearchParams({ "filter[total]": "19.99" }));
    expect(listed.ok && listed.data.data.map((row) => row.number)).toEqual(["A-1"]);
    // And the adapter saw cents, because that is what the column holds.
    expect(rows.seen.queries.at(-1)!.filters.total).toBe(1999);
  });

  it("puts the stored value in a cursor, not the amount", async () => {
    // A cursor is compared against the column on the next request. Carrying 19.99 would
    // compare an amount with a column of cents, and the same page would come back forever.
    for (const [number, total] of [["A-1", 1], ["A-2", 2], ["A-3", 3]] as const) {
      await store().create({ number, total, yen: 1, weight: 1 });
    }
    const page = await store().list(new URLSearchParams({ perPage: "2", sort: "total" }));
    expect(page.ok).toBe(true);
    const cursor = page.ok ? page.data.meta.nextCursor : undefined;
    expect(cursor).toBeDefined();
    expect(decodeCursor(cursor!)?.value).toBe(200);
  });

  it("puts a number in the cursor even when the adapter gave a bigint", async () => {
    // Postgres stores money as BigInt and Prisma returns a bigint. JSON.stringify throws on
    // one, so a cursor built straight from the stored row broke sorting by a money field on
    // that stack — and only that stack, which is why CI found it and local runs did not.
    // Two rows, so there is a next page for a cursor to point at.
    for (const [id, total] of [["b", 500n], ["c", 900n]] as const) {
      rows.all.push({ id, number: `B-${id}`, total, tip: null, yen: 1, weight: 1, createdAt: new Date(), updatedAt: new Date() });
    }
    const page = await store().list(new URLSearchParams({ perPage: "1", sort: "total" }));
    expect(page.ok, page.ok ? "" : JSON.stringify(page)).toBe(true);
    const cursor = page.ok ? page.data.meta.nextCursor : undefined;
    expect(typeof decodeCursor(cursor ?? "")?.value).toBe("number");
  });

  it("pages on from that cursor instead of repeating itself", async () => {
    for (const [number, total] of [["A-1", 1], ["A-2", 2], ["A-3", 3]] as const) {
      await store().create({ number, total, yen: 1, weight: 1 });
    }
    const first = await store().list(new URLSearchParams({ perPage: "2", sort: "total" }));
    const cursor = first.ok ? first.data.meta.nextCursor! : "";
    const second = await store().list(new URLSearchParams({ perPage: "2", sort: "total", cursor }));
    expect(second.ok && second.data.data.map((row) => row.number)).toEqual(["A-3"]);
  });
});

describe("validation", () => {
  const create = (input: object) => store().create({ number: "A-1", yen: 1, weight: 1, ...input });

  it("refuses more decimal places than the currency has", async () => {
    const result = await create({ total: 19.999 });
    expect(result.ok).toBe(false);
    expect(!result.ok && JSON.stringify(result.issues)).toMatch(/decimal place/i);
  });

  it("refuses a fraction of a currency that has none", async () => {
    // Declared as an int, so the whole-number check gets there first. Still refused, and
    // "Enter a whole number" is the better sentence for an int field anyway.
    const result = await create({ total: 1, yen: 1500.5 });
    expect(result.ok).toBe(false);
    expect(!result.ok && JSON.stringify(result.issues)).toMatch(/whole number/i);
  });

  it("refuses a fraction of a zero-exponent currency declared as a float", async () => {
    // Where the int check does not apply, the money check is what catches it.
    const yenFloat = defineResource({ name: "Ticket", fields: { price: field.float({ format: "money", currency: "JPY" }) } });
    const result = await createResourceStore({ resource: yenFloat, rows: memoryRows() }).create({ price: 1500.5 });
    expect(result.ok).toBe(false);
    expect(!result.ok && JSON.stringify(result.issues)).toMatch(/whole amount/i);
  });

  it("still allows a plain float its decimals", async () => {
    expect((await create({ total: 1, weight: 1.23456 })).ok).toBe(true);
  });
});
