import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pc from "picocolors";
import { deriveDown, splitStatements } from "../generator/down.js";
import { extractJson, readD1Databases, runWrangler, type D1Database } from "../utils/wrangler.js";
import { findAppRoot, resolveBin } from "./run.js";

export interface MigrateOptions {
  remote?: boolean;
  env?: string;
  /** D1 binding to target when the app has several databases. */
  database?: string;
  cwd?: string;
  log?: (message: string) => void;
}

export interface RollbackOptions extends MigrateOptions {
  steps?: number;
  /** Required with --remote. */
  yes?: boolean;
}

function context(options: MigrateOptions) {
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const databases = readD1Databases(appRoot);
  if (databases.length === 0) throw new Error("No d1_databases in wrangler.jsonc.");
  let db: D1Database;
  if (options.database) {
    const match = databases.find((candidate) => candidate.binding === options.database || candidate.database_name === options.database);
    if (!match) throw new Error(`No D1 database "${options.database}". Available: ${databases.map((d) => d.binding).join(", ")}.`);
    db = match;
  } else if (databases.length === 1) {
    db = databases[0]!;
  } else {
    throw new Error(`Several D1 databases; pick one with --database (${databases.map((d) => d.binding).join(", ")}).`);
  }
  const target = [options.remote ? "--remote" : "--local", ...(options.env ? ["--env", options.env] : [])];
  return {
    appRoot,
    db,
    target,
    where: options.remote ? "remote" : "local",
    wrangler: resolveBin(appRoot, "wrangler", "wrangler"),
    log: options.log ?? ((message: string) => console.log(message)),
  };
}

/** `flare migrate`: apply pending migrations (local by default). */
export async function migrate(options: MigrateOptions = {}): Promise<number> {
  const { appRoot, db, target, wrangler } = context(options);
  const result = await runWrangler(wrangler, ["d1", "migrations", "apply", db.binding, ...target], appRoot);
  return result.code;
}

export interface AppliedMigration {
  id: number;
  name: string;
}

/** Most recently applied migrations first. */
export async function appliedMigrations(options: MigrateOptions, limit: number): Promise<AppliedMigration[]> {
  const { appRoot, db, target, wrangler } = context(options);
  const result = await runWrangler(
    wrangler,
    ["d1", "execute", db.binding, ...target, "--json", "--command", `SELECT id, name FROM d1_migrations ORDER BY id DESC LIMIT ${limit}`],
    appRoot,
    { capture: true },
  );
  if (result.code !== 0) {
    if (/no such table: d1_migrations/i.test(result.output)) return [];
    throw new Error(`Could not read applied migrations:\n${result.output.trim()}`);
  }
  const [first] = extractJson<{ results: AppliedMigration[] }[]>(result.output);
  return first?.results ?? [];
}

/** `flare migrate:rollback`: undo the last N applied migrations. */
export async function rollback(options: RollbackOptions = {}): Promise<number> {
  const steps = options.steps ?? 1;
  if (!Number.isInteger(steps) || steps < 1) throw new Error("--steps must be a positive integer.");
  const { appRoot, db, target, where, wrangler, log } = context(options);
  const migrationsDir = join(appRoot, db.migrations_dir ?? "migrations");

  const applied = await appliedMigrations(options, steps);
  if (applied.length === 0) {
    log("Nothing to roll back.");
    return 0;
  }

  // Resolve every down migration before touching the database.
  const plan: { name: string; sql: string; source: string }[] = [];
  for (const { name } of applied) {
    if (!/^[\w.-]+\.sql$/.test(name)) throw new Error(`Unexpected migration name "${name}" in d1_migrations.`);
    const handWritten = join(migrationsDir, "down", name);
    if (existsSync(handWritten)) {
      const sql = readFileSync(handWritten, "utf8");
      if (splitStatements(sql).length === 0) {
        throw new Error(`Can't roll back ${name}: migrations/down/${name} has no SQL statements yet. Write the rollback SQL, then run the rollback again. Nothing was changed.`);
      }
      plan.push({ name, sql, source: `migrations/down/${name}` });
      continue;
    }
    const upPath = join(migrationsDir, name);
    if (!existsSync(upPath)) throw new Error(`${name} was applied but migrations/${name} is missing, so it can't be reversed.`);
    const down = deriveDown(readFileSync(upPath, "utf8"));
    if (!down.reversible) {
      throw new Error(
        `Can't roll back ${name}: ${down.reason}\nWrite the reverse SQL to migrations/down/${name} and run the rollback again. Nothing was changed.`,
      );
    }
    plan.push({ name, sql: down.sql, source: "derived" });
  }

  log(`${pc.bold(`Rolling back ${plan.length} migration(s) on ${db.database_name} (${where}):`)}`);
  for (const step of plan) {
    log(`  ${step.name} ${pc.dim(`(${step.source})`)}`);
    for (const line of step.sql.trim().split("\n")) log(pc.dim(`    ${line}`));
  }

  if (options.remote && !options.yes) {
    log(pc.yellow("\nThis changes the remote database. Re-run with --yes to proceed."));
    return 1;
  }

  const script =
    plan
      .map(({ name, sql }) => `${sql.trim()}\nDELETE FROM d1_migrations WHERE name = '${name.replace(/'/g, "''")}';`)
      .join("\n") + "\n";
  const dir = mkdtempSync(join(tmpdir(), "flare-rollback-"));
  try {
    const file = join(dir, "rollback.sql");
    writeFileSync(file, script);
    const result = await runWrangler(wrangler, ["d1", "execute", db.binding, ...target, "--file", file], appRoot, { capture: true });
    if (result.code !== 0) throw new Error(`Rollback failed:\n${result.output.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  log(pc.green(`\nRolled back ${plan.map((step) => step.name).join(", ")}.`));
  return 0;
}
