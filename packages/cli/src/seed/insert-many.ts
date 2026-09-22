/**
 * `insertMany` for seed files: Drizzle tables in, batched SQL out.
 *
 * Drizzle's own insert binds every value as a parameter, and D1 allows 100 per
 * statement, so large inserts turn into thousands of round trips. This takes the same
 * rows and the same table object and writes them the fast way (see bulk.ts).
 */
import type { InsertMany } from "@flaredev/core";
import { bulkInsert, type Row, type SqlValue, type SqlSink } from "./bulk.js";

/** The bits of Drizzle's runtime we need, imported from the app so versions match. */
export interface DrizzleHelpers {
  getTableName(table: unknown): string;
  getTableColumns(table: unknown): Record<string, DrizzleColumn>;
}

interface DrizzleColumn {
  name: string;
  defaultFn?: () => unknown;
  mapToDriverValue?: (value: unknown) => unknown;
}

const isIterable = (value: unknown): value is Iterable<object> =>
  typeof value === "object" && value !== null && Symbol.iterator in (value as object);

/**
 * Build the `insertMany` a seed file is given.
 * `onProgress` is called with the running total, for a progress line.
 */
export function createInsertMany(sink: SqlSink, drizzle: DrizzleHelpers, onProgress?: (written: number, table: string) => void): InsertMany {
  return async function insertMany<T extends object>(table: unknown, count: number | readonly T[], build?: (index: number) => T) {
    const name = drizzle.getTableName(table);
    const columns = drizzle.getTableColumns(table);
    if (typeof count === "number" && !build) throw new Error(`insertMany(${name}, ${count}) needs a function to build each row.`);

    const source: Iterable<T> =
      typeof count === "number"
        ? (function* () {
            for (let i = 0; i < count; i++) yield build!(i);
          })()
        : isIterable(count)
          ? (count as Iterable<T>)
          : [];

    // Columns come from the first row, plus any the table fills in itself (ids).
    const iterator = source[Symbol.iterator]();
    const first = iterator.next();
    if (first.done) return 0;
    const keys = new Set(Object.keys(first.value));
    for (const [key, column] of Object.entries(columns)) if (column.defaultFn) keys.add(key);
    // In the table's own column order, so the SQL reads like the schema.
    const used = Object.keys(columns).filter((key) => keys.has(key));
    const unknownKeys = [...keys].filter((key) => !columns[key]);
    if (unknownKeys.length) throw new Error(`${name} has no column called ${unknownKeys.join(", ")}.`);

    const toRow = (value: T): Row => {
      const row: Row = {};
      for (const key of used) {
        const column = columns[key]!;
        let raw = (value as Record<string, unknown>)[key];
        if (raw === undefined && column.defaultFn) raw = column.defaultFn();
        // mapToDriverValue is how Drizzle stores booleans, dates and JSON.
        row[column.name] = (raw === undefined || raw === null ? null : (column.mapToDriverValue?.(raw) ?? raw)) as SqlValue;
      }
      return row;
    };

    const rows = (function* () {
      yield toRow(first.value);
      for (let next = iterator.next(); !next.done; next = iterator.next()) yield toRow(next.value);
    })();

    return bulkInsert(sink, {
      table: name,
      columns: used.map((key) => columns[key]!.name),
      rows,
      onProgress: onProgress && ((written) => onProgress(written, name)),
    });
  };
}
