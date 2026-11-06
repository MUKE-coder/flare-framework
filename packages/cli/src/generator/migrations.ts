import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveBin } from "../commands/run.js";
import type { LoadedResource } from "./load.js";
import { pendingRenames, renameInSnapshot, renameProblems, renameSql, type PendingRename, type Snapshot } from "./rename.js";
import { repairRebuildMigration, snapshotColumns } from "./repair.js";

export interface GenerateMigrationResult {
  /** New migration files, relative to the app root (empty when the schema didn't change). */
  files: string[];
  output: string;
  /** Fixes applied to drizzle-kit output (see repair.ts). */
  repairs: string[];
}

const listSql = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".sql")) : []);

/** The newest drizzle-kit snapshot, which is what the schema is currently diffed against. */
export function latestSnapshot(appRoot: string): Snapshot | undefined {
  const metaDir = join(appRoot, "migrations", "meta");
  if (!existsSync(metaDir)) return undefined;
  const newest = readdirSync(metaDir)
    .filter((file) => /^\d+_snapshot\.json$/.test(file))
    .sort()
    .pop();
  return newest ? (JSON.parse(readFileSync(join(metaDir, newest), "utf8")) as Snapshot) : undefined;
}

/** The snapshot file a migration wrote, by its number: 0004_x.sql → meta/0004_snapshot.json. */
function snapshotPathFor(appRoot: string, migrationFile: string): string | undefined {
  const prefix = /^(?:migrations[\\/])?(\d+)_/.exec(migrationFile)?.[1];
  return prefix ? join(appRoot, "migrations", "meta", `${prefix}_snapshot.json`) : undefined;
}

/**
 * Apply the renames a descriptor declares, as real `RENAME COLUMN` migrations.
 *
 * One migration per rename, in declaration order, because each has to be written against
 * the snapshot the one before it left behind — two renames batched into a single
 * migration would need a snapshot that is correct for neither half of it.
 *
 * `--custom` is what makes this safe: drizzle-kit creates the migration file, the journal
 * entry and the snapshot with its ids and prevId already right, and copies the previous
 * snapshot into it. All that is missing is the SQL and the one column name, which is
 * exactly what rename.ts supplies — so no part of drizzle-kit's bookkeeping is written by
 * hand.
 */
export async function applyDeclaredRenames(
  appRoot: string,
  all: LoadedResource[],
): Promise<{ files: string[]; renames: PendingRename[] }> {
  const problems = renameProblems(all);
  if (problems.length) throw new Error(`Can't apply a rename:\n${problems.map((problem) => `  ${problem}`).join("\n")}`);

  const files: string[] = [];
  const applied: PendingRename[] = [];
  // Re-read the snapshot each time round: the previous rename moved it on.
  for (let rename = pendingRenames(all, latestSnapshot(appRoot))[0]; rename; rename = pendingRenames(all, latestSnapshot(appRoot))[0]) {
    const result = await generateSchemaMigration(appRoot, `rename_${rename.table}_${rename.from}_to_${rename.to}`, { custom: true });
    const file = result.files[0];
    if (!file) throw new Error(`drizzle-kit wrote no migration for the rename of ${rename.table}.${rename.from}.`);

    const snapshotPath = snapshotPathFor(appRoot, file);
    if (!snapshotPath || !existsSync(snapshotPath)) {
      throw new Error(`Renamed ${rename.table}.${rename.from}, but could not find the snapshot ${file} wrote.`);
    }
    const { snapshot, indexes } = renameInSnapshot(JSON.parse(readFileSync(snapshotPath, "utf8")) as Snapshot, rename);
    writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    writeFileSync(join(appRoot, file), `${renameSql(rename, indexes)}\n`);

    files.push(file);
    applied.push(rename);
    // A declaration that somehow stayed pending would loop for ever; this cannot happen
    // once the snapshot is written, and saying so is cheaper than finding out.
    if (applied.length > 50) throw new Error("Too many renames in one run; apply them a few at a time.");
  }
  return { files, renames: applied };
}

/**
 * Run the app's drizzle-kit to diff `db/schema.ts` against the last snapshot and
 * write a migration named `name`. New files are found by diffing the directory,
 * not by parsing drizzle-kit's output.
 */
export async function generateSchemaMigration(
  appRoot: string,
  name: string,
  options: { custom?: boolean } = {},
): Promise<GenerateMigrationResult> {
  const dir = join(appRoot, "migrations");
  const before = new Set(listSql(dir));
  const bin = resolveBin(appRoot, "drizzle-kit", "drizzle-kit");

  const { code, output } = await new Promise<{ code: number; output: string }>((resolve, reject) => {
    // stdin is closed so that drizzle-kit cannot hang waiting for an answer nobody is
    // there to give. It does not fail cleanly when that happens — see the check on its
    // output below, which is what actually decides whether this run worked.
    const args = ["generate", "--name", name, ...(options.custom ? ["--custom"] : [])];
    const child = spawn(process.execPath, [bin, ...args], {
      cwd: appRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let text = "";
    child.stdout.on("data", (chunk) => (text += chunk));
    child.stderr.on("data", (chunk) => (text += chunk));
    child.on("error", reject);
    child.on("exit", (exitCode) => resolve({ code: exitCode ?? 1, output: text }));
  });

  const created = listSql(dir)
    .filter((file) => !before.has(file))
    .sort();

  const failure = drizzleFailure({ code, output, wroteFiles: created.length > 0 });
  if (failure) throw new Error(failure);

  const repairs: string[] = [];
  for (const file of created) {
    const previous = previousSnapshot(dir, file);
    if (!previous) continue;
    const path = join(dir, file);
    const { sql, changes } = repairRebuildMigration(readFileSync(path, "utf8"), snapshotColumns(previous));
    if (changes.length) {
      writeFileSync(path, sql);
      repairs.push(...changes.map((change) => `${file}: ${change}`));
    }
  }
  return { files: created.map((file) => `migrations/${file}`), output, repairs };
}

/**
 * Whether a drizzle-kit run failed, and what to say about it — or undefined if it worked.
 *
 * Its exit code is not a verdict. When drizzle-kit needs to ask whether a column was
 * renamed or dropped and there is no TTY to ask on, it prints a stack trace and exits 0
 * having written nothing. Trusting the code alone reported that as "no table changes",
 * and because the unresolved rename is still there on the next run, every later
 * `gen resource` produced no migration either: a project could stop generating migrations
 * altogether and never say so. So the output is read too, and a run that wrote no
 * migration while printing an error counts as failed whatever it exited with.
 */
export function drizzleFailure(run: { code: number; output: string; wroteFiles: boolean }): string | undefined {
  const { code, output, wroteFiles } = run;
  const crashed =
    /^\s*(?:Error|TypeError|RangeError|SyntaxError):/m.test(output) || /^\s*at .*drizzle-kit/m.test(output);
  if (code === 0 && (wroteFiles || !crashed)) return undefined;

  const needsAnAnswer = /Interactive prompts require a TTY|promptColumnsConflicts|promptTablesConflicts/.test(output);
  const advice = needsAnAnswer
    ? "\n\nThis is drizzle-kit asking whether a column was renamed, or dropped and added — a question it cannot ask here.\n" +
      "Answer it once, in a terminal:\n\n    pnpm exec drizzle-kit generate\n\n" +
      "Until it is answered no migration can be generated for this app at all, including for unrelated resources."
    : "";
  return `drizzle-kit generate failed:\n${output.trim()}${advice}`;
}

/** The drizzle-kit snapshot from before `migrationFile` (e.g. 0007 for 0008_x.sql). */
function previousSnapshot(dir: string, migrationFile: string) {
  const prefix = /^(\d+)_/.exec(migrationFile)?.[1];
  const metaDir = join(dir, "meta");
  if (!prefix || !existsSync(metaDir)) return undefined;
  const earlier = readdirSync(metaDir)
    .filter((file) => /^\d+_snapshot\.json$/.test(file) && file < `${prefix}_snapshot.json`)
    .sort()
    .pop();
  return earlier ? JSON.parse(readFileSync(join(metaDir, earlier), "utf8")) : undefined;
}
