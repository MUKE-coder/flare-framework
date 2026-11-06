import { describe, expect, it } from "vitest";
import { drizzleFailure } from "../src/generator/migrations.js";

/**
 * The output drizzle-kit 0.31.11 actually prints when it wants to ask whether a column
 * was renamed and there is no TTY to ask on. The thing to notice is the exit code that
 * came with it: 0.
 */
const NO_TTY = `No config path provided, using default 'drizzle.config.ts'
Reading config file 'D:\\app\\drizzle.config.ts'
Error: Interactive prompts require a TTY terminal (process.stdin.isTTY or process.stdout.isTTY is false). Run this command in an interactive terminal.
    at promptColumnsConflicts (D:\\app\\node_modules\\.pnpm\\drizzle-kit@0.31.11\\node_modules\\drizzle-kit\\bin.cjs:32711:65)
    at columnsResolver (D:\\app\\node_modules\\.pnpm\\drizzle-kit@0.31.11\\node_modules\\drizzle-kit\\bin.cjs:32800:30)
    at applySqliteSnapshotsDiff (D:\\app\\node_modules\\.pnpm\\drizzle-kit@0.31.11\\node_modules\\drizzle-kit\\bin.cjs:21065:40)`;

describe("drizzleFailure", () => {
  it("catches the rename prompt that exits 0 and writes nothing", () => {
    // The whole of issue #75: this used to pass as success, so `gen resource` reported
    // "no table changes" and the next resource got no migration either.
    const failure = drizzleFailure({ code: 0, output: NO_TTY, wroteFiles: false });
    expect(failure).toBeDefined();
    expect(failure).toContain("Interactive prompts require a TTY");
  });

  it("says it is a rename question, and how to answer it", () => {
    const failure = drizzleFailure({ code: 0, output: NO_TTY, wroteFiles: false })!;
    expect(failure).toContain("renamed, or dropped and added");
    expect(failure).toContain("pnpm exec drizzle-kit generate");
    // Because the next resource is the one most people notice it on.
    expect(failure).toContain("including for unrelated resources");
  });

  it("leaves a run that genuinely found nothing to do alone", () => {
    const quiet = "No config path provided, using default 'drizzle.config.ts'\nNo schema changes, nothing to migrate 😴";
    expect(drizzleFailure({ code: 0, output: quiet, wroteFiles: false })).toBeUndefined();
  });

  it("leaves a successful run alone", () => {
    const wrote = "6 tables\nYour SQL migration file ➜ migrations/0003_create_gadgets.sql 🚀";
    expect(drizzleFailure({ code: 0, output: wrote, wroteFiles: true })).toBeUndefined();
  });

  it("still fails on a non-zero exit, even without a recognisable error line", () => {
    expect(drizzleFailure({ code: 1, output: "killed", wroteFiles: false })).toContain("killed");
  });

  it("does not cry failure over an error printed by a run that still wrote a migration", () => {
    // drizzle-kit warns about plenty of things on its way to a working migration; only a
    // run that produced nothing is treated as broken.
    const noisy = "Error: could not read optional config\nYour SQL migration file ➜ migrations/0004_x.sql 🚀";
    expect(drizzleFailure({ code: 0, output: noisy, wroteFiles: true })).toBeUndefined();
  });

  it("reports a crash that is not about prompts without the rename advice", () => {
    const crash = "Error: Cannot find module './schema.ts'\n    at Object.<anonymous> (/app/node_modules/drizzle-kit/bin.cjs:1:1)";
    const failure = drizzleFailure({ code: 0, output: crash, wroteFiles: false })!;
    expect(failure).toContain("Cannot find module");
    expect(failure).not.toContain("pnpm exec drizzle-kit generate");
  });
});
