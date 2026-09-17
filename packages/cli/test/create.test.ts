import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp, toAppName } from "../src/commands/create.js";

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
    expect(readFileSync(join(dir, "app/globals.css"), "utf8")).toContain('@import "tailwindcss"');
    expect(readFileSync(join(dir, "app/page.tsx"), "utf8")).not.toMatch(/__[A-Z_]+__/);
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
