import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveBin } from "../commands/run.js";
import { repairRebuildMigration, snapshotColumns } from "./repair.js";

export interface GenerateMigrationResult {
  /** New migration files, relative to the app root (empty when the schema didn't change). */
  files: string[];
  output: string;
  /** Fixes applied to drizzle-kit output (see repair.ts). */
  repairs: string[];
}

const listSql = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith(".sql")) : []);

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
    // stdin is closed: if drizzle-kit needs an interactive answer (e.g. rename vs. drop), it fails
    // instead of hanging, and we surface its message.
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

  if (code !== 0) {
    throw new Error(
      `drizzle-kit generate failed:\n${output.trim()}\n\nIf it asked whether a column was renamed, run \`pnpm exec drizzle-kit generate\` in a terminal to answer interactively.`,
    );
  }
  const created = listSql(dir)
    .filter((file) => !before.has(file))
    .sort();

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
