import { defineResource, field } from "@flaredev/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createResourceStore } from "../templates/app/lib/resource/store.js";
import type { ConstraintHit, ResourceRows, Row, RowsQuery } from "../templates/app/lib/resource/rows.js";

/**
 * Fields that only apply sometimes, at the store boundary.
 *
 * The validator decides whether a conditional field is *required*. This decides whether
 * it is *kept*: a project that stops being recurring must not keep last month's billing
 * cycle, because the form stopped showing the input and nothing would ever overwrite it.
 */
const project = defineResource({
  name: "Project",
  fields: {
    name: field.string(),
    kind: field.enum(["oneOff", "recurring"]),
    billingCycle: field.enum(["monthly", "annually"], { showWhen: { field: "kind", op: "eq", value: "recurring" } }),
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
const store = () => createResourceStore({ resource: project, rows, system: true });
const data = (result: unknown) => (result as { data: Row }).data;

beforeEach(() => {
  rows = memoryRows();
});

describe("creating", () => {
  it("keeps the value when the condition holds", async () => {
    const created = await store().create({ name: "Site", kind: "recurring", billingCycle: "monthly" });
    expect(created.ok, created.ok ? "" : JSON.stringify(created)).toBe(true);
    expect(rows.seen.inserted[0]!.billingCycle).toBe("monthly");
  });

  it("nulls a value that does not apply, rather than storing a contradiction", async () => {
    // A one-off project with a billing cycle is not a thing. Refusing it would be hostile
    // to a client that sends the whole form; storing it would be a row that disagrees
    // with itself. It is dropped.
    const created = await store().create({ name: "Logo", kind: "oneOff", billingCycle: "monthly" });
    expect(created.ok).toBe(true);
    expect(rows.seen.inserted[0]!.billingCycle).toBeNull();
    expect(data(created).billingCycle).toBeNull();
  });

  it("still refuses a missing value when it does apply", async () => {
    const result = await store().create({ name: "Site", kind: "recurring" });
    expect(result.ok).toBe(false);
    expect(!result.ok && JSON.stringify(result.issues)).toMatch(/Required when kind is recurring/);
  });
});

describe("updating", () => {
  const recurring = () => store().create({ name: "Site", kind: "recurring", billingCycle: "monthly" });

  it("clears the field when the patch switches it off", async () => {
    // The bug this exists for: the form hides the input, so the PATCH never mentions
    // billingCycle, and "monthly" would survive on a one-off project.
    const created = await recurring();
    const updated = await store().update(String(data(created).id), { kind: "oneOff" });
    expect(updated.ok, updated.ok ? "" : JSON.stringify(updated)).toBe(true);
    expect(data(updated).billingCycle).toBeNull();
    expect(rows.all[0]!.billingCycle).toBeNull();
  });

  it("leaves it alone when the patch touches neither field", async () => {
    const created = await recurring();
    const updated = await store().update(String(data(created).id), { name: "Renamed" });
    expect(updated.ok).toBe(true);
    // The condition is judged against the stored row plus the patch, so a rename that
    // never mentions `kind` must not read it as absent and wipe the cycle.
    expect(data(updated).billingCycle).toBe("monthly");
  });

  it("brings it back when the patch switches it on again", async () => {
    const created = await store().create({ name: "Logo", kind: "oneOff" });
    const updated = await store().update(String(data(created).id), { kind: "recurring", billingCycle: "annually" });
    expect(updated.ok, updated.ok ? "" : JSON.stringify(updated)).toBe(true);
    expect(data(updated).billingCycle).toBe("annually");
  });

  it("refuses to switch it on without the value it now needs", async () => {
    const created = await store().create({ name: "Logo", kind: "oneOff" });
    const updated = await store().update(String(data(created).id), { kind: "recurring" });
    expect(updated.ok).toBe(false);
  });
});

describe("replacing", () => {
  it("drops a value the replacement no longer applies to", async () => {
    const created = await store().create({ name: "Site", kind: "recurring", billingCycle: "monthly" });
    const replaced = await store().replace(String(data(created).id), { name: "Site", kind: "oneOff" });
    expect(replaced.ok, replaced.ok ? "" : JSON.stringify(replaced)).toBe(true);
    expect(data(replaced).billingCycle).toBeNull();
  });
});
