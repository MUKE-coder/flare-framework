import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveBin } from "../commands/run.js";

export interface GenerateMigrationResult {
  /** New migration files, relative to the app root (empty when the schema didn't change). */
  files: string[];
  output: string;
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
  const files = listSql(dir)
    .filter((file) => !before.has(file))
    .sort()
    .map((file) => `migrations/${file}`);
  return { files, output };
}
