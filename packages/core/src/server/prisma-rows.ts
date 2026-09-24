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
import type { ConstraintHit, ResourceRows, Row, RowsQuery } from "./rows.js";

/** The part of a Prisma model delegate a resource store uses. */
export interface PrismaDelegate {
  findMany(args: Record<string, unknown>): Promise<Row[]>;
  findUnique(args: Record<string, unknown>): Promise<Row | null>;
  count(args: Record<string, unknown>): Promise<number>;
  create(args: Record<string, unknown>): Promise<Row>;
  update(args: Record<string, unknown>): Promise<Row>;
  delete(args: Record<string, unknown>): Promise<Row>;
}

/** Prisma's "no record matched" — an expected outcome here, not an error. */
const NOT_FOUND = "P2025";

const codeOf = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : undefined;

/**
 * Prisma reports a unique violation with the fields involved, which may be given as
 * field names, as a list, or as a constraint name like `products_sku_key`.
 */
function uniqueColumn(error: unknown): string | undefined {
  const meta = (error as { meta?: { target?: unknown; modelName?: string } }).meta;
  const target = meta?.target;
  if (Array.isArray(target) && target.length > 0) return String(target[0]);
  if (typeof target === "string") {
    // `<table>_<column>_key` is the name Postgres gives the index Prisma created.
    const match = /^(.*)_(.+)_key$/.exec(target);
    return match ? match[2] : target;
  }
  return undefined;
}

export function prismaRows(delegate: PrismaDelegate, client: unknown): ResourceRows {
  /** The search and filter half of a where clause — everything but the cursor. */
  function matching(query: Pick<RowsQuery, "search" | "filters">): Record<string, unknown> {
    const where: Record<string, unknown> = { ...query.filters };
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
        const { field, value, id, greaterThan } = query.cursor;
        const op = greaterThan ? "gt" : "lt";
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
