// This file is yours.
//
// Flare copies the code that turns a resource descriptor into a working endpoint into
// your app rather than hiding it in node_modules, for the same reason shadcn/ui copies
// a component: you cannot fix, read or reason about what you cannot see. Nothing here
// is imported from the framework at runtime — change it, delete it, replace it.
//
// `flare diff` shows how your copy differs from the version Flare ships, and
// `flare update` applies the parts you choose. Neither runs unless you ask.

/**
 * {@link ResourceRows} over Prisma and Postgres — the Next.js stack's half.
 *
 * The same nine operations the Drizzle adapter implements, expressed as Prisma queries.
 * Everything a resource *means* — validation, hooks, computed values, the capped count,
 * the wording of a unique-constraint error — stays in the store and is shared, so a
 * descriptor behaves the same on either stack.
 *
 * Nothing here imports `@prisma/client`: a generated client is app-specific and this
 * package can't depend on one. The delegate is described structurally instead, which is
 * also what makes it easy to test without a database.
 */
import type { ConstraintHit, ResourceRows, Row, RowsQuery } from "./rows";

/**
 * The part of a Prisma model delegate a resource store uses.
 *
 * The arguments are loose on purpose. Prisma generates a precise argument type per
 * model — `Prisma.ProductFindManyArgs` and so on — and describing them here would mean
 * reproducing Prisma's generics for a client this package can't import. The queries are
 * all built in this file, so there is exactly one place to get them right.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PrismaDelegate {
  findMany(args: any): Promise<any[]>;
  findUnique(args: any): Promise<any>;
  count(args: any): Promise<number>;
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  delete(args: any): Promise<any>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Prisma's "no record matched" — an expected outcome here, not an error. */
const NOT_FOUND = "P2025";

const codeOf = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;

/**
 * Which column a unique violation was about.
 *
 * Prisma reports this two different ways. Without a driver adapter it is `meta.target`,
 * a list of field names. With one — which Prisma 7 requires for SQL databases — the
 * driver's own error is passed through instead, and the only clue is the name of the
 * index Postgres rejected: `products_sku_key`, which is `<table>_<column>_key`.
 *
 * Getting this right is what puts "Sku is already taken" under the SKU field instead of
 * a bare "Value is already taken" at the top of the form.
 */
function uniqueColumn(error: unknown): string | undefined {
  const meta = (error as { meta?: Record<string, unknown> }).meta;
  if (!meta) return undefined;

  const target = meta.target;
  if (Array.isArray(target) && target.length > 0) return String(target[0]);
  if (typeof target === "string") return fromIndexName(target);

  const cause = (meta.driverAdapterError as { cause?: { constraint?: { index?: string; fields?: string[] } } } | undefined)?.cause;
  const constraint = cause?.constraint;
  if (constraint?.fields?.length) return constraint.fields[0];
  if (constraint?.index) return fromIndexName(constraint.index);
  return undefined;
}

/** `products_sku_key` → `sku`; anything else is handed back unchanged. */
function fromIndexName(name: string): string {
  const match = /^.*?_(.+)_key$/.exec(name);
  return match ? match[1]! : name;
}

export function prismaRows(delegate: PrismaDelegate, client: unknown): ResourceRows {
  /** The search and filter half of a where clause — everything but the cursor. */
  function matching(query: Pick<RowsQuery, "search" | "filters" | "deleted">): Record<string, unknown> {
    const where: Record<string, unknown> = { ...query.filters };
    // A soft-deleting resource hides its deleted rows. Set on the query rather than in
    // `filters` because "only" is `not: null`, which the filter shape cannot say.
    if (query.deleted === "exclude") where.deletedAt = null;
    else if (query.deleted === "only") where.deletedAt = { not: null };
    if (query.search && query.search.fields.length > 0) {
      // Insensitive on purpose: SQLite's LIKE is case-insensitive for ASCII, so this is
      // what keeps search behaving the same on both stacks.
      where.OR = query.search.fields.map((field) => ({ [field]: { contains: query.search!.term, mode: "insensitive" } }));
    }
    return where;
  }

  return {
    db: client,

    async find(query) {
      const where = matching(query);
      if (query.cursor) {
        const { field, id, greaterThan, isDate } = query.cursor;
        const op = greaterThan ? "gt" : "lt";
        // Postgres compares a timestamp against a Date, not the number the cursor
        // carried. Without this, paging past the first page of a date-sorted list fails
        // with "Expected DateTime, provided Int".
        const value = isDate && (typeof query.cursor.value === "number" || typeof query.cursor.value === "string") ? new Date(query.cursor.value) : query.cursor.value;
        // (sort, id) as one comparison, so rows sharing a sort value are neither skipped
        // nor repeated. AND-ed with the filters rather than replacing them.
        const keyset = [{ [field]: { [op]: value } }, { AND: [{ [field]: value }, { id: { [op]: id } }] }];
        where.AND = [...((where.AND as unknown[]) ?? []), { OR: keyset }];
      }
      return delegate.findMany({
        where,
        orderBy: [{ [query.sort.field]: query.sort.direction }, { id: query.sort.direction }],
        take: query.limit,
        ...(query.offset ? { skip: query.offset } : {}),
      });
    },

    countUpTo(query, limit) {
      // Prisma's count takes `take`, so a huge table is never counted in full.
      return delegate.count({ where: matching(query), take: limit });
    },

    byId(id) {
      return delegate.findUnique({ where: { id } });
    },

    async titles(ids, titleField) {
      const rows = await delegate.findMany({ where: { id: { in: ids } }, select: { id: true, [titleField]: true } });
      return rows.map((row) => ({ id: String(row.id), title: row[titleField] }));
    },

    insert(values) {
      return delegate.create({ data: values });
    },

    async update(id, values) {
      try {
        return await delegate.update({ where: { id }, data: values });
      } catch (error) {
        if (codeOf(error) === NOT_FOUND) return null;
        throw error;
      }
    },

    async remove(id) {
      try {
        await delegate.delete({ where: { id } });
        return true;
      } catch (error) {
        if (codeOf(error) === NOT_FOUND) return false;
        throw error;
      }
    },

    constraint(error): ConstraintHit | undefined {
      switch (codeOf(error)) {
        case "P2002":
          return { kind: "unique", column: uniqueColumn(error) };
        case "P2003":
        case "P2014":
          return { kind: "foreignKey" };
        // A value outside its type, too long for its column, or null where it can't be.
        case "P2000":
        case "P2011":
        case "P2020":
          return { kind: "check" };
        default:
          return undefined;
      }
    },
  };
}
