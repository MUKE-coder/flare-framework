import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, flarePackageSpec, toAppName } from "../src/commands/create.js";

const dirs: string[] = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "flare-create-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("toAppName", () => {
  it("normalizes directory names", () => {
    expect(toAppName("/tmp/My App_2")).toBe("my-app-2");
  });

  it("rejects names with no usable characters", () => {
    expect(() => toAppName("/tmp/___")).toThrow(/Cannot derive/);
  });
});

describe("flarePackageSpec", () => {
  it("uses workspace:* for apps inside the Flare repo", () => {
    const repoExample = fileURLToPath(new URL("../../../examples/some-app", import.meta.url));
    expect(flarePackageSpec("core", repoExample, "pnpm")).toBe("workspace:*");
    expect(flarePackageSpec("cli", repoExample, "pnpm")).toBe("workspace:*");
  });

  it("links to the local packages for apps outside the repo", () => {
    expect(flarePackageSpec("core", join(tmpdir(), "elsewhere"), "pnpm")).toMatch(/^link:.*\/packages\/core$/);
    expect(flarePackageSpec("cli", join(tmpdir(), "elsewhere"), "npm")).toMatch(/^file:.*\/packages\/cli$/);
  });
});

describe("createApp", () => {
  it("scaffolds a vinext + TypeScript + Tailwind app", () => {
    const dir = join(tempDir(), "shop");
    const result = createApp(dir, { install: false, pm: "pnpm", compatibilityDate: "2026-09-17" });

    expect(result.name).toBe("shop");
    for (const file of [
      ".gitignore",
      "package.json",
      "tsconfig.json",
      "vite.config.ts",
      "wrangler.jsonc",
      "postcss.config.mjs",
      "app/layout.tsx",
      "app/page.tsx",
      "app/globals.css",
      "pnpm-workspace.yaml",
      "drizzle.config.ts",
      "db/schema.ts",
      "db/index.ts",
      "db/auth-schema.ts",
      "lib/auth.ts",
      "lib/auth-client.ts",
      "lib/session.ts",
      "app/api/auth/[...all]/route.ts",
      "lib/storage.ts",
      "lib/mail.ts",
      "app/api/storage/route.ts",
      "lib/api.ts",
      "lib/admin.ts",
      "lib/utils.ts",
      "components.json",
      "components/ui/table.tsx",
      "components/admin/resource-table.tsx",
      "components/admin/resource-form.tsx",
      "components/admin/fields/field-widget.tsx",
      "app/admin/layout.tsx",
      "app/admin/actions.ts",
      "resources/index.ts",
      "resources/server.ts",
      "proxy.ts",
      "app/sign-in/page.tsx",
      "app/sign-up/page.tsx",
      "app/dashboard/page.tsx",
      ".dev.vars",
      ".dev.vars.example",
      "migrations/0000_auth.sql",
      "migrations/meta/_journal.json",
    ]) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }

    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    expect(pkg.name).toBe("shop");
    expect(pkg.dependencies.vinext).toBeDefined();
    expect(pkg.devDependencies.tailwindcss).toBeDefined();
    expect(pkg.devDependencies.typescript).toBeDefined();

    const wrangler = readFileSync(join(dir, "wrangler.jsonc"), "utf8");
    expect(wrangler).toContain('"name": "shop"');
    expect(wrangler).toContain('"compatibility_date": "2026-09-17"');
    expect(wrangler).toContain('"binding": "DB"');
    expect(wrangler).toContain('"database_name": "shop-db"');
    expect(wrangler).toContain('"binding": "STORAGE"');
    expect(wrangler).toContain('"bucket_name": "shop-storage"');
    expect(pkg.scripts).toMatchObject({ dev: "flare dev", build: "flare build", start: "flare start", deploy: "flare deploy" });
    expect(pkg.devDependencies["@flare/cli"]).toBeDefined();
    expect(pkg.dependencies["drizzle-orm"]).toBeDefined();
    expect(pkg.devDependencies["drizzle-kit"]).toBeDefined();
    expect(readFileSync(join(dir, "drizzle.config.ts"), "utf8")).toContain('out: "./migrations"');
    expect(readFileSync(join(dir, "db/schema.ts"), "utf8")).toMatch(/\/\/ generated:start\n\/\/ generated:end/);
    expect(readFileSync(join(dir, "app/globals.css"), "utf8")).toContain('@import "tailwindcss"');
    expect(readFileSync(join(dir, "app/page.tsx"), "utf8")).not.toMatch(/__[A-Z_]+__/);

    expect(pkg.dependencies["better-auth"]).toBeDefined();
    expect(pkg.dependencies["@better-auth/drizzle-adapter"]).toBeDefined();
    const devVars = readFileSync(join(dir, ".dev.vars"), "utf8");
    expect(devVars).toMatch(/^BETTER_AUTH_SECRET=[A-Za-z0-9+/]{43}=\nRESEND_API_KEY=\nMAIL_FROM=\n$/);
    const auth = readFileSync(join(dir, "lib/auth.ts"), "utf8");
    expect(auth).toContain('"shop.*.workers.dev"');
    expect(auth).toContain("hash: hashPassword");
  });

  it("generates a different auth secret per app", () => {
    const root = tempDir();
    createApp(join(root, "a"), { install: false, pm: "pnpm" });
    createApp(join(root, "b"), { install: false, pm: "pnpm" });
    expect(readFileSync(join(root, "a/.dev.vars"), "utf8")).not.toBe(readFileSync(join(root, "b/.dev.vars"), "utf8"));
  });

  it("does not write pnpm-workspace.yaml inside an existing workspace", () => {
    const root = tempDir();
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - examples/*\n");
    const dir = join(root, "examples", "demo");
    const result = createApp(dir, { install: false, pm: "pnpm" });

    expect(result.inWorkspace).toBe(true);
    expect(existsSync(join(dir, "pnpm-workspace.yaml"))).toBe(false);
  });

  it("refuses a non-empty directory", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "keep.txt"), "x");
    expect(() => createApp(dir, { install: false })).toThrow(/not empty/);
  });

  it("rejects unknown package managers", () => {
    expect(() => createApp(join(tempDir(), "x"), { install: false, pm: "pip" })).toThrow(/Unknown package manager/);
  });
});
