/**
 * `flare db:push <table...>`: copy rows from the local database to the deployed one.
 *
 * Seeds run locally, which leaves a gap the first time you deploy: the catalogue, the
 * price list, the countries table — the reference data an app needs before anyone can
 * use it — exists on your machine and nowhere else. This sends it up, as SQL, through
 * the same import path a large `seed:resource --remote` uses.
 *
 * It only ever writes to the remote database. Nothing is read back, and nothing local
 * changes.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pc from "picocolors";
import { insertStatements, type Row } from "../seed/bulk.js";
import { openLocalD1 } from "../seed/local-d1.js";
import { formatCount, formatDuration } from "../terminal.js";
import { readD1Databases, runWrangler, type D1Database } from "../utils/wrangler.js";
import { findAppRoot, resolveBin } from "./run.js";

export interface DbPushOptions {
  /** Delete the table's remote rows first. */
  truncate?: boolean;
  /** Required: this writes to production. */
  yes?: boolean;
  database?: string;
  env?: string;
  cwd?: string;
  log?: (message: string) => void;
}

export interface DbPushResult {
  tables: { table: string; rows: number }[];
  ms: number;
}

/** Rows read per query, so a big table doesn't arrive in one lump. */
const PAGE = 2000;

function pickDatabase(databases: D1Database[], wanted?: string): D1Database {
  if (databases.length === 0) throw new Error("No d1_databases in wrangler.jsonc.");
  if (wanted) {
    const match = databases.find((db) => db.binding === wanted || db.database_name === wanted);
    if (!match) throw new Error(`No D1 database "${wanted}". Available: ${databases.map((db) => db.binding).join(", ")}.`);
    return match;
  }
  if (databases.length > 1) throw new Error(`Several D1 databases; pick one with --database (${databases.map((db) => db.binding).join(", ")}).`);
  return databases[0]!;
}

export async function dbPush(tables: string[], options: DbPushOptions = {}): Promise<DbPushResult> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  if (tables.length === 0) throw new Error("Name at least one table, e.g. flare db:push products categories --yes");

  const bad = tables.find((table) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table));
  if (bad) throw new Error(`"${bad}" isn't a table name.`);
  if (!options.yes) {
    throw new Error(`This writes ${tables.join(", ")} to the deployed database. Re-run with --yes to confirm.`);
  }

  const db = pickDatabase(readD1Databases(appRoot), options.database);
  const wrangler = resolveBin(appRoot, "wrangler", "wrangler");
  const started = Date.now();
  const local = await openLocalD1(appRoot, options.database);
  const dir = mkdtempSync(join(tmpdir(), "flare-push-"));

  try {
    const statements: string[] = [];
    const counts: { table: string; rows: number }[] = [];

    for (const table of tables) {
      if (options.truncate) statements.push(`DELETE FROM "${table}";`);
      let offset = 0;
      let rows = 0;
      for (;;) {
        const page = await local.db.prepare(`SELECT * FROM "${table}" LIMIT ${PAGE} OFFSET ${offset}`).all<Row>();
        const results = page.results ?? [];
        if (results.length === 0) break;
        const columns = Object.keys(results[0]!);
        for (const statement of insertStatements(table, columns, results)) statements.push(statement.sql);
        rows += results.length;
        if (results.length < PAGE) break;
        offset += PAGE;
      }
      counts.push({ table, rows });
      log(`${pc.cyan("read")} ${table} ${pc.dim(`(${formatCount(rows)} rows)`)}`);
    }

    const total = counts.reduce((sum, entry) => sum + entry.rows, 0);
    if (total === 0) {
      log("Nothing to push: those tables are empty locally.");
      return { tables: counts, ms: Date.now() - started };
    }

    const file = join(dir, "push.sql");
    writeFileSync(file, statements.join("\n"));
    const target = ["--remote", ...(options.env ? ["--env", options.env] : [])];
    const result = await runWrangler(wrangler, ["d1", "execute", db.binding, ...target, "--yes", "--file", file], appRoot, { capture: true });
    if (result.code !== 0) throw new Error(`Pushing to ${db.database_name} failed:\n${result.output.trim()}`);

    const ms = Date.now() - started;
    log(`${pc.green("✔")} Pushed ${pc.bold(formatCount(total))} rows to ${pc.bold(db.database_name)} ${pc.dim(`(${formatDuration(ms)})`)}`);
    return { tables: counts, ms };
  } finally {
    rmSync(dir, { recursive: true, force: true });
    await local.dispose();
  }
}
