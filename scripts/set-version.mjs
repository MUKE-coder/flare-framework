// Set the version everywhere it is written down.
//
// There are five copies: three package.json files, the FLARE_VERSION constant the
// framework reports at runtime, and the agent skill's metadata. Four of them were kept
// in step by hand and by a test; the skill was not, and sat at 0.7.3 while the packages
// were 0.8.1 — telling every agent that read it the framework was two releases older
// than it is.
//
// Usage: node scripts/set-version.mjs 0.8.2
//        node scripts/set-version.mjs          # just report what each file says
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const wanted = process.argv[2];

if (wanted !== undefined && !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(wanted)) {
  console.error(`Not a version: "${wanted}". Expected something like 0.8.2.`);
  process.exit(1);
}

/** Each place a version is written, as a pattern with the version in group 1. */
const places = [
  { file: "packages/core/package.json", pattern: /("version":\s*")([^"]+)(")/ },
  { file: "packages/cli/package.json", pattern: /("version":\s*")([^"]+)(")/ },
  { file: "packages/create-flare-framework/package.json", pattern: /("version":\s*")([^"]+)(")/ },
  { file: "packages/core/src/index.ts", pattern: /(export const FLARE_VERSION = ")([^"]+)(")/ },
  { file: "skills/flare/SKILL.md", pattern: /(\n\s*version:\s*")([^"]+)(")/ },
];

let changed = 0;
const found = new Set();

for (const { file, pattern } of places) {
  const path = new URL(file, new URL("..", import.meta.url));
  const text = readFileSync(path, "utf8");
  const match = pattern.exec(text);
  if (!match) {
    console.error(`${file}: no version found — the pattern in this script needs updating.`);
    process.exit(1);
  }
  const current = match[2];
  found.add(current);

  if (wanted === undefined) {
    console.log(`${current.padEnd(12)} ${file}`);
    continue;
  }
  if (current === wanted) {
    console.log(`  = ${file}`);
    continue;
  }
  writeFileSync(path, text.replace(pattern, `$1${wanted}$3`));
  console.log(`  ${current} -> ${wanted}  ${file}`);
  changed += 1;
}

if (wanted === undefined) {
  if (found.size > 1) {
    console.error(`\nThese disagree: ${[...found].join(", ")}. Run this with the version you want.`);
    process.exit(1);
  }
  console.log(`\nAll five agree on ${[...found][0]}.`);
} else {
  console.log(`\n${changed === 0 ? "Already" : `Updated ${changed} file(s) —`} ${wanted}.`);
  console.log("Changelog and docs are not touched; they are prose, not metadata.");
}
