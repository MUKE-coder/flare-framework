/**
 * Fixes for drizzle-kit's SQLite "table rebuild" migrations (used when a change can't be an
 * ALTER, e.g. adding a CHECK constraint for an enum field):
 *
 * 1. drizzle-kit copies data with `INSERT INTO __new_t(cols) SELECT cols FROM t` listing the
 *    NEW table's columns, including ones the old table doesn't have. SQLite then treats an
 *    unknown double-quoted name as a string literal, so a new `status` column receives the
 *    text 'status' and fails its CHECK (or silently stores junk). We keep only columns that
 *    existed in the previous snapshot; new columns get their defaults.
 * 2. `PRAGMA foreign_keys=OFF/ON` is not honored inside D1 migrations; D1 documents
 *    `PRAGMA defer_foreign_keys` for rebuilding tables other tables reference.
 */

const COPY = /INSERT INTO `__new_(\w+)`\(([^)]*)\) SELECT ([^;]*?) FROM `\1`;/g;

const columnsOf = (list: string) => list.split(",").map((column) => column.trim().replace(/^"|"$/g, ""));

export interface RepairResult {
  sql: string;
  changes: string[];
}

export function repairRebuildMigration(sql: string, previousColumns: Record<string, string[]>): RepairResult {
  const changes: string[] = [];
  let repaired = sql.replace(COPY, (statement, table: string, insertList: string, selectList: string) => {
    const existing = previousColumns[table];
    if (!existing) return statement;
    const insertColumns = columnsOf(insertList);
    const selectColumns = columnsOf(selectList);
    if (insertColumns.join() !== selectColumns.join()) return statement;
    const kept = insertColumns.filter((column) => existing.includes(column));
    if (kept.length === insertColumns.length) return statement;
    const dropped = insertColumns.filter((column) => !kept.includes(column));
    changes.push(`${table}: don't copy new column(s) ${dropped.join(", ")} from the old table`);
    const list = kept.map((column) => `"${column}"`).join(", ");
    return `INSERT INTO \`__new_${table}\`(${list}) SELECT ${list} FROM \`${table}\`;`;
  });

  if (/PRAGMA foreign_keys=OFF;/i.test(repaired)) {
    repaired = repaired.replace(/PRAGMA foreign_keys=OFF;/gi, "PRAGMA defer_foreign_keys = on;").replace(/PRAGMA foreign_keys=ON;/gi, "PRAGMA defer_foreign_keys = off;");
    changes.push("use PRAGMA defer_foreign_keys (D1) instead of PRAGMA foreign_keys");
  }
  return { sql: repaired, changes };
}

/** Table → column names from a drizzle-kit SQLite snapshot. */
export function snapshotColumns(snapshot: { tables?: Record<string, { columns?: Record<string, unknown> }> }): Record<string, string[]> {
  return Object.fromEntries(Object.entries(snapshot.tables ?? {}).map(([name, table]) => [name, Object.keys(table.columns ?? {})]));
}
