/**
 * Build the lockfiles shipped with the template, so `flare create` installs without
 * resolving 340 packages first. Measured on Windows with a warm npm cache: 6m23
 * without a lockfile, 2m56 with one.
 *
 *   pnpm build && node scripts/build-lockfiles.mjs
 *
 * Only resolution runs (`--package-lock-only`, `--lockfile-only`), so nothing is
 * downloaded. Run it whenever versions.ts or the packages' versions change, before
 * publishing — RELEASING.md has it in the release steps.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const locksDir = join(root, "packages/cli/templates/locks");
const { FLARE_VERSION } = await import(new URL("../packages/core/dist/index.js", import.meta.url).href);

// npm and pnpm are .cmd shims on Windows and need a shell; node doesn't, and a shell
// would break the paths with spaces we pass it.
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" && command !== process.execPath });

const dir = mkdtempSync(join(tmpdir(), "flare-locks-"));
const app = join(dir, "flare-app");
try {
  // Scaffold with the real CLI, so the dependencies are exactly what `flare create` writes.
  execFileSync(process.execPath, [join(root, "packages/cli/dist/index.js"), "create", app, "--skip-install", "--yes"], { cwd: root, stdio: "ignore" });

  // Flare's own packages are left out on purpose: the version being released isn't on
  // the registry yet, so pinning it here would fail. Everything else is pinned — that's
  // the 340 packages that make an install slow — and npm resolves these two itself.
  const manifestPath = join(app, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  delete manifest.dependencies["@flaredev/core"];
  delete manifest.devDependencies["@flaredev/cli"];
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  mkdirSync(locksDir, { recursive: true });

  console.log(`\nResolving dependencies for Flare ${FLARE_VERSION}…`);
  run("npm", ["install", "--package-lock-only", "--no-audit", "--no-fund", "--loglevel=error"], app);
  cpSync(join(app, "package-lock.json"), join(locksDir, "package-lock.json"));
  console.log("✔ templates/locks/package-lock.json");

  // pnpm resolves differently from npm, so it needs its own file.
  //
  // The policy stays ON here, which it did not in 0.9.0. It was switched off with
  // `--config.minimum-release-age=0` to stop pnpm "locking older versions than we ask
  // for", and what that also did was let every pick be hours old. 0.9.0 shipped a lockfile
  // pinning vite@8.3.2 and @vinext/types@1.0.1, both published that morning; pnpm 12
  // enforces a 24-hour minimum release age on install, so every new app failed its first
  // command with ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION until those versions aged out.
  //
  // This repo pins pnpm 11, which has no such policy, so nothing here could have caught it.
  run("pnpm", ["install", "--lockfile-only"], app);
  cpSync(join(app, "pnpm-lock.yaml"), join(locksDir, "pnpm-lock.yaml"));
  console.log("✔ templates/locks/pnpm-lock.yaml");

  // The check that would have caught 0.9.0, in its own script because getting it right
  // took three attempts: it needs pnpm 12 (the repo pins 11, which has no such policy), a
  // directory that did not just write the lockfile, and a cold store. Each of those,
  // missing, makes the check pass on a file a user cannot install.
  console.log();
  run(process.execPath, [join(root, 'scripts/verify-lockfile.mjs')], root);

  // Yarn 1 has no lockfile-only mode, so this one really installs — a few minutes, once
  // per release. Without it a yarn user waits eight minutes for their first app while
  // yarn resolves all 340 packages itself; with it, about as long as npm.
  console.log("\nResolving with yarn (this one actually installs)…");
  run("yarn", ["install", "--ignore-scripts", "--non-interactive"], app);
  cpSync(join(app, "yarn.lock"), join(locksDir, "yarn.lock"));
  console.log("✔ templates/locks/yarn.lock");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
