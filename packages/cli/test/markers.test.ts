import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DriftError, hashBlock, inspectGenerated, splitMarkers, writeGenerated } from "../src/generator/markers.js";

const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "flare-markers-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const start = (content: string) => `// generated:start hash=${hashBlock(content)}`;

describe("writeGenerated", () => {
  it("creates new files with a header and a tracked block", () => {
    const path = join(temp(), "a/b.ts");
    expect(writeGenerated(path, "export const a = 1;\n", { header: "// header\n" })).toBe("create");
    expect(readFileSync(path, "utf8")).toBe(`// header\n${start("export const a = 1;\n")}\nexport const a = 1;\n// generated:end\n`);
  });

  it("rewrites only the block, preserving hand-written code before and after it", () => {
    const path = join(temp(), "b.ts");
    writeFileSync(path, 'import x from "x";\n// generated:start\nold();\n// generated:end\n\nexport function mine() {}\n');
    expect(writeGenerated(path, "fresh();\n")).toBe("update");
    expect(readFileSync(path, "utf8")).toBe(`import x from "x";\n${start("fresh();\n")}\nfresh();\n// generated:end\n\nexport function mine() {}\n`);
    expect(writeGenerated(path, "fresh();\n")).toBe("identical");

    // Hand-written code added later, outside the block, survives the next regeneration too.
    writeFileSync(path, readFileSync(path, "utf8") + "export const extra = mine;\n");
    expect(writeGenerated(path, "fresher();\n")).toBe("update");
    const text = readFileSync(path, "utf8");
    expect(text).toContain("fresher();");
    expect(text).toContain("export function mine() {}\nexport const extra = mine;\n");
    expect(text.startsWith('import x from "x";\n')).toBe(true);
  });

  it("keeps the indentation of nested blocks and hashes the dedented content", () => {
    const path = join(temp(), "c.ts");
    writeFileSync(path, "x({\n  fields: {\n    // generated:start\n    a: 1,\n    // generated:end\n  },\n});\n");
    writeGenerated(path, "a: 2,\nb: 3,\n");
    expect(readFileSync(path, "utf8")).toBe(
      `x({\n  fields: {\n    ${start("a: 2,\nb: 3,\n")}\n    a: 2,\n    b: 3,\n    // generated:end\n  },\n});\n`,
    );
    expect(inspectGenerated(path, "a: 2,\nb: 3,\n")).toBe("identical");
  });

  it("refuses to overwrite a hand-edited block unless forced", () => {
    const path = join(temp(), "d.ts");
    writeGenerated(path, "generated();\n");
    writeFileSync(path, readFileSync(path, "utf8").replace("generated();", "generated(); // tweaked"));

    expect(inspectGenerated(path, "generated();\n")).toBe("drift");
    expect(() => writeGenerated(path, "generated();\n")).toThrow(DriftError);
    expect(readFileSync(path, "utf8")).toContain("// tweaked");

    expect(writeGenerated(path, "generated();\n", { force: true })).toBe("update");
    expect(inspectGenerated(path, "generated();\n")).toBe("identical");
  });

  it("ignores line-ending and trailing-whitespace differences when checking drift", () => {
    const path = join(temp(), "e.ts");
    writeGenerated(path, "a();\nb();\n");
    writeFileSync(path, readFileSync(path, "utf8").replace(/\n/g, "\r\n").replace("a();", "a();   "));
    expect(inspectGenerated(path, "a();\nb();\n")).toBe("identical");
  });

  it("refuses files without markers or with broken markers", () => {
    const dir = temp();
    writeFileSync(join(dir, "plain.ts"), "hand written\n");
    expect(inspectGenerated(join(dir, "plain.ts"), "x")).toBe("unmarked");
    expect(() => writeGenerated(join(dir, "plain.ts"), "x")).toThrow(/refusing to overwrite/);
    expect(() => splitMarkers("// generated:end\n// generated:start\n")).toThrow(/exactly one/);
    expect(() => splitMarkers("// generated:start\n// generated:end\n// generated:start\n// generated:end\n")).toThrow(/exactly one/);
  });

  it("reports missing and outdated files", () => {
    const dir = temp();
    expect(inspectGenerated(join(dir, "nope.ts"), "x")).toBe("missing");
    writeGenerated(join(dir, "f.ts"), "v1();\n");
    expect(inspectGenerated(join(dir, "f.ts"), "v2();\n")).toBe("outdated");
  });

  it("treats a block without a checksum as untracked (or outdated), never drift", () => {
    const path = join(temp(), "g.ts");
    writeFileSync(path, "// generated:start\nanything();\n// generated:end\n");
    expect(inspectGenerated(path, "anything();\n")).toBe("untracked");
    expect(inspectGenerated(path, "other();\n")).toBe("outdated");
  });
});
