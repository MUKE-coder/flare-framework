import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { snakeCase } from "@flare/core";
import pc from "picocolors";
import { generateSchemaMigration } from "../generator/migrations.js";
import { findAppRoot } from "./run.js";

export interface GenMigrationOptions {
  /** Diff db/schema.ts against the last snapshot instead of scaffolding a blank migration. */
  fromSchema?: boolean;
  cwd?: string;
  log?: (message: string) => void;
}

export const DOWN_TEMPLATE = (up: string) => `-- Rollback for ${up}, run by \`flare migrate:rollback\`.
-- Write SQL that undoes the up migration, e.g.:
--   DROP INDEX IF EXISTS \`contacts_phone_idx\`;
-- While this file has no statements, rollback of ${up} is refused.
`;

/**
 * `flare gen migration <name> [--from-schema]`
 *
 * Blank (default): drizzle-kit's --custom migration, so it's numbered and journaled
 * like generated ones, plus a matching down file to fill in.
 * --from-schema: drizzle-kit's diff of the current tables (after editing descriptors
 * and running `flare sync-types`).
 */
export async function genMigration(rawName: string, options: GenMigrationOptions = {}): Promise<string[]> {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const name = snakeCase(rawName);
  if (!name) throw new Error(`Invalid migration name "${rawName}". Use letters, digits, and underscores.`);

  const { files } = await generateSchemaMigration(appRoot, name, { custom: !options.fromSchema });
  if (files.length === 0) {
    log(options.fromSchema ? "No schema changes, so no migration was created." : "drizzle-kit didn't create a migration.");
    return [];
  }
  for (const file of files) log(`${pc.green("create".padEnd(9))} ${file}`);

  if (!options.fromSchema) {
    const downDir = join(appRoot, "migrations", "down");
    mkdirSync(downDir, { recursive: true });
    for (const file of files) {
      const down = join(downDir, basename(file));
      if (existsSync(down)) continue;
      writeFileSync(down, DOWN_TEMPLATE(basename(file)));
      log(`${pc.green("create".padEnd(9))} migrations/down/${basename(file)}`);
    }
    log(`\nWrite your SQL in ${files[0]} (and its rollback in migrations/down/), then run ${pc.bold("flare migrate")}.`);
  } else {
    log(`\nNext: ${pc.bold("flare migrate")}.`);
  }
  return files;
}
