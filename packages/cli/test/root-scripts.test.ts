import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The repo's own scripts.
 *
 * Here rather than at the root because vitest collects `packages/*​/test/**`. The bug
 * this pins was invisible on Windows and broke every build elsewhere: PowerShell leaves
 * `./packages/**` alone, sh expands it into three paths, and pnpm then reads the second
 * one as the name of the script to run. The first CI run on Linux failed on it.
 */
const scripts = (
  JSON.parse(readFileSync(fileURLToPath(new URL("../../../package.json", import.meta.url)), "utf8")) as {
    scripts: Record<string, string>;
  }
).scripts;

describe("the root package scripts", () => {
  it("quotes every workspace filter glob", () => {
    for (const [name, command] of Object.entries(scripts)) {
      for (const match of command.matchAll(/--filter\s+(\S+)/g)) {
        const value = match[1]!;
        if (!/[*?]/.test(value)) continue;
        expect(value, `${name} passes an unquoted glob to --filter; sh expands it`).toMatch(/^["'].*["']$/);
      }
    }
  });

  it("still filters to the published packages", () => {
    // Quoting it wrongly would be as bad as not quoting it: a filter that matches
    // nothing makes `pnpm build` a silent no-op and `pnpm release` publish nothing.
    expect(scripts.build).toContain("./packages/**");
    expect(scripts.typecheck).toContain("./packages/**");
  });
});
