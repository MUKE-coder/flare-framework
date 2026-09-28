import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compareTracked, diffTracked, updateTracked } from "../src/commands/eject.js";
import { createApp } from "../src/commands/create.js";

/**
 * `flare diff` / `flare update`.
 *
 * The engine lives in the app so it can be read and changed. These commands are the
 * other half of that bargain: they are the only way a later Flare release reaches an
 * app, and they must never take someone's edits without being asked.
 */
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function app(stack?: "next") {
  const root = mkdtempSync(join(tmpdir(), "flare-eject-"));
  dirs.push(root);
  const dir = join(root, "shop");
  createApp(dir, { install: false, pm: "pnpm", ...(stack ? { stack } : {}) });
  return dir;
}

const quiet = () => {
  const lines: string[] = [];
  return { log: (message: string) => lines.push(message), lines };
};

describe("a freshly created app", () => {
  it("matches the version that made it", () => {
    const dir = app();
    expect(compareTracked(dir, "cloudflare").every((entry) => entry.state === "same")).toBe(true);
  });

  it("doesn't report the other stack's adapter as missing", () => {
    // A Next.js app has prisma-rows and no drizzle-rows, on purpose.
    const paths = compareTracked(app("next"), "next").map((entry) => entry.path);
    expect(paths).toContain("lib/resource/prisma-rows.ts");
    expect(paths).not.toContain("lib/resource/drizzle-rows.ts");
  });
});

describe("after the app's copy is edited", () => {
  it("says which file differs, and shows the line", () => {
    const dir = app();
    const file = join(dir, "lib/resource/query.ts");
    writeFileSync(file, `${readFileSync(file, "utf8")}\n// a change of mine\n`);

    const { log, lines } = quiet();
    const result = diffTracked({ cwd: dir, log });
    expect(result.find((entry) => entry.path === "lib/resource/query.ts")?.state).toBe("changed");
    expect(lines.join("\n")).toContain("a change of mine");
  });

  it("refuses to overwrite without --yes, and leaves the file alone", () => {
    const dir = app();
    const file = join(dir, "lib/resource/query.ts");
    const mine = `${readFileSync(file, "utf8")}\n// a change of mine\n`;
    writeFileSync(file, mine);

    const { log, lines } = quiet();
    expect(updateTracked({ cwd: dir, log })).toBe(1);
    expect(readFileSync(file, "utf8")).toBe(mine);
    expect(lines.join("\n")).toMatch(/discards your edits/);
  });

  it("applies the update with --yes", () => {
    const dir = app();
    const file = join(dir, "lib/resource/query.ts");
    writeFileSync(file, `${readFileSync(file, "utf8")}\n// a change of mine\n`);

    expect(updateTracked({ cwd: dir, yes: true, log: () => {} })).toBe(0);
    expect(readFileSync(file, "utf8")).not.toContain("a change of mine");
    expect(compareTracked(dir, "cloudflare").every((entry) => entry.state === "same")).toBe(true);
  });

  it("restores a file the app deleted", () => {
    const dir = app();
    rmSync(join(dir, "lib/resource/rows.ts"));
    expect(compareTracked(dir, "cloudflare").find((entry) => entry.path === "lib/resource/rows.ts")?.state).toBe("missing");
    updateTracked({ cwd: dir, yes: true, log: () => {} });
    expect(readFileSync(join(dir, "lib/resource/rows.ts"), "utf8")).toContain("ResourceRows");
  });

  it("limits itself to a filter", () => {
    const dir = app();
    for (const name of ["query.ts", "store.ts"]) {
      const file = join(dir, "lib/resource", name);
      writeFileSync(file, `${readFileSync(file, "utf8")}\n// mine\n`);
    }
    updateTracked({ cwd: dir, yes: true, filter: "query", log: () => {} });
    expect(readFileSync(join(dir, "lib/resource/query.ts"), "utf8")).not.toContain("// mine");
    expect(readFileSync(join(dir, "lib/resource/store.ts"), "utf8")).toContain("// mine");
  });
});

describe("what gets tracked", () => {
  it("covers every file Flare copies, not only the engine", () => {
    // lib/resource alone meant a fix to the storage adapter, the cache or any dashboard
    // component could never reach an existing app — which is what these commands are
    // for. 0.7.1's upload fix was exactly that file.
    const paths = compareTracked(app(), "cloudflare").map((entry) => entry.path);
    for (const path of ["lib/resource/store.ts", "lib/storage.ts", "lib/cache.ts", "lib/api.ts", "components/dashboard/resource-table.tsx"]) {
      expect(paths, path).toContain(path);
    }
    expect(paths.length).toBeGreaterThan(50);
  });

  it("leaves out the files that are the app's own", () => {
    const paths = compareTracked(app(), "cloudflare").map((entry) => entry.path);
    // Rewritten per app from a placeholder, or written from create-time choices; both
    // differ from their template in every app there will ever be.
    for (const path of ["lib/site.ts", "lib/auth.ts", "lib/mail.ts", "lib/auth-config.ts"]) {
      expect(paths, path).not.toContain(path);
    }
  });

  it("reports a fresh app as matching, so real drift stands out", () => {
    const changed = compareTracked(app(), "cloudflare").filter((entry) => entry.state !== "same");
    expect(changed.map((entry) => entry.path)).toEqual([]);
  });
});

describe("the engine that gets copied", () => {
  it("never imports the framework it was copied out of", () => {
    const dir = app();
    for (const name of ["rows.ts", "query.ts", "store.ts", "handlers.ts", "drizzle-rows.ts"]) {
      const source = readFileSync(join(dir, "lib/resource", name), "utf8");
      expect(source, name).not.toContain("@flaredev/core/server");
    }
  });
});
