/**
 * Renaming a column without emptying it.
 *
 * `fullName: field.string({ rename: { from: "name" } })` says the two names are the same
 * column. Without that, the schema simply has a column fewer and a column more, and
 * drizzle-kit cannot tell a rename from a drop and an add — it asks, and with no terminal
 * to ask in it gives up (see migrations.ts). Answering "dropped and added" would empty
 * the column, which is the thing issue #56 is about.
 *
 * So Flare does the rename itself: `drizzle-kit generate --custom` produces the migration
 * file, the journal entry and the snapshot ids, and this module supplies the two things it
 * leaves out — the SQL, and a snapshot that says the column is now called `fullName`.
 *
 * Everything here is a pure transformation of JSON or of a SQL string, which is
 * deliberate: a wrong snapshot is a corrupted migration history, so the interesting cases
 * are tested directly rather than inferred from a working app.
 */
import { columnName, storedFields, type Resource } from "@flaredev/core";
import type { LoadedResource } from "./load.js";

/** One column to rename, in database terms. */
export interface PendingRename {
  resource: string;
  table: string;
  /** Field key the descriptor renamed from, e.g. "name". */
  fromKey: string;
  /** Field key it is called now, e.g. "fullName". */
  toKey: string;
  /** Column names, which is what the SQL and the snapshot speak. */
  from: string;
  to: string;
}

/** The shape of a drizzle-kit snapshot, as far as a rename is concerned. */
interface SnapshotTable {
  name: string;
  columns: Record<string, { name: string } & Record<string, unknown>>;
  indexes?: Record<string, { name: string; columns: string[] } & Record<string, unknown>>;
  foreignKeys?: Record<string, { name: string; columnsFrom: string[] } & Record<string, unknown>>;
  uniqueConstraints?: Record<string, { name: string; columns: string[] } & Record<string, unknown>>;
  compositePrimaryKeys?: Record<string, { columns: string[] } & Record<string, unknown>>;
  checkConstraints?: Record<string, { name: string; value: string } & Record<string, unknown>>;
}

export interface Snapshot {
  tables: Record<string, SnapshotTable>;
  [key: string]: unknown;
}

/**
 * Renames every descriptor declares that has not happened yet.
 *
 * "Has not happened yet" is decided by the snapshot, not by the descriptor: the
 * declaration stays in the file after the rename is done, so the snapshot is the only
 * thing that can say whether there is still work to do. That is what makes leaving the
 * declaration in place harmless.
 */
export function pendingRenames(all: LoadedResource[], snapshot: Snapshot | undefined): PendingRename[] {
  if (!snapshot) return [];
  const pending: PendingRename[] = [];
  for (const { resource } of all) {
    const table = snapshot.tables[resource.table];
    if (!table) continue;
    for (const [key, def] of storedFields(resource)) {
      const from = def.rename?.from;
      if (!from) continue;
      const fromColumn = columnName(from);
      const toColumn = columnName(key);
      // Already done, or never there: either way there is nothing to rename. Checking
      // both means a half-applied state cannot produce SQL that fails.
      if (!table.columns[fromColumn] || table.columns[toColumn]) continue;
      pending.push({ resource: resource.name, table: resource.table, fromKey: from, toKey: key, from: fromColumn, to: toColumn });
    }
  }
  return pending;
}

/**
 * Renames still to do on the Next.js stack, where there is no snapshot to ask.
 *
 * Prisma keeps its history in the database, not in a file, so the only thing on disk that
 * can say whether a rename has already been written is the migration directory itself.
 * A rename is pending when no migration mentions it — which is why the migration carries
 * the two column names in its directory name.
 */
export function pendingPrismaRenames(all: LoadedResource[], existingMigrationDirs: string[]): PendingRename[] {
  const pending: PendingRename[] = [];
  for (const { resource } of all) {
    for (const [key, def] of storedFields(resource)) {
      const from = def.rename?.from;
      if (!from) continue;
      const rename: PendingRename = {
        resource: resource.name,
        table: resource.table,
        fromKey: from,
        toKey: key,
        from: columnName(from),
        to: columnName(key),
      };
      const suffix = `_rename_${rename.table}_${rename.from}_to_${rename.to}`;
      if (existingMigrationDirs.some((dir) => dir.endsWith(suffix))) continue;
      pending.push(rename);
    }
  }
  return pending;
}

/** What a declared rename must satisfy to be worth acting on, or the reason it doesn't. */
export function renameProblem(resource: Resource, key: string, from: string): string | undefined {
  if (from === key) return `${resource.name}.${key} renames from itself.`;
  if (Object.hasOwn(resource.fields, from)) {
    return `${resource.name}.${key} renames from "${from}", but ${resource.name}.${from} still exists. Remove the old field, or rename from something else.`;
  }
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(from)) return `${resource.name}.${key} renames from "${from}", which is not a field name.`;
  return undefined;
}

/** Every rename declaration that cannot be acted on, with the reason. */
export function renameProblems(all: LoadedResource[]): string[] {
  const problems: string[] = [];
  for (const { resource } of all) {
    for (const [key, def] of storedFields(resource)) {
      if (!def.rename?.from) continue;
      const problem = renameProblem(resource, key, def.rename.from);
      if (problem) problems.push(problem);
    }
  }
  return problems;
}

const quote = (name: string) => `\`${name}\``;

/**
 * The SQL for one rename.
 *
 * SQLite rewrites index and constraint *definitions* that mention a renamed column, but
 * it cannot rename the index itself — and Flare's index names carry the column name
 * (`reports_full_name_idx`), so an index left under its old name would not match the
 * schema and the next generate would churn it. Dropping and recreating an index costs
 * nothing: it holds no data.
 */
export function renameSql(rename: PendingRename, indexes: { from: string; to: string; columns: string[]; unique: boolean }[]): string {
  const lines = [`ALTER TABLE ${quote(rename.table)} RENAME COLUMN ${quote(rename.from)} TO ${quote(rename.to)};`];
  for (const index of indexes) {
    lines.push(`DROP INDEX IF EXISTS ${quote(index.from)};`);
    const unique = index.unique ? "UNIQUE " : "";
    lines.push(`CREATE ${unique}INDEX ${quote(index.to)} ON ${quote(rename.table)} (${index.columns.map(quote).join(", ")});`);
  }
  return lines.join("\n--> statement-breakpoint\n");
}

/** An index name with the old column in it, as the new column would spell it. */
const renamedKey = (name: string, from: string, to: string) => (name.includes(from) ? name.replace(from, to) : name);

/**
 * The column renamed inside a snippet of SQL — a check constraint's expression.
 *
 * Two passes, because drizzle writes the identifier quoted (`"people"."name"`) while a
 * hand-written check may not. What neither pass touches is a single-quoted string: a
 * constraint reading `status in ('name', 'other')` keeps its values, which is the whole
 * reason this is not a plain string replace.
 */
export function renameInSql(sql: string, from: string, to: string): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sql
    // "name" or `name` — a quoted identifier.
    .replace(new RegExp(`(["\`])${escaped}\\1`, "g"), (_match, quoteChar: string) => `${quoteChar}${to}${quoteChar}`)
    // A bare identifier, but never one inside quotes of any kind.
    .replace(new RegExp(`(?<![\\w"\`'])${escaped}(?![\\w"\`'])`, "g"), to);
}

/**
 * The same snapshot with the column renamed everywhere it is mentioned.
 *
 * A snapshot names a column in six places, and missing one of them is how a migration
 * history quietly stops matching the database. Returns a new object; the input is not
 * touched.
 */
export function renameInSnapshot(snapshot: Snapshot, rename: PendingRename): { snapshot: Snapshot; indexes: { from: string; to: string; columns: string[]; unique: boolean }[] } {
  const next = structuredClone(snapshot);
  const table = next.tables[rename.table];
  const renamedIndexes: { from: string; to: string; columns: string[]; unique: boolean }[] = [];
  if (!table || !table.columns[rename.from]) return { snapshot: next, indexes: renamedIndexes };

  // 1. The column itself: both the key it is filed under and the name inside it.
  const entries = Object.entries(table.columns).map(([key, column]) =>
    key === rename.from ? ([rename.to, { ...column, name: rename.to }] as const) : ([key, column] as const),
  );
  table.columns = Object.fromEntries(entries);

  const swap = (columns: string[]) => columns.map((column) => (column === rename.from ? rename.to : column));

  // 2. Indexes, which are keyed by name and carry the name again inside.
  if (table.indexes) {
    const indexes: typeof table.indexes = {};
    for (const [key, index] of Object.entries(table.indexes)) {
      if (!index.columns.includes(rename.from)) {
        indexes[key] = index;
        continue;
      }
      const name = renamedKey(index.name, rename.from, rename.to);
      const columns = swap(index.columns);
      indexes[renamedKey(key, rename.from, rename.to)] = { ...index, name, columns };
      renamedIndexes.push({ from: index.name, to: name, columns, unique: Boolean(index.isUnique) });
    }
    table.indexes = indexes;
  }

  // 3. Foreign keys out of this table.
  if (table.foreignKeys) {
    const keys: typeof table.foreignKeys = {};
    for (const [key, fk] of Object.entries(table.foreignKeys)) {
      const columnsFrom = swap(fk.columnsFrom);
      const name = renamedKey(fk.name, rename.from, rename.to);
      keys[renamedKey(key, rename.from, rename.to)] = { ...fk, name, columnsFrom };
    }
    table.foreignKeys = keys;
  }

  // 4. Unique constraints and 5. composite primary keys: column lists.
  if (table.uniqueConstraints) {
    const uniques: typeof table.uniqueConstraints = {};
    for (const [key, unique] of Object.entries(table.uniqueConstraints)) {
      uniques[renamedKey(key, rename.from, rename.to)] = {
        ...unique,
        name: renamedKey(unique.name, rename.from, rename.to),
        columns: swap(unique.columns),
      };
    }
    table.uniqueConstraints = uniques;
  }
  if (table.compositePrimaryKeys) {
    table.compositePrimaryKeys = Object.fromEntries(
      Object.entries(table.compositePrimaryKeys).map(([key, pk]) => [key, { ...pk, columns: swap(pk.columns) }]),
    );
  }

  // 6. Check constraints, whose column name is inside a SQL string.
  if (table.checkConstraints) {
    table.checkConstraints = Object.fromEntries(
      Object.entries(table.checkConstraints).map(([key, check]) => [
        renamedKey(key, rename.from, rename.to),
        {
          ...check,
          name: renamedKey(check.name, rename.from, rename.to),
          value: renameInSql(check.value, rename.from, rename.to),
        },
      ]),
    );
  }

  return { snapshot: next, indexes: renamedIndexes };
}

/**
 * A Postgres rename, for the Next.js stack.
 *
 * Quoted with double quotes rather than backticks, and no statement breakpoints: Prisma
 * splits a migration on semicolons itself.
 */
export function prismaRenameSql(rename: PendingRename): string {
  return [
    "-- Written by `flare gen migration --from-schema` from a `rename` in the descriptor.",
    "-- A rename rather than a drop and an add, so the column keeps its data.",
    `ALTER TABLE "${rename.table}" RENAME COLUMN "${rename.from}" TO "${rename.to}";`,
    "",
  ].join("\n");
}

/**
 * The directory name Prisma gives a migration: a UTC timestamp, then the name.
 *
 * Built here because Flare writes this migration itself rather than asking Prisma for
 * it. Prisma orders migrations by this name and records which have run in a table in the
 * database, so a folder written by hand is indistinguishable from one Prisma created —
 * which is what lets the rename land before the diff that would otherwise drop the
 * column.
 */
export function prismaMigrationDirName(rename: PendingRename, now: Date): string {
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    String(now.getUTCSeconds()).padStart(2, "0"),
  ].join("");
  return `${stamp}_rename_${rename.table}_${rename.from}_to_${rename.to}`;
}
