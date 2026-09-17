import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { splitMarkers, writeGenerated } from "../src/generator/markers.js";

const dirs: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "flare-markers-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("writeGenerated", () => {
  it("creates new files with a header and a block", () => {
    const path = join(temp(), "a/b.ts");
    expect(writeGenerated(path, "export const a = 1;\n", { header: "// header\n" })).toBe("create");
    expect(readFileSync(path, "utf8")).toBe("// header\n// generated:start\nexport const a = 1;\n// generated:end\n");
  });

  it("rewrites only the block, preserving code before and after it", () => {
    const path = join(temp(), "b.ts");
    writeFileSync(path, 'import x from "x";\n// generated:start\nold();\n// generated:end\n\nexport function mine() {}\n');
    expect(writeGenerated(path, "fresh();\n")).toBe("update");
    expect(readFileSync(path, "utf8")).toBe('import x from "x";\n// generated:start\nfresh();\n// generated:end\n\nexport function mine() {}\n');
    expect(writeGenerated(path, "fresh();\n")).toBe("identical");
  });

  it("keeps the indentation of nested blocks", () => {
    const path = join(temp(), "c.ts");
    writeFileSync(path, "x({\n  fields: {\n    // generated:start\n    a: 1,\n    // generated:end\n  },\n});\n");
    writeGenerated(path, "a: 2,\nb: 3,\n");
    expect(readFileSync(path, "utf8")).toBe("x({\n  fields: {\n    // generated:start\n    a: 2,\n    b: 3,\n    // generated:end\n  },\n});\n");
  });

  it("refuses files without markers or with broken markers", () => {
    const dir = temp();
    writeFileSync(join(dir, "plain.ts"), "hand written\n");
    expect(() => writeGenerated(join(dir, "plain.ts"), "x")).toThrow(/refusing to overwrite/);
    expect(() => splitMarkers("// generated:end\n// generated:start\n")).toThrow(/exactly one/);
    expect(() => splitMarkers("// generated:start\n// generated:end\n// generated:start\n// generated:end\n")).toThrow(/exactly one/);
  });
});
