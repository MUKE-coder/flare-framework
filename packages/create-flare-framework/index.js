#!/usr/bin/env node
// `npm create flare-framework@latest my-app` (or pnpm/yarn/bun create): runs
// `flare create` from @flaredev/cli with the same arguments. The package manager
// that ran this is detected by the CLI and used for the new app.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("@flaredev/cli/package.json")), "bin", "flare.js");

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith("-")) {
  if (args.includes("--help") || args.includes("-h")) {
    spawnSync(process.execPath, [cli, "create", "--help"], { stdio: "inherit" });
    process.exit(0);
  }
  // No directory given: use a sensible default rather than failing.
  args.unshift("my-flare-app");
}

const result = spawnSync(process.execPath, [cli, "create", ...args], { stdio: "inherit" });
process.exit(result.status ?? 1);
