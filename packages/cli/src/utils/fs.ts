import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Files that npm strips or rewrites on publish are stored with a leading underscore. */
const RENAMES: Record<string, string> = { _gitignore: ".gitignore" };

/**
 * Recursively copy `from` into `to`, replacing each `__TOKEN__` in file contents
 * with `tokens.TOKEN`.
 */
/** Copy a template directory, filling in `__TOKEN__` placeholders. Returns the number of files written. */
export function copyTemplate(from: string, to: string, tokens: Record<string, string>): number {
  mkdirSync(to, { recursive: true });
  let files = 0;
  for (const entry of readdirSync(from)) {
    const src = join(from, entry);
    const dest = join(to, RENAMES[entry] ?? entry);
    if (statSync(src).isDirectory()) {
      files += copyTemplate(src, dest, tokens);
      continue;
    }
    const content = readFileSync(src, "utf8").replace(/__([A-Z_]+)__/g, (match, key: string) => tokens[key] ?? match);
    writeFileSync(dest, content);
    files++;
  }
  return files;
}

export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

/** Walk up from `start` looking for `file`; returns the directory containing it. */
export function findUp(file: string, start: string): string | undefined {
  let dir = resolve(start);
  while (true) {
    if (existsSync(join(dir, file))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Absolute path to the CLI package's `templates/` directory (resolves from both `src/` and `dist/`). */
export const templatesDir = join(findUp("templates", dirname(fileURLToPath(import.meta.url)))!, "templates");
