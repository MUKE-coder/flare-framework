/**
 * Copy the app template over an existing scaffolded app, so template changes can be
 * tried without a fresh install. Keeps the app's own files: its resources, schema,
 * migrations, config and secrets.
 *
 *   node scripts/refresh-app.mjs <appDir>
 */
import { cpSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const template = resolve(fileURLToPath(new URL("../packages/cli/templates/app", import.meta.url)));
const app = resolve(process.argv[2] ?? "");
if (!app || !existsSync(join(app, "package.json"))) throw new Error(`Not an app: ${app}`);

/** The app's own, never the template's. */
const KEEP = new Set(["package.json", "wrangler.jsonc", ".dev.vars", ".dev.vars.example", "pnpm-workspace.yaml", "worker-configuration.d.ts"]);
const KEEP_DIRS = new Set(["node_modules", ".wrangler", "migrations", "resources", "policies", ".vite"]);
const KEEP_FILES = new Set([join("lib", "site.ts"), join("lib", "auth-config.ts"), join("db", "schema.ts"), join("db", "relations.ts")]);

let copied = 0;
function walk(relative = "") {
  for (const entry of readdirSync(join(template, relative))) {
    const rel = join(relative, entry);
    if (KEEP.has(entry) || KEEP_DIRS.has(entry) || KEEP_FILES.has(rel)) continue;
    const source = join(template, rel);
    if (statSync(source).isDirectory()) {
      if (rel === "db" || rel === "lib" || !existsSync(join(app, rel))) {
        // Fresh directories come over whole; db/ and lib/ are merged file by file.
      }
      walk(rel);
      continue;
    }
    cpSync(source, join(app, rel.replace(/^_gitignore$/, ".gitignore")), { recursive: true });
    copied++;
  }
}

// The dashboard replaced the admin area; leave nothing of it behind.
for (const stale of ["app/admin/layout.tsx", "app/admin/actions.ts", "components/admin", "lib/admin.ts", "lib/admin-nav.ts", "components/dashboard/dashboard-nav.tsx"]) {
  rmSync(join(app, stale), { recursive: true, force: true });
}
walk();
console.log(`Refreshed ${copied} files in ${app}`);
