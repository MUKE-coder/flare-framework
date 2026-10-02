import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { snakeCase } from "@flaredev/core";
import pc from "picocolors";
import { destructiveStatements } from "../generator/destructive.js";
import { generateSchemaMigration } from "../generator/migrations.js";
import { findAppRoot, resolveBin, runNodeCapturing } from "./run.js";
import { readStack } from "../stack.js";

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

  // Prisma writes migrations on the Next.js stack, and it needs guarding — see below.
  if (readStack(appRoot) === "next") return genPrismaMigration(appRoot, name, options);

  const { files, repairs } = await generateSchemaMigration(appRoot, name, { custom: !options.fromSchema });
  if (files.length === 0) {
    log(options.fromSchema ? "No schema changes, so no migration was created." : "drizzle-kit didn't create a migration.");
    return [];
  }
  for (const file of files) log(`${pc.green("create".padEnd(9))} ${file}`);
  for (const repair of repairs) log(pc.dim(`repaired  ${repair}`));

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

/**
 * `flare gen migration <name>` on the Next.js stack.
 *
 * Prisma's own `migrate dev` writes the migration *and applies it* in one step, after
 * asking about anything it thinks has drifted. The trouble is what it cannot see: a GIN
 * index, a generated column, a trigger or a partial index written by hand is not in the
 * schema, so Prisma reads it as drift and offers to drop it. Answering that prompt quickly
 * is how a hand-written index disappears from production.
 *
 * So this writes the migration without applying it (`--create-only`), reads the SQL back,
 * and stops if it would throw anything away. The migration stays on disk either way — the
 * answer is almost always to edit it, not to abandon it.
 */
async function genPrismaMigration(appRoot: string, name: string, options: GenMigrationOptions): Promise<string[]> {
  const log = options.log ?? ((message: string) => console.log(message));
  const prisma = resolveBin(appRoot, "prisma", "prisma");
  const migrations = join(appRoot, "prisma", "migrations");
  const before = new Set(existsSync(migrations) ? readdirSync(migrations) : []);

  log(`${pc.cyan("prisma")} migrate dev --create-only --name ${name}`);
  const { code, output } = await runNodeCapturing([prisma, "migrate", "dev", "--create-only", "--name", name], appRoot);

  if (code !== 0) {
    // Prisma ends a drift report by suggesting `prisma migrate reset`, which drops the
    // database. That is almost never the right answer here: drift usually means the
    // database has something Prisma's schema does not describe — a generated column, an
    // index, a trigger — and resetting is precisely how you lose it. Nothing has been
    // applied at this point; `--create-only` writes a file at most. So the last thing on
    // screen should be what to do instead of resetting.
    if (/drift detected|we need to reset/i.test(output)) {
      log("");
      log(pc.yellow("Prisma found something in the database that its schema does not describe."));
      log(
        [
          "",
          `Nothing has been changed — ${pc.bold("--create-only")} writes a migration, it does not apply one, and no`,
          "migration was written. Do not run `prisma migrate reset`: it drops the database, and what it",
          "would drop is the thing Prisma is complaining it cannot see.",
          "",
          "Drift above is reported as changes to get from your migrations to the database, so it lists",
          "what the database has and the migrations do not. Usually that is something added by hand:",
          "",
          `  ${pc.bold("It should be there")} — write it into a migration so the history matches. Add the SQL to a`,
          "  new migration and mark it applied with `prisma migrate resolve --applied <name>`.",
          "",
          `  ${pc.bold("It should not be there")} — remove it from the database yourself, then run this again.`,
          "",
          "An index, a trigger or a function is not reported as drift at all; Prisma does not look at",
          "those. They survive a migration and are lost by a reset, which is the other reason not to.",
        ].join("\n"),
      );
    }
    return [];
  }

  const added = (existsSync(migrations) ? readdirSync(migrations) : []).filter((entry) => !before.has(entry));
  if (added.length === 0) {
    log("No schema changes, so no migration was created.");
    return [];
  }

  const written: string[] = [];
  const destructive: { file: string; found: ReturnType<typeof destructiveStatements> }[] = [];
  for (const entry of added) {
    const file = join(migrations, entry, "migration.sql");
    if (!existsSync(file)) continue;
    const relative = `prisma/migrations/${entry}/migration.sql`;
    written.push(relative);
    log(`${pc.green("create".padEnd(9))} ${relative}`);
    const found = destructiveStatements(readFileSync(file, "utf8"));
    if (found.length > 0) destructive.push({ file: relative, found });
  }

  if (destructive.length > 0) {
    log("");
    log(pc.yellow(`This migration throws things away, so it has not been applied:`));
    for (const { file, found } of destructive) {
      log(pc.dim(`\n  ${file}`));
      for (const entry of found) {
        log(`    ${pc.red(`line ${entry.line}`)}  ${entry.statement}`);
        log(`             ${pc.dim(`drops ${entry.kind}`)}`);
      }
    }
    log(
      [
        "",
        "There are two reasons Prisma writes a drop, and only you can tell them apart:",
        "",
        `  ${pc.bold("You asked for it")} — a field left a descriptor, or a resource was removed. Then the drop is`,
        `  the point, and ${pc.bold("flare migrate")} applies it.`,
        "",
        `  ${pc.bold("Prisma cannot see it")} — the column, index or constraint was added by hand, so the schema`,
        "  does not describe it and the diff reads it as something to remove. Then applying this",
        "  loses it, and Prisma will not put it back.",
        "",
        `Read ${pc.bold(destructive[0]!.file)} before deciding. To keep an object Prisma does not`,
        "know about, delete those statements from the migration — and consider writing the object into",
        "a migration of its own so the next diff stops proposing to drop it.",
      ].join("\n"),
    );
    return written;
  }

  log(`\nNothing destructive in it. Next: ${pc.bold("flare migrate")} to apply it.`);
  return written;
}
