import { randomBytes } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import * as prompts from "@clack/prompts";
import pc from "picocolors";
import { FLARE_VERSION } from "@flaredev/core";
import { devVarsEntries, devVarsExampleEntries, parseAuthMethods, parseAuthProviders, renderAuthConfig } from "../auth-providers.js";
import { parseTheme } from "../themes.js";
import {
  APP_DEPENDENCIES,
  APP_DEV_DEPENDENCIES,
  CLOUDFLARE_ONLY,
  COMPATIBILITY_DATE,
  NEXT_DEPENDENCIES,
  NEXT_DEV_DEPENDENCIES,
} from "../versions.js";
import { isStack, STACKS, type Stack } from "../stack.js";
import { copyTemplate, findUp, templatesDir, writeJson } from "../utils/fs.js";
import { choosePackageManager, type PackageManager } from "../utils/pm.js";

export interface CreateOptions {
  /** Kept for callers that only want the files; installing is `installDependencies`. */
  install?: boolean;
  pm?: string;
  /** Comma-separated OAuth providers, e.g. "google,github". */
  authProviders?: string;
  /** Comma-separated sign-in methods (magic-link, email-otp, passkeys, 2fa-app, 2fa-email), "all" or "none". */
  auth?: string;
  /** One of the six themes (default when omitted). */
  theme?: string;
  /** Progress lines (default: console.log). */
  log?: (message: string) => void;
  /** Override the Workers compatibility date (used by tests). */
  compatibilityDate?: string;
  /** Which stack to target: "cloudflare" (default) or "next". */
  stack?: string;
}

/**
 * Dependency build scripts a scaffolded app allows, for pnpm.
 *
 * The union of what either stack needs: esbuild and workerd on Cloudflare, Prisma's
 * engine download on Next.js, esbuild again there because the Vercel CLI depends on it.
 * sharp is refused because nothing generated uses it and its download is large.
 */
const ALLOW_BUILDS = ["'@prisma/engines': true", "esbuild: true", "prisma: true", "sharp: false", "workerd: true"]
  .map((line) => `  ${line}`)
  .join("\n");

export interface CreateResult {
  dir: string;
  name: string;
  packageManager: PackageManager;
  inWorkspace: boolean;
}

/** Turn a directory name into a valid package / Worker name (lowercase, alphanumerics and dashes). */
export function toAppName(dir: string): string {
  const name = basename(resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!name) throw new Error(`Cannot derive an app name from "${dir}". Use letters, digits, and dashes.`);
  return name;
}

/**
 * How the app should depend on a Flare package (`core` or `cli`). When the CLI runs
 * from a checkout of the Flare repo (developing Flare itself), point at the
 * local package: `workspace:*` for apps inside that workspace, a link/file path for
 * apps elsewhere.
 */
export function flarePackageSpec(pkg: "core" | "cli", appDir: string, packageManager: PackageManager): string {
  const repoPackage = resolve(templatesDir, "../..", pkg);
  const repoRoot = resolve(repoPackage, "../..");
  // Installed from npm, @flaredev/cli and @flaredev/core are siblings too; only a checkout
  // of the Flare repo (packages/* under a pnpm workspace, not in node_modules) links locally.
  const fromCheckout =
    existsSync(join(repoPackage, "package.json")) &&
    existsSync(join(repoRoot, "pnpm-workspace.yaml")) &&
    !repoPackage.split(/[\\/]/).includes("node_modules");
  if (!fromCheckout) return `^${FLARE_VERSION}`;
  const rel = relative(repoRoot, appDir);
  // `relative` returns an absolute path when the app is on another drive (Windows).
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return "workspace:*";
  const protocol = packageManager === "pnpm" ? "link" : "file";
  return `${protocol}:${repoPackage.replaceAll("\\", "/")}`;
}

export function createApp(target: string, options: CreateOptions = {}): CreateResult {
  const dir = resolve(target);
  const name = toAppName(dir);

  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new Error(`Directory ${dir} already exists and is not empty.`);
  }

  const { packageManager, preferred: prefersPnpm } = choosePackageManager(options.pm);
  if (options.stack !== undefined && !isStack(options.stack)) {
    throw new Error(`Unknown stack "${options.stack}". Use ${STACKS.join(" or ")}.`);
  }
  const stack: Stack = (options.stack as Stack | undefined) ?? "cloudflare";
  const authProviders = parseAuthProviders(options.authProviders);
  const authMethods = parseAuthMethods(options.auth);
  const theme = parseTheme(options.theme);

  // When scaffolding inside an existing pnpm workspace (e.g. this repo's examples/),
  // the app joins that workspace instead of becoming its own root.
  const inWorkspace = findUp("pnpm-workspace.yaml", dirname(dir)) !== undefined;

  const compatibilityDate = options.compatibilityDate ?? COMPATIBILITY_DATE;
  const files = copyTemplate(join(templatesDir, "app"), dir, {
    APP_NAME: name,
    COMPAT_DATE: compatibilityDate,
    PM: packageManager,
    THEME: theme,
  });
  if (stack === "next") {
    // The Next.js stack is the shared app plus a handful of replacements: where rows
    // come from, where files go, and how it is built. Everything else — the dashboard,
    // the auth screens, every component — is the same code.
    copyTemplate(join(templatesDir, "next"), dir, { APP_NAME: name, PM: packageManager, THEME: theme });
    for (const path of CLOUDFLARE_ONLY) rmSync(join(dir, path), { recursive: true, force: true });
  }

  writeFileSync(join(dir, "lib", "auth-config.ts"), renderAuthConfig(authMethods, authProviders));
  // The committed example of the secrets file, which is a different file per stack —
  // and on Next.js .dev.vars.example was just removed, so appending would bring it back.
  appendFileSync(join(dir, stack === "next" ? ".env.example" : ".dev.vars.example"), devVarsExampleEntries(authProviders));

  const shared = { react: APP_DEPENDENCIES.react, "react-dom": APP_DEPENDENCIES["react-dom"] };
  const uiOnly = Object.fromEntries(
    Object.entries(APP_DEPENDENCIES).filter(([key]) => !["vinext", "@vinext/cloudflare", "drizzle-orm", "react-server-dom-webpack"].includes(key)),
  );

  writeJson(join(dir, "package.json"), {
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    // Which stack this app targets. `flare gen` reads it; don't change it by hand.
    flare: { stack },
    scripts:
      stack === "next"
        ? {
            dev: "next dev",
            build: "prisma generate && next build",
            start: "next start",
            deploy: "vercel deploy --prod",
            "db:generate": "prisma generate",
            "db:migrate": "prisma migrate dev",
            "db:studio": "prisma studio",
          }
        : {
            dev: "flare dev",
            build: "flare build",
            start: "flare start",
            deploy: "flare deploy",
            "cf-typegen": "wrangler types",
            "db:generate": "drizzle-kit generate",
            "db:migrate:local": "wrangler d1 migrations apply DB --local",
          },
    dependencies: {
      "@flaredev/core": flarePackageSpec("core", dir, packageManager),
      ...(stack === "next" ? { ...uiOnly, ...shared, ...NEXT_DEPENDENCIES } : APP_DEPENDENCIES),
    },
    devDependencies: {
      "@flaredev/cli": flarePackageSpec("cli", dir, packageManager),
      ...(stack === "next" ? NEXT_DEV_DEPENDENCIES : APP_DEV_DEPENDENCIES),
    },
  });

  // Local secrets (git-ignored). On Cloudflare production secrets are set with
  // `wrangler secret put`; on Vercel they are project environment variables.
  writeFileSync(
    join(dir, stack === "next" ? ".env" : ".dev.vars"),
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64")}\nRESEND_API_KEY=\nMAIL_FROM=\n${devVarsEntries(authProviders)}`,
  );

  if (packageManager === "pnpm" && !inWorkspace) {
    // pnpm blocks dependency build scripts unless explicitly allowed, and stops the
    // install with ERR_PNPM_IGNORED_BUILDS until someone decides. Deciding here means
    // the first install just works.
    //
    // One list for both stacks rather than one each. A per-stack list was wrong within
    // a day: esbuild was left off the Next.js one, and the Vercel CLI brings esbuild
    // in, so every new Next.js app failed its first install. Naming a package a stack
    // doesn't install costs nothing — the entry is simply never consulted — while
    // leaving one out breaks the very first command someone runs.
    writeFileSync(join(dir, "pnpm-workspace.yaml"), `allowBuilds:
${ALLOW_BUILDS}
`);
  }

  // A lockfile turns the install from "resolve 340 packages, then fetch them" into
  // just the fetch. Only for published versions: a checkout links @flaredev/* locally,
  // which the lockfile knows nothing about.
  const pinned = flarePackageSpec("core", dir, packageManager).startsWith("^");
  if (pinned) copyLockfile(packageManager, dir);

  const log = options.log ?? ((message: string) => console.log(message));
  log(`${pc.green("✔")} Wrote ${files} files to ${relative(process.cwd(), dir) || "."}`);
  // Say so, because it isn't what they typed: `npm create flare-framework` installs
  // with pnpm unless told otherwise, and minutes of silence would be worse than a line.
  if (prefersPnpm) log(pc.dim(`Installing with pnpm — far quicker for an app this size. Use ${pc.bold("--pm npm")} to change that.`));

  return { dir, name, packageManager, inWorkspace };
}

/**
 * The lockfile shipped for this package manager, if there is one. Bun reads npm's, so it
 * gets that one; only bun and npm share a file.
 */
export function copyLockfile(packageManager: PackageManager, dir: string): boolean {
  const file =
    packageManager === "pnpm" ? "pnpm-lock.yaml" : packageManager === "yarn" ? "yarn.lock" : "package-lock.json";
  if (!file) return false;
  const source = join(templatesDir, "locks", file);
  if (!existsSync(source)) return false;
  copyFileSync(source, join(dir, file));
  return true;
}

export function printNextSteps(result: CreateResult, installed: boolean) {
  const rel = relative(process.cwd(), result.dir) || ".";
  const pm = result.packageManager;
  const commands: [string, string][] = [
    [`cd ${rel}`, "your new app"],
    ...(installed ? [] : ([[`${pm} install`, "dependencies first"]] as [string, string][])),
    [`${pm} run dev`, "http://localhost:3000"],
    ["npx flare gen resource Contact", "a table, API and admin screens"],
    ["npx flare seed:resource Contact 1000", "fill it with sample rows"],
  ];
  const width = Math.max(...commands.map(([command]) => command.length)) + 2;
  const steps = commands.map(([command, note]) => `${pc.cyan(command.padEnd(width))}${pc.dim(note)}`);
  prompts.note(steps.join("\n"), "Next");
  prompts.outro(`${pc.bold(result.name)} is ready ${pc.dim("·")} ${pc.cyan("https://flare-docs.codetotech.com/start/quickstart/")}`);
}
