import { randomBytes } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import * as prompts from "@clack/prompts";
import pc from "picocolors";
import { FLARE_VERSION } from "@flaredev/core";
import { devVarsEntries, devVarsExampleEntries, parseAuthMethods, parseAuthProviders, renderAuthConfig, type SignupMode } from "../auth-providers.js";
import {
  parseStorage,
  storageEnv,
  storageEnvExample,
  storageSetupSteps,
  type StorageProviderName,
} from "../storage-providers.js";
import { parseTheme } from "../themes.js";
import {
  APP_DEPENDENCIES,
  APP_DEV_DEPENDENCIES,
  CLOUDFLARE_ONLY,
  COMPATIBILITY_DATE,
  NEXT_DEPENDENCIES,
  NEXT_DEV_DEPENDENCIES,
  STORAGE_DEPENDENCIES,
} from "../versions.js";
import { isStack, STACKS, type Stack } from "../stack.js";
import { copyTemplate, findUp, templatesDir, writeJson } from "../utils/fs.js";
import { choosePackageManager, type PackageManager } from "../utils/pm.js";

/**
 * The account `pnpm db:seed` makes, and the one the "Next" box tells you to sign in
 * with. Declared once so the script, the printed credentials and the docs cannot drift
 * apart — the failure mode being a printed password that does not work.
 *
 * Deliberately a well-known pair: this is a development convenience on a database that
 * has just been created locally, not a secret. `flare user:add` is how a real account
 * is made, and the dashboard's own warning covers changing it before anything ships.
 */
export const SEED_ADMIN = { email: "admin@example.com", password: "Password", name: "Admin" } as const;

/**
 * The app's display name: "danlite" is "Danlite" on the sidebar and the sign-in screen,
 * "my-app-2" is "My App 2". The machine name (`toAppName`) stays lowercase — it is a
 * package name, a Workers script name and a bucket prefix, none of which take capitals.
 */
export function toAppTitle(name: string): string {
  return name
    .split("-")
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

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
  /** Which stack to target: "next" (default) or "cloudflare". */
  stack?: string;
  /** Who may create an account: "open" (default), "invite" or "closed". */
  signup?: string;
  /** Where uploads go: "r2" (default), "disk" (Next.js only), "cloudinary" or "uploadthing". */
  storage?: string;
}

/**
 * Dependency build scripts a scaffolded app allows, for pnpm.
 *
 * The union of what either stack needs, rather than a list per stack: naming a package
 * a stack doesn't install costs nothing, while leaving one out breaks the first command
 * somebody runs.
 *
 * `@prisma/engines` is refused on purpose. Its postinstall downloads engine binaries,
 * which fails behind a proxy or a slow link and takes the install down with it — and
 * this stack doesn't need them, because Prisma 7 talks to Postgres through a driver
 * adapter. Verified without it: `prisma generate`, `prisma validate`, `prisma migrate
 * diff` and `next build` all work. sharp is refused for the same reason and because
 * nothing generated uses it. msgpackr-extract is refused because it is an optional
 * native accelerator that msgpackr falls back from on its own — and an undecided entry
 * is not a warning, it is ERR_PNPM_IGNORED_BUILDS and a failed first install.
 */
const ALLOW_BUILDS = [
  "'@prisma/engines': false",
  "esbuild: true",
  "msgpackr-extract: false",
  "prisma: true",
  "sharp: false",
  "workerd: true",
]
  .map((line) => `  ${line}`)
  .join("\n");

export interface CreateResult {
  dir: string;
  name: string;
  packageManager: PackageManager;
  inWorkspace: boolean;
  stack: Stack;
  /** Where uploads go, so the next steps can say what it still needs. */
  storage: StorageProviderName;
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
 * Who may create an account, from `--signup`.
 *
 * The default is `open`, deliberately. An external review suggested `invite`, and it is
 * the safer setting — but a new resource is admin-only and the first account becomes the
 * admin, so a stranger who signs up can already reach nothing. What `invite` buys over
 * that is stopping them having an account at all, which is worth having and is one flag
 * away; what it costs is a slower first run for everybody, including the many apps that
 * are meant to be public. So the safer behaviour is the easy option rather than the
 * imposed one, and `flare deploy` is where an open sign-up gets mentioned.
 */
export function parseSignup(value: string | undefined): SignupMode {
  if (value === undefined) return "open";
  const mode = value.trim().toLowerCase();
  if (mode === "open" || mode === "invite" || mode === "closed") return mode;
  throw new Error(`Unknown --signup "${value}". Use open, invite or closed.`);
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
  const stack: Stack = (options.stack as Stack | undefined) ?? "next";
  const authProviders = parseAuthProviders(options.authProviders);
  const authMethods = parseAuthMethods(options.auth);
  const theme = parseTheme(options.theme);
  const signup = parseSignup(options.signup);
  // Parsed against the stack: `disk` cannot run on a Worker, and saying so now beats an
  // app that is created and then cannot upload anything.
  const storage = parseStorage(options.storage, stack);

  // When scaffolding inside an existing pnpm workspace (e.g. this repo's examples/),
  // the app joins that workspace instead of becoming its own root.
  const inWorkspace = findUp("pnpm-workspace.yaml", dirname(dir)) !== undefined;

  const compatibilityDate = options.compatibilityDate ?? COMPATIBILITY_DATE;
  const files = copyTemplate(join(templatesDir, "app"), dir, {
    APP_NAME: name,
    APP_TITLE: toAppTitle(name),
    COMPAT_DATE: compatibilityDate,
    PM: packageManager,
    THEME: theme,
    SIGNUP: signup,
  });
  if (stack === "next") {
    // The Next.js stack is the shared app plus a handful of replacements: where rows
    // come from, where files go, and how it is built. Everything else — the dashboard,
    // the auth screens, every component — is the same code.
    copyTemplate(join(templatesDir, "next"), dir, { APP_NAME: name, APP_TITLE: toAppTitle(name), PM: packageManager, THEME: theme, SIGNUP: signup });
    for (const path of CLOUDFLARE_ONLY) rmSync(join(dir, path), { recursive: true, force: true });
  }

  writeFileSync(join(dir, "lib", "auth-config.ts"), renderAuthConfig(authMethods, authProviders, signup));
  // The committed example of the secrets file, which is a different file per stack —
  // and on Next.js .dev.vars.example was just removed, so appending would bring it back.
  // The disk driver writes files into the repository, so the directory it writes to has
  // to be ignored before anybody uploads anything. Only for that driver: an app using a
  // bucket has no such directory, and an ignore rule for a path that does not exist is
  // the kind of line nobody can later explain.
  if (storage === "disk") {
    appendFileSync(join(dir, ".gitignore"), `
# Uploads (STORAGE_DRIVER=disk)
storage/
`);
  }

  const exampleEnv = join(dir, stack === "next" ? ".env.example" : ".dev.vars.example");
  appendFileSync(exampleEnv, devVarsExampleEntries(authProviders));
  appendFileSync(exampleEnv, storageEnvExample(storage, stack));

  const shared = { react: APP_DEPENDENCIES.react, "react-dom": APP_DEPENDENCIES["react-dom"] };
  // Everything a Next.js app shares with the Cloudflare one: the UI packages, auth, the
  // fonts. What is left out is what belongs to the other runtime or the other ORM —
  // including the Drizzle auth adapter, which a Next.js app never imports (the overlay
  // brings @better-auth/prisma-adapter) and whose peer range npm now refuses to resolve.
  const cloudflareOnlyPackages = ["vinext", "@vinext/cloudflare", "drizzle-orm", "react-server-dom-webpack", "@better-auth/drizzle-adapter"];
  const uiOnly = Object.fromEntries(Object.entries(APP_DEPENDENCIES).filter(([key]) => !cloudflareOnlyPackages.includes(key)));

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
            // Prisma 7 generates its client into lib/generated/prisma, which is
            // git-ignored and therefore absent from every fresh checkout — including
            // the one `create` has just written. Without this the first `dev` fails on
            // `Can't resolve './generated/prisma/client'` before serving a page, and
            // so does `flare user:add`, which imports lib/db. postinstall rather than a
            // step in `dev`, so a teammate cloning the repo is covered by the same line.
            postinstall: "prisma generate",
            dev: "next dev",
            build: "prisma generate && next build",
            start: "next start",
            deploy: "vercel deploy --prod",
            "db:generate": "prisma generate",
            // Thin aliases for the flare commands, so the scripts and the printed steps
            // can never say different things. `flare migrate` is `prisma migrate dev`
            // plus `prisma generate` — the generate is not optional; Prisma 7 removed
            // generator runs from `migrate dev`, and a client without the new model
            // fails the very next command, usually `flare seed:resource`.
            "db:migrate": "flare migrate",
            // An account to sign in with, so the app is reachable the moment the tables
            // exist. Safe to run twice: --skip-existing makes a second run a no-op.
            "db:seed": "flare db:seed",
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
      // The chosen provider's SDK, where it has one, so the first upload works without
      // a second install.
      ...(storage in STORAGE_DEPENDENCIES ? { [storage]: STORAGE_DEPENDENCIES[storage as keyof typeof STORAGE_DEPENDENCIES] } : {}),
    },
    devDependencies: {
      "@flaredev/cli": flarePackageSpec("cli", dir, packageManager),
      ...(stack === "next" ? NEXT_DEV_DEPENDENCIES : APP_DEV_DEPENDENCIES),
    },
  });

  // Local secrets (git-ignored). On Cloudflare production secrets are set with
  // `wrangler secret put`; on Vercel they are project environment variables.
  //
  // The Next.js stack gets the local service addresses already filled in, matching the
  // docker-compose.yml beside it, so `docker compose up -d` is the only setup step.
  // Point them at Neon, R2 and Upstash to deploy. The Cloudflare stack needs none of
  // this: D1, R2 and KV are all simulated locally by Wrangler.
  writeFileSync(
    join(dir, stack === "next" ? ".env" : ".dev.vars"),
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64")}\nRESEND_API_KEY=\nMAIL_FROM=\n${devVarsEntries(authProviders)}` +
      (stack === "next" ? `\n${LOCAL_SERVICES}` : "") +
      // The chosen driver, with the local values filled in where it has them — so the
      // default still needs nothing but `docker compose up -d`, and a provider with
      // credentials arrives with the link to where they live rather than a bare name.
      `\n${storageEnv(storage, stack, { local: true })}`,
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
  if (pinned) copyLockfile(packageManager, dir, stack);

  const log = options.log ?? ((message: string) => console.log(message));
  log(`${pc.green("✔")} Wrote ${files} files to ${relative(process.cwd(), dir) || "."}`);
  // Say so, because it isn't what they typed: `npm create flare-framework` installs
  // with pnpm unless told otherwise, and minutes of silence would be worse than a line.
  if (prefersPnpm) log(pc.dim(`Installing with pnpm — far quicker for an app this size. Use ${pc.bold("--pm npm")} to change that.`));

  return { dir, name, packageManager, inWorkspace, stack, storage };
}

/**
 * The lockfile shipped for this package manager, if there is one. Bun reads npm's, so it
 * gets that one; only bun and npm share a file.
 */
/**
 * Addresses of the services in docker-compose.yml, written into a new Next.js app's
 * `.env` so there is nothing to edit before the first `pnpm dev`.
 *
 * Storage is not here: the driver and its variables come from `--storage` (see
 * storage-providers.ts), so the file has one `STORAGE_DRIVER` line and it is the one that
 * was asked for rather than a default plus three commented alternatives.
 */
export const LOCAL_SERVICES = [
  "# Local services (docker-compose.yml). Swap these for Neon, R2 and Upstash to deploy.",
  "DATABASE_URL=postgresql://flare:flare@127.0.0.1:5432/app",
  "BETTER_AUTH_URL=http://localhost:3000",
  "",
  "# Cloudinary and UploadThing serve files from their own CDN, so a read URL is public",
  "# and does not expire. Set this to keep every read signed and proxied by the app.",
  "# STORAGE_PUBLIC=false",
  "",
  "# Images are shrunk in the browser before upload (about 20x smaller). Set false to",
  "# send the original bytes instead; it is read at build time, so this needs a rebuild.",
  "# NEXT_PUBLIC_OPTIMISE_UPLOADS=false",
  "",
  "UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079",
  "UPSTASH_REDIS_REST_TOKEN=flare-local-token",
  "",
].join("\n");

/**
 * The lockfile shipped for this package manager and stack, if there is one. Bun reads
 * npm's, so it gets that one; only bun and npm share a file.
 *
 * Per stack, because the two have almost nothing in common — one resolves vinext,
 * wrangler and drizzle, the other next, prisma and the Vercel CLI. One shared file was
 * built from the Cloudflare app and copied into Next.js apps as well, where it pinned
 * packages the app does not have and missed every package it does.
 */
export function copyLockfile(packageManager: PackageManager, dir: string, stack: Stack): boolean {
  const file =
    packageManager === "pnpm" ? "pnpm-lock.yaml" : packageManager === "yarn" ? "yarn.lock" : "package-lock.json";
  if (!file) return false;
  const source = join(templatesDir, "locks", stack, file);
  // Missing is not an error: the install simply resolves for itself, which is slower and
  // correct. That is also what happens for a stack whose lockfile has not been built yet.
  if (!existsSync(source)) return false;
  copyFileSync(source, join(dir, file));
  return true;
}

export function printNextSteps(result: CreateResult, installed: boolean) {
  const rel = relative(process.cwd(), result.dir) || ".";
  const pm = result.packageManager;
  // The database steps come before `dev` because the app genuinely does not work
  // without them: no tables means every page that touches one is a 500, and no account
  // means the sign-in form is a wall. They used to be left to the quickstart page, and
  // the first thing a new app did was fail.
  const database: [string, string][] =
    result.stack === "next"
      ? [
          ["docker compose up -d", "Postgres, on the address .env already has"],
          ["npx flare migrate", "create the tables"],
          ["npx flare db:seed", "an account to sign in with"],
        ]
      : [];
  // Flare commands, not the tools underneath them. The one person this box is for is
  // the person who has not learnt the stack yet, and `pnpm run db:migrate` next to
  // `npx flare gen resource` taught two command languages on day one.
  const commands: [string, string][] = [
    [`cd ${rel}`, "your new app"],
    ...(installed ? [] : ([[`${pm} install`, "dependencies first"]] as [string, string][])),
    ...database,
    ["npx flare dev", "http://localhost:3000"],
  ];
  // Its own box, with the stack's own middle step. The one list used to go straight
  // from `gen resource` to `seed:resource`, and the seed wrote into a table that did
  // not exist yet. These three lines are also what the dashboard's empty state shows
  // and what the quickstart walks through — one flow, told three times, identically.
  const firstResource: [string, string][] = [
    ["npx flare gen resource Contact", "a table, API and admin screens"],
    ["npx flare migrate", "create its table"],
    ["npx flare seed:resource Contact 1000", "fill it with sample rows"],
  ];
  const width = Math.max(...[...commands, ...firstResource].map(([command]) => command.length)) + 2;
  const line = ([command, note]: [string, string]) => `${pc.cyan(command.padEnd(width))}${pc.dim(note)}`;
  prompts.note(commands.map(line).join("\n"), "Next");
  prompts.note(firstResource.map(line).join("\n"), "Your first resource");

  // Only when the chosen storage needs something before an upload will work. The default
  // needs nothing, which is the point of it being the default — and a note about
  // credentials nobody has to fetch would train people to skip these.
  // `true` because createApp writes the local values where a provider has them.
  const storage = storageSetupSteps(result.storage, result.stack, { local: true });
  if (storage.length > 0) {
    prompts.note(storage.map((line) => (line.startsWith("http") ? pc.cyan(line) : line)).join("\n"), `Uploads · ${result.storage}`);
  }

  // Printed rather than left in the docs: a seeded password nobody is told is a
  // password nobody can use, and the first thing it guards is the dashboard.
  if (result.stack === "next") {
    prompts.note(
      [
        `${pc.cyan(SEED_ADMIN.email)}  ${pc.dim("·")}  ${pc.cyan(SEED_ADMIN.password)}`,
        "",
        pc.dim("Made by npx flare db:seed, as an admin. Change it before this app is anywhere but your machine."),
      ].join("\n"),
      "Sign in with",
    );
  }

  prompts.outro(`${pc.bold(result.name)} is ready ${pc.dim("·")} ${pc.cyan("https://flare-docs.codetotech.com/start/quickstart/")}`);
}
