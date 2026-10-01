import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { templatesDir } from "../src/utils/fs.js";

/**
 * Files the Next.js template overlays on the Cloudflare one.
 *
 * Nineteen of them: the same job done against Prisma instead of Drizzle, Vercel instead of
 * Workers. Two copies of a 300-line module that have to agree is a standing hazard, and it
 * is not theoretical — adding `restoreRecordAction` to `app/dashboard/actions.ts` for soft
 * delete left the Next.js copy without it, and the only thing that noticed was CI
 * typechecking a scaffolded app two minutes later.
 *
 * A file can legitimately differ in what it does. What it *offers* has to match, because
 * the components and routes importing it are the same files on both stacks.
 */
const app = join(templatesDir, "app");
const next = join(templatesDir, "next");

/** Every .ts/.tsx the Next.js template overlays. */
function overlaid(dir = next): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...overlaid(full));
    else if (/\.tsx?$/.test(entry.name)) {
      const rel = relative(next, full).replaceAll("\\", "/");
      if (existsSync(join(app, rel)) && statSync(join(app, rel)).isFile()) out.push(rel);
    }
  }
  return out;
}

/**
 * Names a module exports, by reading the source.
 *
 * Regex rather than a parser: these are the template's own files, written in one style, and
 * a test that needs a TypeScript program to say whether two files export the same names
 * would be harder to trust than the thing it checks.
 */
function exports(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/gm)) names.add(match[1]!);
  for (const match of source.matchAll(/^export\s+(?:interface|type)\s+(\w+)/gm)) names.add(`type ${match[1]}`);
  // `export { a, b as c }` and `export type { X } from "…"` — the exported name is what
  // matters, so the alias wins. `type` on the clause marks every name in it as a type,
  // which is how `export interface X` above is recorded.
  for (const match of source.matchAll(/^export\s+(type\s+)?\{([^}]*)\}/gm)) {
    const clauseIsType = match[1] !== undefined;
    for (const part of match[2]!.split(",")) {
      const raw = part.trim();
      if (!raw) continue;
      const name = raw.split(/\s+as\s+/).pop()!.trim();
      const isType = clauseIsType || /^type\s/.test(raw);
      names.add(isType ? `type ${name.replace(/^type\s+/, "")}` : name);
    }
  }
  if (/^export default/m.test(source)) names.add("default");
  return [...names].sort();
}

describe("the Next.js overlay", () => {
  const files = overlaid();

  it("overlays the files it is expected to", () => {
    // A sanity check on the walk itself: if this drops to nothing, every test below passes
    // for the wrong reason.
    expect(files.length).toBeGreaterThan(10);
    expect(files).toContain("app/dashboard/actions.ts");
    expect(files).toContain("lib/dashboard.ts");
  });

  for (const file of files) {
    it(`${file} offers the same names on both stacks`, () => {
      const mine = exports(readFileSync(join(app, file), "utf8"));
      const theirs = exports(readFileSync(join(next, file), "utf8"));
      // Reported as two sorted lists, so a failure names what is missing where.
      expect(theirs, `${file} differs between templates/app and templates/next`).toEqual(mine);
    });
  }
});
