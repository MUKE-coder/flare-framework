import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The codegen overwrite contract: the generator only ever rewrites the text
 * between `// generated:start` and `// generated:end`. Anything outside the block
 * is the developer's and survives regeneration.
 */

export const START = "// generated:start";
export const END = "// generated:end";

export interface MarkedFile {
  before: string;
  block: string;
  after: string;
  /** Indentation of the start marker line, re-applied to the block on rewrite. */
  indent: string;
}

/** Split a file around its generated block, or return null when it has none. */
export function splitMarkers(source: string): MarkedFile | null {
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start === -1 && end === -1) return null;
  if (start === -1 || end === -1 || end < start || source.indexOf(START, start + 1) !== -1 || source.indexOf(END, end + 1) !== -1) {
    throw new Error("Expected exactly one // generated:start … // generated:end block.");
  }
  const lineStart = source.lastIndexOf("\n", start) + 1;
  const indent = source.slice(lineStart, start);
  const startLineEnd = source.indexOf("\n", start);
  const endLineStart = source.lastIndexOf("\n", end) + 1;
  const endLineEnd = source.indexOf("\n", end);
  return {
    before: source.slice(0, lineStart),
    block: source.slice(startLineEnd + 1, endLineStart),
    after: endLineEnd === -1 ? "" : source.slice(endLineEnd + 1),
    indent,
  };
}

function indentBlock(content: string, indent: string): string {
  return content
    .split("\n")
    .map((line) => (line && indent ? indent + line : line))
    .join("\n");
}

export function joinMarkers({ before, block, after, indent }: MarkedFile): string {
  const body = block.endsWith("\n") || block === "" ? block : `${block}\n`;
  return `${before}${indent}${START}\n${body}${indent}${END}\n${after}`;
}

export type WriteOutcome = "create" | "update" | "identical";

/**
 * Write `content` as the generated block of `path`. New files get `header` above the
 * block. Existing files keep everything outside their block; files without a block
 * are refused, since they were never generated.
 */
export function writeGenerated(path: string, content: string, options: { header?: string } = {}): WriteOutcome {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, joinMarkers({ before: options.header ?? "", block: content, after: "", indent: "" }));
    return "create";
  }
  const source = readFileSync(path, "utf8");
  const parts = splitMarkers(source);
  if (!parts) throw new Error(`${path} exists but has no generated block; refusing to overwrite hand-written code.`);
  const next = joinMarkers({ ...parts, block: indentBlock(content, parts.indent) });
  if (next === source) return "identical";
  writeFileSync(path, next);
  return "update";
}
