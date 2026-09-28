import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/commands/create.js";
import { ensureSupportFiles } from "../src/generator/plan.js";

/**
 * Upgrading an app made by an older Flare.
 *
 * Before 0.6.0 the resource engine lived in @flaredev/core and an app had no
 * lib/resource/. Its next `gen resource` writes routes that import `@/lib/resource`,
 * so the folder has to appear when it's missing — otherwise upgrading the CLI breaks
 * the app with a module-not-found error and no explanation.
 */
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function olderApp(stack?: "next") {
  const root = mkdtempSync(join(tmpdir(), "flare-upgrade-"));
  dirs.push(root);
  const dir = join(root, "shop");
  createApp(dir, { install: false, pm: "pnpm", ...(stack ? { stack } : {}) });
  // What an app from before the move looks like.
  rmSync(join(dir, "lib/resource"), { recursive: true, force: true });
  return dir;
}

describe("an app that predates lib/resource", () => {
  it("gets the engine installed on the next generate", () => {
    const dir = olderApp();
    expect(existsSync(join(dir, "lib/resource"))).toBe(false);

    ensureSupportFiles(dir, () => {});

    for (const name of ["rows.ts", "query.ts", "store.ts", "handlers.ts", "index.ts", "drizzle-rows.ts"]) {
      expect(existsSync(join(dir, "lib/resource", name)), name).toBe(true);
    }
    expect(readFileSync(join(dir, "lib/resource/index.ts"), "utf8")).toContain('export * from "./drizzle-rows"');
  });

  it("gets the Prisma adapter on the Next.js stack, not the Drizzle one", () => {
    const dir = olderApp("next");
    ensureSupportFiles(dir, () => {});
    expect(existsSync(join(dir, "lib/resource/prisma-rows.ts"))).toBe(true);
    expect(existsSync(join(dir, "lib/resource/drizzle-rows.ts"))).toBe(false);
    expect(readFileSync(join(dir, "lib/resource/index.ts"), "utf8")).toContain('export * from "./prisma-rows"');
  });

  it("never overwrites a copy the app has already edited", () => {
    const dir = olderApp();
    ensureSupportFiles(dir, () => {});
    const file = join(dir, "lib/resource/query.ts");
    rmSync(file);
    writeFileSync(file, "// mine\n");
    ensureSupportFiles(dir, () => {});
    expect(readFileSync(file, "utf8")).toBe("// mine\n");
  });
});
