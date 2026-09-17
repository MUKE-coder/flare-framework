import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The codegen overwrite contract: the generator only ever rewrites the text between
 * `// generated:start` and `// generated:end`. Anything outside the block belongs to
 * the developer and survives regeneration.
 *
 * Tracked blocks record a checksum of what was generated
 * (`// generated:start hash=1a2b3c4d5e6f`). If the block's content no longer matches,
 * it was edited by hand: that's drift, and regeneration refuses to overwrite it
 * unless forced.
 */

export const START = "// generated:start";
export const END = "// generated:end";

export interface MarkedFile {
  before: string;
  /** Block content with the marker indentation removed. */
  block: string;
  after: string;
  /** Indentation of the start marker line, re-applied to the block on write. */
  indent: string;
  /** Checksum recorded in the start marker, if the block is tracked. */
  hash?: string;
}

const normalize = (content: string) => content.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");

export function hashBlock(content: string): string {
  return createHash("sha256").update(normalize(content)).digest("hex").slice(0, 12);
}

function dedent(content: string, indent: string): string {
  if (!indent) return content;
  return content
    .split("\n")
    .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
    .join("\n");
}

function indentBlock(content: string, indent: string): string {
  if (!indent) return content;
  return content
    .split("\n")
    .map((line) => (line ? indent + line : line))
    .join("\n");
}

/** Split a file around its generated block, or return null when it has none. */
export function splitMarkers(source: string): MarkedFile | null {
  const text = source.replace(/\r\n/g, "\n");
  const startCount = text.split(START).length - 1;
  const endCount = text.split(END).length - 1;
  if (startCount === 0 && endCount === 0) return null;
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (startCount !== 1 || endCount !== 1 || end < start) {
    throw new Error("Expected exactly one // generated:start … // generated:end block.");
  }
  const lineStart = text.lastIndexOf("\n", start) + 1;
  const indent = text.slice(lineStart, start);
  const startLineEnd = text.indexOf("\n", start);
  const startLine = text.slice(start, startLineEnd === -1 ? undefined : startLineEnd);
  const hash = /hash=([0-9a-f]{12})/.exec(startLine)?.[1];
  const endLineStart = text.lastIndexOf("\n", end) + 1;
  const endLineEnd = text.indexOf("\n", end);
  return {
    before: text.slice(0, lineStart),
    block: dedent(text.slice(startLineEnd + 1, endLineStart), indent),
    after: endLineEnd === -1 ? "" : text.slice(endLineEnd + 1),
    indent,
    hash,
  };
}

export function joinMarkers({ before, block, after, indent, hash }: MarkedFile): string {
  const body = block === "" || block.endsWith("\n") ? block : `${block}\n`;
  const startMarker = hash ? `${START} hash=${hash}` : START;
  return `${before}${indent}${startMarker}\n${indentBlock(body, indent)}${indent}${END}\n${after}`;
}

export type FileStatus =
  /** File doesn't exist yet. */
  | "missing"
  /** File exists without a generated block (hand-written). */
  | "unmarked"
  /** The tracked block was edited by hand since it was generated. */
  | "drift"
  /** Block differs from what would be generated now (e.g. the descriptor changed). */
  | "outdated"
  /** Content is current, but the block has no checksum yet (generated before tracking). */
  | "untracked"
  | "identical";

export function inspectGenerated(path: string, content: string): FileStatus {
  if (!existsSync(path)) return "missing";
  const parts = splitMarkers(readFileSync(path, "utf8"));
  if (!parts) return "unmarked";
  if (parts.hash && hashBlock(parts.block) !== parts.hash) return "drift";
  if (normalize(parts.block) !== normalize(content)) return "outdated";
  return parts.hash === hashBlock(content) ? "identical" : "untracked";
}

export class DriftError extends Error {
  constructor(readonly path: string) {
    super(`${path}: the generated block was edited by hand. Move custom code outside the block, or pass --force to overwrite it.`);
    this.name = "DriftError";
  }
}

export type WriteOutcome = "create" | "update" | "identical";

/**
 * Write `content` as the tracked generated block of `path`. New files get `header`
 * above the block. Existing files keep everything outside their block. Hand-written
 * files (no block) are refused, and so are hand-edited blocks unless `force`.
 */
export function writeGenerated(path: string, content: string, options: { header?: string; force?: boolean } = {}): WriteOutcome {
  const hash = hashBlock(content);
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, joinMarkers({ before: options.header ?? "", block: content, after: "", indent: "", hash }));
    return "create";
  }
  const source = readFileSync(path, "utf8");
  const parts = splitMarkers(source);
  if (!parts) throw new Error(`${path} exists but has no generated block; refusing to overwrite hand-written code.`);
  if (parts.hash && hashBlock(parts.block) !== parts.hash && !options.force) throw new DriftError(path);
  const next = joinMarkers({ ...parts, block: content, hash });
  if (next === source) return "identical";
  writeFileSync(path, next);
  return "update";
}
