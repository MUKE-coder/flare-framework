/**
 * Seed rows, translated for the Prisma client.
 *
 * `seedRows` builds rows the way the Cloudflare stack stores them: keyed by column name,
 * with timestamps as epoch milliseconds, because that is what Drizzle and SQLite want.
 * Prisma wants neither. It is addressed in the schema's own vocabulary — field names,
 * `Date` objects, and the *identifier* of an enum member rather than the value the
 * column holds.
 *
 * So this is the one place that knows both. Translating here rather than generating a
 * second kind of row keeps the interesting part — what a plausible invoice looks like —
 * written once, in `rows.ts`, for both stacks.
 */
import { columnName, storedFields, type Resource } from "@flaredev/core";
import { prismaEnumMember } from "../generator/prisma.js";
import type { Row } from "./bulk.js";

/** What `createMany` takes: field names, and values Prisma can encode. */
export type PrismaRow = Record<string, unknown>;

/**
 * One row, as the Prisma client wants it.
 *
 * `date` and `datetime` arrive as ISO strings and leave as `Date`s: Prisma accepts an
 * ISO-8601 string for a `DateTime`, but a date-only `"2026-01-05"` is not one, and it is
 * clearer to convert both than to remember which of the two is allowed through.
 */
export function toPrismaRow(resource: Resource, row: Row): PrismaRow {
  const out: PrismaRow = { id: row.id };

  for (const [key, def] of storedFields(resource)) {
    const value = row[columnName(key)];
    if (value === null || value === undefined) {
      out[key] = null;
      continue;
    }
    switch (def.kind) {
      case "date":
      case "datetime":
        // A bare "2026-01-05" is widened to midnight UTC; a @db.Date column drops the
        // time again on the way in.
        out[key] = new Date(typeof value === "string" && value.length === 10 ? `${value}T00:00:00.000Z` : (value as string | number | Date));
        break;
      case "enum":
        out[key] = prismaEnumMember(String(value));
        break;
      default:
        // Arrays stay arrays (a Postgres text[]) and objects stay objects (jsonb);
        // Prisma encodes both, which is the reason for going through it at all.
        out[key] = value;
    }
  }

  // seedRows spreads these over the past year as epoch milliseconds.
  out.createdAt = new Date(row.created_at as number);
  out.updatedAt = new Date(row.updated_at as number);
  if (resource.softDelete) out.deletedAt = null;
  return out;
}

/**
 * The Prisma model property for a resource — `orderItem`, not `OrderItem` or
 * `order_items`. The client exposes models in camelCase whatever the table is called.
 */
export function prismaModel(resource: Resource): string {
  return resource.name.charAt(0).toLowerCase() + resource.name.slice(1);
}
