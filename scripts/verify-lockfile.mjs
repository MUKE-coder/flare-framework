/**
 * Check the pnpm lockfile shipped in the template the way a new app will check it.
 *
 *   node scripts/verify-lockfile.mjs
 *
 * This exists because 0.9.0 shipped a lockfile that pnpm 12 refuses. Nothing in the repo
 * could have caught it: `packageManager` pins pnpm 11, which has no supply-chain policy,
 * and CI scaffolds into examples/ where the workspace links @flaredev/* and no lockfile is
 * copied at all. So this reproduces what `flare create` actually hands somebody.
 *
 * Three details, each of which made an earlier version of this check pass on a lockfile a
 * user could not install:
 *
 * 1. pnpm 12, not the repo's pinned 11. Corepack intercepts `pnpm` inside the repo, so the
 *    check has to run from a directory outside it.
 * 2. A directory that did not just write the lockfile. Verified where pnpm generated it,
 *    an unusable file passes.
 * 3. A cold store. pnpm does not apply the age policy to a package already in the local
 *    store, so on the machine that just resolved everything the check passes and a user's
 *    first install fails. Nothing is downloaded either way — only metadata is read.
 *
 * Exits non-zero with pnpm's own message, which names the offending entries and the cutoff.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const lockfile = join(root, "packages/cli/templates/locks/pnpm-lock.yaml");
if (!existsSync(lockfile)) {
  console.error(`No lockfile at ${lockfile}. Run \`node scripts/build-lockfiles.mjs\` first.`);
  process.exit(1);
}

const dir = mkdtempSync(join(tmpdir(), "flare-verify-lock-"));
const app = join(dir, "app");
const store = join(dir, "cold-store");

try {
  // Scaffolded by the real CLI, so the manifest is exactly what the lockfile was built for.
  execFileSync(process.execPath, [join(root, "packages/cli/dist/index.js"), "create", app, "--skip-install", "--yes"], {
    cwd: root,
    stdio: "ignore",
  });

  // Flare's own two packages are not in the lockfile — the version being released is not on
  // the registry yet — so they come out of the manifest here too.
  const manifestPath = join(app, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  delete manifest.dependencies["@flaredev/core"];
  delete manifest.devDependencies["@flaredev/cli"];
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  cpSync(lockfile, join(app, "pnpm-lock.yaml"));

  // pnpm 12 by name, through npx. Bare `pnpm` is whatever is on PATH — 11.9.0 in CI, from
  // action-setup — and 11 has no policy to fail, so the check would pass on anything. npx
  // resolves it here rather than corepack, because cwd is outside the repo and so the
  // pinned 11 in packageManager does not apply.
  const pnpm = process.env.FLARE_VERIFY_PNPM ?? "pnpm@12";
  console.log(`Verifying templates/locks/pnpm-lock.yaml with ${pnpm} and a cold store…\n`);
  execFileSync(
    "npx",
    ["--yes", pnpm, "install", "--lockfile-only", "--frozen-lockfile", "--store-dir", store],
    { cwd: app, stdio: "inherit", shell: process.platform === "win32" },
  );
  console.log("\n✔ The shipped lockfile installs.");
} catch {
  console.error(
    [
      "",
      "✖ The shipped pnpm-lock.yaml is rejected by pnpm's own supply-chain policies.",
      "  A new app would fail its first install. pnpm's message above names the entries and the cutoff.",
      "",
      "  If they are versions Flare pins in versions.ts, the release has to wait until they are a day old:",
      "  resolution cannot choose anything else for an exact pin. If they are transitive, regenerate with",
      "  `node scripts/build-lockfiles.mjs` once they have aged out.",
      "",
      "  Do not reach for --config.minimum-release-age=0. That is what shipped the broken 0.9.0.",
    ].join("\n"),
  );
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
