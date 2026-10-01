import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { genApiKeys } from "../src/commands/gen-apikeys.js";
import { genSecurity } from "../src/commands/gen-security.js";
import { compareTracked, mergeGeneratedBlock, updateTracked } from "../src/commands/eject.js";
import { templatesDir } from "../src/utils/fs.js";

/**
 * `flare update` and the blocks a generator owns.
 *
 * `update` discards *your* edits to Flare's code, which is its job. Generator output is
 * not an edit: `lib/dashboard-nav.ts` holds the sidebar links `flare gen security` and
 * `flare gen apikeys` write into a slot the template provides. Taking the template
 * wholesale removed them, so an app that updated silently lost both links.
 */
const scratch = mkdtempSync(join(import.meta.dirname, ".tmp-eject-gen-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const quiet = { log: () => {}, skipMigration: true, skipInstall: true };
const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");

function app() {
  const root = join(scratch, `app-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, "lib"), { recursive: true });
  mkdirSync(join(root, "db"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "shop", dependencies: { vinext: "1" }, flare: { stack: "cloudflare" } }, null, 2));
  for (const file of ["lib/dashboard-nav.ts", "lib/api-keys.ts", "lib/auth.ts"]) copyFileSync(join(templatesDir, "app", file), join(root, file));
  writeFileSync(join(root, "db/auth-schema.ts"), 'import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";\n');
  return root;
}

describe("mergeGeneratedBlock", () => {
  const file = (block: string, tail = "const after = 1;\n") =>
    `const before = 1;\n// generated:start hash=aaaaaaaaaaaa\n${block}\n// generated:end\n${tail}`;

  it("keeps our block and takes their code around it", () => {
    const merged = mergeGeneratedBlock(file("export const links = [1];"), file("export const links = [];", "const after = 2;\n"));
    expect(merged).toContain("export const links = [1];");
    expect(merged).toContain("const after = 2;");
  });

  it("leaves a file alone when neither side has a block", () => {
    expect(mergeGeneratedBlock("a\n", "b\n")).toBeUndefined();
  });

  it("leaves a file alone when only one side has one", () => {
    // A template that gained or lost its markers is a real change, not a block to keep.
    expect(mergeGeneratedBlock(file("x"), "plain\n")).toBeUndefined();
    expect(mergeGeneratedBlock("plain\n", file("x"))).toBeUndefined();
  });

  it("overwrites rather than guessing when the markers are malformed", () => {
    const broken = "// generated:start\n// generated:start\nx\n// generated:end\n";
    expect(mergeGeneratedBlock(broken, file("x"))).toBeUndefined();
  });

  it("carries our hash, since that is what says whether the block was hand-edited", () => {
    const merged = mergeGeneratedBlock(file("ours"), file("theirs").replace("hash=aaaaaaaaaaaa", "hash=bbbbbbbbbbbb"));
    expect(merged).toContain("hash=aaaaaaaaaaaa");
  });
});

describe("after a generator has run", () => {
  it("keeps the sidebar links an update used to delete", async () => {
    const root = app();
    await genSecurity({ cwd: root, ...quiet });
    await genApiKeys({ cwd: root, ...quiet });
    expect(read(root, "lib/dashboard-nav.ts")).toContain('href: "/dashboard/security"');

    updateTracked({ cwd: root, yes: true, log: () => {}, filter: "dashboard-nav" });

    const nav = read(root, "lib/dashboard-nav.ts");
    expect(nav).toContain('href: "/dashboard/security"');
    expect(nav).toContain('href: "/dashboard/api-keys"');
  });

  it("does not report the file as differing when only its block does", async () => {
    const root = app();
    await genApiKeys({ cwd: root, ...quiet });
    const nav = compareTracked(root, "cloudflare", "dashboard-nav").find((entry) => entry.path.endsWith("dashboard-nav.ts"));
    // `flare diff` saying a file differs, when `flare update` would change nothing in it
    // that the app did not put there, is noise that trains people to ignore the output.
    expect(nav?.state).toBe("same");
  });

  it("still overwrites an ordinary edit to Flare's code", async () => {
    const root = app();
    const target = join(root, "lib/api-keys.ts");
    writeFileSync(target, "// my own version\n");
    updateTracked({ cwd: root, yes: true, log: () => {}, filter: "api-keys" });
    expect(read(root, "lib/api-keys.ts")).not.toContain("// my own version");
    expect(read(root, "lib/api-keys.ts")).toContain("userFromApiKey");
  });

  it("still reports a real change to the code around a block", async () => {
    const root = app();
    await genApiKeys({ cwd: root, ...quiet });
    const nav = join(root, "lib/dashboard-nav.ts");
    // An edit outside the markers is an edit to Flare's code, and update takes it back.
    writeFileSync(nav, `${read(root, "lib/dashboard-nav.ts")}\n// something of mine outside the block\n`);
    const before = compareTracked(root, "cloudflare", "dashboard-nav").find((entry) => entry.path.endsWith("dashboard-nav.ts"));
    expect(before?.state).toBe("changed");

    updateTracked({ cwd: root, yes: true, log: () => {}, filter: "dashboard-nav" });
    const after = read(root, "lib/dashboard-nav.ts");
    expect(after).not.toContain("something of mine outside the block");
    // And the generator's links survived it.
    expect(after).toContain('href: "/dashboard/api-keys"');
  });
});
