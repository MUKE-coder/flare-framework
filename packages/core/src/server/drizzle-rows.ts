/**
 * {@link ResourceRows} over Drizzle and SQLite — the Cloudflare stack's half.
 *
 * This is the query building that used to sit inside the store, moved out so the store
 * itself has no dialect in it. Behaviour is unchanged on purpose: the same LIKE search,
 * the same `(sort, id)` cursor comparison, the same capped count.
 */
import { and, asc, count, desc, eq, getTableColumns, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { BaseSQLiteDatabase, SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { ConstraintHit, ResourceRows, Row, RowsQuery } from "./rows.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDatabase = BaseSQLiteDatabase<"sync" | "async", any, any>;

/** Walks an error and its causes (drizzle and D1 both wrap SQLite errors). */
function errorText(error: unknown): string {
  const parts: string[] = [];
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(" | ");
}

export function drizzleRows(table: SQLiteTable, getDb: () => AnyDatabase): ResourceRows & { columns: Record<string, SQLiteColumn> } {
  const columns = getTableColumns(table) as Record<string, SQLiteColumn>;
  const idColumn = columns.id!;
  const byId = (id: string) => eq(idColumn, id);

  /** The search and filter half of a where clause — everything but the cursor. */
  function matching(query: Pick<RowsQuery, "search" | "filters">): SQL[] {
    const conditions: SQL[] = [];
    if (query.search && query.search.fields.length > 0) {
      const pattern = `%${query.search.term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
      const searchable = query.search.fields.map((key) => columns[key]!);
      conditions.push(or(...searchable.map((column) => sql`${column} LIKE ${pattern} ESCAPE '\\'`))!);
    }
    for (const [key, value] of Object.entries(query.filters)) {
      conditions.push(value === null ? isNull(columns[key]!) : eq(columns[key]!, value));
    }
    return conditions;
  }

  return {
    columns,
    get db() {
      return getDb();
    },

    async find(query) {
      const conditions = matching(query);
      const sortColumn = columns[query.sort.field]!;
      const descending = query.sort.direction === "desc";
      const order = descending ? [desc(sortColumn), desc(idColumn)] : [asc(sortColumn), asc(idColumn)];

      if (query.cursor) {
        // Compared as the column stores it: a date column's driver mapper expects a Date,
        // and a cursor carries the milliseconds it was read as, so this stays raw SQL.
        const { value, id, greaterThan } = query.cursor;
        conditions.push(
          greaterThan
            ? or(sql`${sortColumn} > ${value}`, and(sql`${sortColumn} = ${value}`, sql`${idColumn} > ${id}`))!
            : or(sql`${sortColumn} < ${value}`, and(sql`${sortColumn} = ${value}`, sql`${idColumn} < ${id}`))!,
        );
      }

      const where = conditions.length ? and(...conditions) : undefined;
      const statement = getDb().select().from(table).where(where).orderBy(...order).limit(query.limit);
      const rows = query.offset ? await statement.offset(query.offset) : await statement;
      return rows as Row[];
    },

    async countUpTo(query, limit) {
      const conditions = matching(query);
      const where = conditions.length ? and(...conditions) : undefined;
      const db = getDb();
      // Counting a subquery that stops at the cap, rather than the whole table.
      const [counted] = await db
        .select({ total: count() })
        .from(db.select({ id: idColumn }).from(table).where(where).limit(limit).as("capped"));
      return counted?.total ?? 0;
    },

    async byId(id) {
      const [record] = await getDb().select().from(table).where(byId(id)).limit(1);
      return (record as Row | undefined) ?? null;
    },

    async titles(ids, titleField) {
      const titleColumn = columns[titleField] ?? idColumn;
      const rows = await getDb().select({ id: idColumn, title: titleColumn }).from(table).where(inArray(idColumn, ids));
      return rows as { id: string; title: unknown }[];
    },

    async insert(values) {
      const [record] = await getDb().insert(table).values(values).returning();
      return record as Row;
    },

    async update(id, values) {
      const [record] = await getDb().update(table).set(values).where(byId(id)).returning();
      return (record as Row | undefined) ?? null;
    },

    async remove(id) {
      const deleted = await getDb().delete(table).where(byId(id)).returning({ id: idColumn });
      return deleted.length > 0;
    },

    constraint(error): ConstraintHit | undefined {
      const text = errorText(error);
      const unique = /UNIQUE constraint failed: ([\w.]+(?:, [\w.]+)*)/.exec(text);
      if (unique) return { kind: "unique", column: unique[1]!.split(", ")[0]!.split(".").pop() };
      if (/FOREIGN KEY constraint failed/.test(text)) return { kind: "foreignKey" };
      if (/CHECK constraint failed/.test(text)) return { kind: "check" };
      return undefined;
    },
  };
}
