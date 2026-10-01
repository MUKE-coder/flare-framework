import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STACKS, type Stack } from "../src/stack.js";

const bin = fileURLToPath(new URL("../bin/flare.js", import.meta.url));

/** `flare --help` as run from `cwd`. */
function help(cwd: string): string {
  return execFileSync(process.execPath, [bin, "--help"], { encoding: "utf8", cwd });
}

/** A directory that looks enough like a Flare app on `stack` for findAppRoot/readStack. */
function appOn(stack: Stack): string {
  const dir = mkdtempSync(join(tmpdir(), `flare-help-${stack}-`));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "help-fixture", dependencies: { "@flaredev/core": "*" }, flare: { stack } }),
  );
  return dir;
}

describe("the generator list", () => {
  it("is the same in the help text and the unknown-generator error", () => {
    // These were two hand-written lists, and they disagreed: the help text offered
    // `endpoint` while the error said it wasn't a generator.
    const listed = /Generators: ([^\n]+)/.exec(help(appOn("cloudflare")))?.[1]?.trim();
    expect(listed).toBeDefined();

    let error = "";
    try {
      execFileSync(process.execPath, [bin, "gen", "nonsense"], { encoding: "utf8", cwd: appOn("cloudflare"), stdio: "pipe" });
    } catch (failure) {
      error = String((failure as { stdout?: string; stderr?: string }).stdout ?? "") + String((failure as { stderr?: string }).stderr ?? "");
    }
    expect(error).toContain("Unknown generator");
    for (const generator of listed!.split(", ")) expect(error, generator).toContain(generator);
  });

  it("offers endpoint, which is a real generator", () => {
    expect(help(appOn("cloudflare"))).toMatch(/Generators:[^\n]*\bendpoint\b/);
  });
});

describe("help text about the database", () => {
  it("tells a Next.js app about Prisma, not D1", () => {
    const text = help(appOn("next"));
    const lines = text.split("\n").filter((line) => /^\s{2}(migrate|seed)\b|^\s{2}migrate:rollback|^\s{2}seed \[/.test(line));
    expect(lines.length).toBeGreaterThan(0);
    // D1 and wrangler don't exist on this stack; naming them sends people looking for
    // a binding they haven't got.
    for (const line of lines) expect(line, line).not.toMatch(/\bD1\b/);
    expect(text).toContain("DATABASE_URL");
  });

  it("still tells a Cloudflare app about D1", () => {
    expect(help(appOn("cloudflare"))).toMatch(/migrate\s+Apply pending D1 migrations/);
  });

  it("says seed:resource is Cloudflare-only where it is", () => {
    // It throws on next with a pointer to seed:make; the description should say so
    // before someone runs it.
    expect(help(appOn("next"))).toMatch(/seed:resource[^\n]*Cloudflare only/);
    expect(help(appOn("cloudflare"))).not.toMatch(/seed:resource[^\n]*Cloudflare only/);
  });

  it("names both stacks when it isn't inside an app", () => {
    const text = help(mkdtempSync(join(tmpdir(), "flare-help-none-")));
    for (const stack of STACKS) expect(text.toLowerCase(), stack).toContain(stack === "next" ? "next.js" : stack);
  });
});

describe("what flare diff covers", () => {
  it("names the directories it actually tracks", () => {
    // Widened from lib/resource to all of lib/ and components/ in 0.7.2; the help text
    // kept saying lib/resource for two releases after.
    const line = help(appOn("cloudflare"))
      .split("\n")
      .find((entry) => /^\s{2}diff\b/.test(entry));
    expect(line).toBeDefined();
    expect(line).toContain("lib/");
    expect(line).toContain("components/");
    expect(line).not.toContain("(lib/resource)");
  });
});
