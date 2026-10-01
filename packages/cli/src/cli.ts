import { cac } from "cac";
import pc from "picocolors";
import * as prompts from "@clack/prompts";
import { FLARE_VERSION } from "@flaredev/core";
import { createApp, printNextSteps, toAppName } from "./commands/create.js";
import { genApiKeys } from "./commands/gen-apikeys.js";
import { genBilling } from "./commands/gen-billing.js";
import { genSecurity } from "./commands/gen-security.js";
import { setTheme } from "./commands/theme.js";
import { askCreateQuestions, canPrompt, type CreateAnswers } from "./commands/create-prompts.js";
import { genResource } from "./commands/gen.js";
import { genEndpoint } from "./commands/gen-endpoint.js";
import { genMigration } from "./commands/gen-migration.js";
import { genPolicy } from "./commands/gen-policy.js";
import { migrate, rollback } from "./commands/migrate.js";
import { rmResource } from "./commands/rm.js";
import { addRole } from "./commands/role.js";
import { diffTracked, updateTracked } from "./commands/eject.js";
import { makeSeed, runSeeds } from "./commands/seed.js";
import { dbPush } from "./commands/db-push.js";
import { seedResourceCommand, type SeedResourceOptions } from "./commands/seed-resource.js";
import { syncPlans } from "./commands/billing-sync.js";
import { syncTypes } from "./commands/sync.js";
import { setUserRole } from "./commands/user-role.js";
import { DELEGATED_COMMANDS, findAppRoot } from "./commands/run.js";
import { readStack, type Stack } from "./stack.js";
import { openTunnel, toLocalUrl, tunnelBanner } from "./tunnel.js";
import { expectedPackages, install } from "./utils/install.js";
import { formatCount, formatDuration } from "./terminal.js";

/**
 * The generators `flare gen` accepts.
 *
 * Named once because naming them twice went wrong: the help text listed `endpoint` and
 * the "Unknown generator" error did not, so the error told you a working generator
 * didn't exist.
 */
const GENERATORS = ["resource", "endpoint", "migration", "policy", "billing", "security", "apikeys"] as const;

/**
 * The stack of the app `flare` was run in, or undefined outside one (`flare create`).
 *
 * Only `--help` text uses this. Every command that behaves differently per stack reads
 * the stack itself; this is so a Next.js app isn't told about D1 and wrangler, which it
 * has neither of.
 */
function currentStack(): Stack | undefined {
  try {
    return readStack(findAppRoot(process.cwd()));
  } catch {
    return undefined;
  }
}

export function createCli() {
  const cli = cac("flare");
  const stack = currentStack();
  /** Pick the wording for the stack we're in, or say both when we aren't in an app. */
  const perStack = (cloudflare: string, next: string, either: string) =>
    stack === "next" ? next : stack === "cloudflare" ? cloudflare : either;
  // D1, wrangler environments and bindings exist on one stack only. Saying so beats
  // listing a flag that silently does nothing.
  const cloudflareOnly = (text: string) => (stack === undefined ? `${text} (Cloudflare only)` : text);

  cli
    .command("create <dir>", "Scaffold a new Flare app")
    .option("--pm <manager>", "Package manager: pnpm, npm, yarn, or bun (default: detected)")
    .option("--stack <name>", "Where it runs: cloudflare (default) or next")
    .option("--theme <name>", "Look of the app: default, coral, amber, sky, mono or emerald")
    .option("--auth <list>", "Sign-in methods: magic-link, email-otp, passkeys, 2fa-app, 2fa-email, all or none (default: all)")
    .option("--auth-providers <list>", "Social sign-in, comma-separated: google, github, apple, microsoft")
    .option("-y, --yes", "Don't ask: use the flags given and the defaults for the rest")
    .option("--skip-install", "Write files without installing dependencies")
    .example("flare create shop")
    .example("flare create shop --stack next")
    .example("flare create shop --theme mono --auth passkeys,2fa-app --auth-providers google,github --yes")
    .action(
      async (
        dir: string,
        options: { pm?: string; stack?: string; skipInstall?: boolean; authProviders?: string; auth?: string; theme?: string; yes?: boolean },
      ) => {
      const wanted = !options.skipInstall;
      let answers: CreateAnswers = { stack: options.stack, theme: options.theme, auth: options.auth, authProviders: options.authProviders };
      if (canPrompt(options.yes)) answers = await askCreateQuestions(answers, toAppName(dir));
      const result = createApp(dir, { pm: options.pm, install: false, ...answers, log: (message) => prompts.log.message(message) });

      let installed = false;
      if (wanted) {
        const spin = prompts.spinner({ indicator: "timer" });
        spin.start(`Installing dependencies with ${result.packageManager}`);
        const outcome = await install(result.packageManager, result.dir, ({ installed: done, expected, percent }) => {
          // Counting what's landed in node_modules beats parsing four package managers'
          // output, and it's the number people actually want: how much is left.
          spin.message(
            percent === undefined
              ? `Installing dependencies with ${result.packageManager} · ${formatCount(done)} packages`
              : `Installing dependencies with ${result.packageManager} · ${percent}% (${formatCount(done)} of ${formatCount(expected)})`,
          );
        });
        installed = outcome.code === 0;
        if (installed) {
          spin.stop(`Installed ${formatCount(expectedPackages(result.dir) || 0)} packages with ${result.packageManager} ${pc.dim(`(${formatDuration(outcome.ms)})`)}`);
        } else {
          spin.error(`${result.packageManager} install failed`);
          process.stderr.write(outcome.output);
          process.exitCode = 1;
        }
      }
      printNextSteps(result, installed);
    });

  cli
    .command("gen <generator> [name] [second]", `Generate code. Generators: ${GENERATORS.join(", ")}`)
    .option("--fields <fields>", "resource: fields, e.g. 'name:string, email:string!, status:enum(lead,customer)' (single quotes: bash treats ! in double quotes as history)")
    .option("--group <name>", "resource: sidebar heading to file it under, e.g. Sales")
    .option("--icon <name>", "resource: lucide icon for the sidebar, e.g. users")
    .option("--soft-delete", "resource: keep deleted rows and hide them, with a Trash view in the dashboard")
    .option("--method <verb>", "endpoint: GET (default), POST, PATCH, PUT or DELETE")
    .option("--action <action>", "endpoint: policy action to require (read, create, update, delete)")
    .option("--record", "endpoint: put it under one record, /api/<resource>/[id]/<name>")
    .option("--force", "resource/policy/billing/security: overwrite hand-edited generated blocks")
    .option("--from-schema", "migration: diff the current tables instead of a blank migration")
    .option("--roles <roles>", "policy: roles allowed to read, create and update, e.g. admin,staff")
    .option("--delete-roles <roles>", "policy: roles allowed to delete (default: the first --roles entry)")
    .option("--own <field>", "policy: confine each user to rows whose belongsTo(User) field holds their id, e.g. --own userId")
    .option("--own-except <roles>", "policy: roles that see every row despite --own, e.g. admin")
    .option("--provider <provider>", "billing: payment provider (default: stripe)")
    .option("--mode <mode>", "billing: subscriptions (the default; includes one-time checkout)")
    .option("--skip-install", "billing/apikeys: write files without adding the dependency")
    .option("--skip-migration", "billing/security/apikeys: skip generating the schema migration")
    .example("flare gen resource Contact --fields 'name:string, email:string!, company:belongsTo(Company)?'")
    .example("flare gen resource Invoice --fields 'number:string!' --soft-delete   # a delete goes to the Trash")
    .example("flare gen endpoint Order publish --method POST --record")
    .example("flare gen migration backfill_contact_status")
    .example("flare gen migration add_phone_to_contacts --from-schema")
    .example("flare gen policy Invoice --roles admin,staff --delete-roles admin")
    .example("flare gen policy Invoice --roles staff --own userId --own-except admin   # each user sees only their own")
    .example("flare gen billing --provider stripe --mode subscriptions")
    .example("flare gen security")
    .example("flare gen apikeys                                   # API keys for cron jobs, scripts and mobile apps")
    .example("flare gen apikeys                                     # bearer keys for crons, scripts and mobile apps")
    .action(
      async (
        generator: string,
        name: string | undefined,
        second: string | undefined,
        options: {
          fields?: string;
          group?: string;
          icon?: string;
          softDelete?: boolean;
          method?: string;
          action?: string;
          record?: boolean;
          force?: boolean;
          fromSchema?: boolean;
          roles?: string;
          deleteRoles?: string;
          own?: string;
          ownExcept?: string;
          provider?: string;
          mode?: string;
          skipInstall?: boolean;
          skipMigration?: boolean;
        },
      ) => {
        if (generator === "billing")
          return genBilling({ provider: options.provider, mode: options.mode, force: options.force, skipInstall: options.skipInstall, skipMigration: options.skipMigration });
        if (generator === "security") return genSecurity({ force: options.force, skipMigration: options.skipMigration });
        if (generator === "apikeys")
          return genApiKeys({ force: options.force, skipInstall: options.skipInstall, skipMigration: options.skipMigration });
        if (generator === "apikeys")
          return genApiKeys({ force: options.force, skipInstall: options.skipInstall, skipMigration: options.skipMigration });
        if (["resource", "migration", "policy"].includes(generator) && !name) {
          throw new Error(`flare gen ${generator} needs a name, e.g. flare gen ${generator} ${generator === "migration" ? "add_phone_to_contacts" : "Contact"}`);
        }
        if (generator === "resource")
          return genResource(name!, {
            fields: options.fields,
            force: options.force,
            group: options.group,
            icon: options.icon,
            softDelete: options.softDelete,
          });
        if (generator === "endpoint") {
          if (!name || !second) throw new Error("flare gen endpoint needs a resource and a name, e.g. flare gen endpoint Order publish");
          return genEndpoint(name, second, { method: options.method, action: options.action, record: options.record });
        }
        if (generator === "migration") return genMigration(name!, { fromSchema: options.fromSchema });
        if (generator === "policy")
          return genPolicy(name!, {
            roles: options.roles,
            deleteRoles: options.deleteRoles,
            own: options.own,
            ownExcept: options.ownExcept,
            force: options.force,
          });
        throw new Error(`Unknown generator "${generator}". Available: ${GENERATORS.join(", ")}.`);
      },
    );

  cli
    .command("rm <kind> <name>", "Remove generated code. Kinds: resource")
    .option("--force", "Delete even when files contain hand-written code")
    .example("flare rm resource Tag")
    .action(async (kind: string, name: string, options: { force?: boolean }) => {
      if (kind !== "resource") throw new Error(`Unknown kind "${kind}". Available: resource.`);
      await rmResource(name, options);
    });

  cli
    .command(
      "role:add <name>",
      perStack(
        "Register a role users can be assigned (local database unless --remote)",
        "Register a role users can be assigned (the database in DATABASE_URL)",
        "Register a role users can be assigned",
      ),
    )
    .option("--label <label>", "Display label (default: humanized name)")
    .option("--remote", cloudflareOnly("Target the deployed database"))
    .option("--env <name>", cloudflareOnly("Wrangler environment"))
    .example("flare role:add support")
    .action(async (name: string, options: { label?: string; remote?: boolean; env?: string }) => {
      process.exitCode = await addRole(name, options);
    });

  cli
    .command(
      "user:role <email> <role>",
      perStack(
        "Set a user's role, e.g. make the first admin (local database unless --remote)",
        "Set a user's role, e.g. make the first admin (the database in DATABASE_URL)",
        "Set a user's role, e.g. make the first admin",
      ),
    )
    .option("--remote", cloudflareOnly("Target the deployed database"))
    .option("--env <name>", cloudflareOnly("Wrangler environment"))
    .example("flare user:role you@example.com admin")
    .action(async (email: string, role: string, options: { remote?: boolean; env?: string }) => {
      process.exitCode = await setUserRole(email, role, options);
    });

  cli
    .command(
      "migrate",
      perStack(
        "Apply pending D1 migrations (local database unless --remote)",
        "Apply pending Prisma migrations to the database in DATABASE_URL (prisma migrate deploy)",
        "Apply pending migrations: D1 on the Cloudflare stack, Prisma on the Next.js one",
      ),
    )
    .option("--remote", cloudflareOnly("Target the deployed database"))
    .option("--env <name>", cloudflareOnly("Wrangler environment"))
    .option("--database <binding>", cloudflareOnly("D1 binding, when the app has several"))
    .action(async (options: { remote?: boolean; env?: string; database?: string }) => {
      process.exitCode = await migrate(options);
    });

  cli
    .command(
      "migrate:rollback",
      perStack(
        "Undo the most recently applied D1 migrations",
        "Undo the most recently applied migrations (prisma migrate resolve --rolled-back)",
        "Undo the most recently applied migrations",
      ),
    )
    .option("--steps <n>", "How many migrations to roll back", { default: 1 })
    .option("--remote", cloudflareOnly("Target the deployed database (requires --yes)"))
    .option("--yes", "Confirm a remote rollback")
    .option("--env <name>", cloudflareOnly("Wrangler environment"))
    .option("--database <binding>", cloudflareOnly("D1 binding, when the app has several"))
    .action(async (options: { steps: number | string; remote?: boolean; yes?: boolean; env?: string; database?: string }) => {
      process.exitCode = await rollback({ ...options, steps: Number(options.steps) });
    });

  cli
    .command(
      "seed [...names]",
      perStack(
        "Run seed files from seeds/ against the local D1 database",
        "Run seed files from seeds/ against the database in DATABASE_URL",
        "Run seed files from seeds/ against the local database",
      ),
    )
    .example("flare seed            # every seed, in file-name order")
    .example("flare seed contacts   # just seeds/contacts.seed.ts")
    .action(async (names: string[]) => {
      await runSeeds({ names });
    });

  cli
    .command(
      "seed:resource <resource> [count]",
      perStack(
        "Fill a resource's table with sample rows built from its descriptor",
        "Cloudflare only — on this stack use `flare seed:make <name> --resource <Resource>` then `flare seed`",
        "Fill a resource's table with sample rows built from its descriptor (Cloudflare only)",
      ),
    )
    .option("--count <rows>", "How many rows: 1000, 25k, 1m (default: 25)")
    .option("--remote", cloudflareOnly("Seed the deployed database instead of the local one (needs --yes)"))
    .option("--truncate", "Delete the table's rows first")
    .option("--seed <number>", "Same number, same rows")
    .option("--env <name>", cloudflareOnly("Wrangler environment"))
    .option("--database <binding>", cloudflareOnly("D1 binding, when the app has several"))
    .option("-y, --yes", "Confirm writing to the remote database")
    .example("flare seed:resource Contact --count 1000")
    .example("flare seed:resource Contact 1m            # a million rows")
    .example("flare seed:resource Contact 5k --remote --yes")
    .action(async (resource: string, count: string | undefined, options: SeedResourceOptions & { count?: string }) => {
      await seedResourceCommand(resource, { ...options, count: options.count ?? count });
    });

  cli
    .command("diff [filter]", "Show how the code Flare copied into this app (lib/ and components/) differs from the current version")
    .example("flare diff")
    .example("flare diff store          # just the files whose path contains \"store\"")
    .action((filter: string | undefined) => {
      diffTracked({ filter });
    });

  cli
    .command("update [filter]", "Replace this app's copies of Flare's files with the current version (discards your edits)")
    .option("-y, --yes", "Confirm overwriting")
    .example("flare update            # lists what would change")
    .example("flare update --yes      # applies it")
    .action((filter: string | undefined, options: { yes?: boolean }) => {
      const code = updateTracked({ filter, yes: options.yes });
      if (code !== 0) process.exitCode = code;
    });

  cli
    .command("db:push [...tables]", "Copy rows from the local database to the deployed one (seeded catalogues, reference data)")
    .option("--truncate", "Delete the remote rows of those tables first")
    .option("--database <binding>", "D1 binding, when the app has several")
    .option("--env <name>", "Wrangler environment")
    .option("-y, --yes", "Confirm writing to the deployed database")
    .example("flare db:push products categories --yes")
    .example("flare db:push plans --truncate --yes")
    .action(async (tables: string[], options: { truncate?: boolean; database?: string; env?: string; yes?: boolean }) => {
      await dbPush(tables, options);
    });

  cli
    .command("seed:make <name>", "Create seeds/<name>.seed.ts (with example rows for a matching resource)")
    .option("--resource <name>", "Resource to write example rows for")
    .action(async (name: string, options: { resource?: string }) => {
      await makeSeed(name, options);
    });

  cli
    .command("billing:sync-plans", "Pull Stripe Products/Prices into the Plan table and enable plan changes in the portal (local database unless --remote)")
    .option("--remote", "Write to the deployed database")
    .option("--env <name>", "Wrangler environment")
    .option("--all", "Import every active Product, not only those tagged flare_app=<app name>")
    .example("flare billing:sync-plans")
    .example("flare billing:sync-plans --remote")
    .action(async (options: { remote?: boolean; env?: string; all?: boolean }) => {
      await syncPlans({ remote: options.remote, env: options.env, all: options.all });
    });

  cli
    .command("sync-types", "Regenerate schema, routes, clients, and validators from resource descriptors; report drift")
    .option("--check", "Change nothing; exit 1 if anything is out of sync (CI)")
    .option("--force", "Overwrite generated blocks that were edited by hand")
    .action(async (options: { check?: boolean; force?: boolean }) => {
      process.exitCode = await syncTypes(options);
    });

  cli
    .command("theme [name]", "List the themes, or switch the app to one: default, coral, amber, sky, mono, emerald")
    .example("flare theme")
    .example("flare theme mono")
    .action((name: string | undefined) => setTheme(name));

  cli
    .command("tunnel [target]", "Share a local server on a public https://*.trycloudflare.com URL (Cloudflare Quick Tunnel; no account needed)")
    .example("flare tunnel          # http://localhost:3000")
    .example("flare tunnel 8787")
    .example("flare tunnel http://localhost:5173")
    .action(async (target: string | undefined) => {
      const local = toLocalUrl(target);
      const tunnel = await openTunnel(local);
      console.log(tunnelBanner(tunnel.url, local));
      // Stay up until Ctrl+C or until cloudflared stops.
      process.exitCode = await new Promise<number>((resolve) => {
        process.once("SIGINT", () => {
          tunnel.close();
          resolve(0);
        });
        tunnel.process.once("exit", (code) => resolve(code ?? 0));
      });
    });

  // Handled before parsing in index.ts (arguments are forwarded verbatim); registered here for --help.
  for (const [name, spec] of Object.entries(DELEGATED_COMMANDS)) {
    cli.command(`${name} [...args]`, spec.description).allowUnknownOptions();
  }

  cli.help();
  cli.version(FLARE_VERSION);
  return cli;
}
