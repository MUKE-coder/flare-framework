/**
 * Bulk inserts for D1.
 *
 * D1 counts every bound parameter, so a prepared INSERT tops out at 100 values —
 * about a dozen rows per statement, and a million rows becomes an hour of round
 * trips. Writing the values into the SQL instead lifts that to whole pages of rows
 * per statement (measured locally at ~50,000 rows/s against ~250 with parameters).
 * The two limits that remain are SQLite's 100 KB per statement and how much text
 * one call should carry, which is what MAX_STATEMENT_BYTES and STATEMENTS_PER_CALL
 * are for.
 *
 * Seed data is generated here, never taken from a request, so it can't be a SQL
 * injection route. `sqlLiteral` still escapes everything it writes.
 */

/** Values a seeded column can hold. Dates and objects are stored the way Drizzle stores them. */
export type SqlValue = string | number | boolean | Date | null | undefined | readonly unknown[] | Record<string, unknown>;

export type Row = Record<string, SqlValue>;

/** Under SQLite's 100 KB limit for one statement, with room for the longest row. */
export const MAX_STATEMENT_BYTES = 80_000;

/** Statements per exec() call. Beyond ~25 the gain flattens out. */
export const STATEMENTS_PER_CALL = 25;

/** What a bulk insert writes to: the local D1 binding, or a file for `--remote`. */
export interface SqlSink {
  exec(sql: string): Promise<unknown>;
}

/** A single SQL literal. Strings are quoted and escaped; booleans and dates follow Drizzle's storage. */
export function sqlLiteral(value: SqlValue): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value instanceof Date) return String(value.getTime());
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `'${text.replaceAll("'", "''")}'`;
}

const tuple = (row: Row, columns: readonly string[]) => `(${columns.map((column) => sqlLiteral(row[column])).join(",")})`;

/** One INSERT statement and the number of rows in it. */
export interface Statement {
  sql: string;
  rows: number;
}

/**
 * INSERT statements for `rows`, each under `maxBytes`. Rows are pulled one at a time,
 * so a generator of a million rows never exists in memory all at once.
 */
export function* insertStatements(
  table: string,
  columns: readonly string[],
  rows: Iterable<Row>,
  maxBytes = MAX_STATEMENT_BYTES,
): Generator<Statement> {
  const head = `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(",")}) VALUES `;
  let values: string[] = [];
  let bytes = head.length;
  for (const row of rows) {
    const text = tuple(row, columns);
    if (values.length > 0 && bytes + text.length + 1 > maxBytes) {
      yield { sql: `${head}${values.join(",")};`, rows: values.length };
      values = [];
      bytes = head.length;
    }
    values.push(text);
    bytes += text.length + 1;
  }
  if (values.length > 0) yield { sql: `${head}${values.join(",")};`, rows: values.length };
}

export interface BulkInsertOptions {
  table: string;
  columns: readonly string[];
  rows: Iterable<Row>;
  /** Called after each batch with the number of rows written so far. */
  onProgress?: (written: number) => void;
  maxBytes?: number;
  statementsPerCall?: number;
}

/** Insert every row in `rows`, in batches. Returns how many were written. */
export async function bulkInsert(sink: SqlSink, options: BulkInsertOptions): Promise<number> {
  const perCall = options.statementsPerCall ?? STATEMENTS_PER_CALL;
  let written = 0;
  let batch: string[] = [];
  let batchRows = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    await sink.exec(batch.join("\n"));
    written += batchRows;
    batch = [];
    batchRows = 0;
    options.onProgress?.(written);
  };

  for (const statement of insertStatements(options.table, options.columns, options.rows, options.maxBytes)) {
    batch.push(statement.sql);
    batchRows += statement.rows;
    if (batch.length === perCall) await flush();
  }
  await flush();
  return written;
}
