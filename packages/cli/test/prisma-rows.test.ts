import { defineResource, field } from "@flaredev/core";
import { describe, expect, it } from "vitest";
import { prismaModel, toPrismaRow } from "../src/seed/prisma-rows.js";
import type { Row } from "../src/seed/bulk.js";
import { seedColumns, seedRows } from "../src/seed/rows.js";

const Ticket = defineResource({
  name: "Ticket",
  fields: {
    title: field.string(),
    openedOn: field.date({ required: false }),
    seenAt: field.datetime({ required: false }),
    status: field.enum(["open", "in-progress", "done"]),
    urgent: field.boolean(),
    labels: field.multiselect(["bug", "chore"]),
    meta: field.json({ required: false }),
  },
});

const one = (resource: typeof Ticket, overrides: Row = {}) => {
  const [row] = [...seedRows(resource, 1, { seed: 7 })];
  return toPrismaRow(resource, { ...row!, ...overrides });
};

describe("rows for the Prisma client", () => {
  it("is keyed by field name, not column name", () => {
    const Order = defineResource({ name: "Order", fields: { lineTotal: field.int() } });
    // The column is snake_case; the Prisma client only knows the field.
    expect(seedColumns(Order)).toContain("line_total");
    const row = one(Order as never);
    expect(row).toHaveProperty("lineTotal");
    expect(row).not.toHaveProperty("line_total");
  });

  it("renames the timestamps and makes them dates", () => {
    const row = one(Ticket);
    expect(row).not.toHaveProperty("created_at");
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
    // seedRows spreads them over the past year, so they must be real instants.
    expect(Number.isNaN((row.createdAt as Date).getTime())).toBe(false);
  });

  it("widens a date-only value to an instant Prisma accepts", () => {
    const row = one(Ticket, { opened_on: "2026-01-05" });
    expect(row.openedOn).toBeInstanceOf(Date);
    expect((row.openedOn as Date).toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });

  it("keeps a datetime as the instant it already was", () => {
    const row = one(Ticket, { seen_at: "2026-03-04T10:11:12.000Z" });
    expect((row.seenAt as Date).toISOString()).toBe("2026-03-04T10:11:12.000Z");
  });

  it("sends the enum member identifier, not the stored value", () => {
    // The column holds "in-progress"; the Prisma enum member is `in_progress`, because
    // a hyphen cannot be an identifier. Sending the stored value is rejected.
    const row = one(Ticket, { status: "in-progress" });
    expect(row.status).toBe("in_progress");
  });

  it("leaves an enum value that is already an identifier alone", () => {
    expect(one(Ticket, { status: "open" }).status).toBe("open");
  });

  it("keeps arrays and objects as values Prisma encodes itself", () => {
    const row = one(Ticket, { labels: ["bug", "chore"], meta: { source: "import" } });
    expect(row.labels).toEqual(["bug", "chore"]);
    expect(row.meta).toEqual({ source: "import" });
  });

  it("passes nulls straight through", () => {
    expect(one(Ticket, { meta: null, seen_at: null }).meta).toBeNull();
    expect(one(Ticket, { seen_at: null }).seenAt).toBeNull();
  });

  it("keeps a belongsTo as the foreign key field Prisma declares", () => {
    const Comment = defineResource({ name: "Comment", fields: { body: field.text(), ticketId: field.belongsTo("Ticket") } });
    const [row] = [...seedRows(Comment as never, 1, { seed: 1, parentIds: new Map([["Ticket", ["abc"]]]) })];
    expect(toPrismaRow(Comment as never, row!).ticketId).toBe("abc");
  });

  it("survives JSON, which is how it reaches the other process", () => {
    const row = one(Ticket);
    const back = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
    // A Date becomes the ISO string Prisma also accepts for a DateTime.
    expect(typeof back.createdAt).toBe("string");
    expect(new Date(back.createdAt as string).getTime()).toBe((row.createdAt as Date).getTime());
  });

  it("names the model the way the client exposes it", () => {
    expect(prismaModel(Ticket)).toBe("ticket");
    expect(prismaModel(defineResource({ name: "OrderItem", fields: { qty: field.int() } }))).toBe("orderItem");
  });
});
