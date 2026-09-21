import { cac } from "cac";
import { FLARE_VERSION } from "@flare/core";
import { createApp, printNextSteps } from "./commands/create.js";
import { genBilling } from "./commands/gen-billing.js";
import { genSecurity } from "./commands/gen-security.js";
import { genResource } from "./commands/gen.js";
import { genMigration } from "./commands/gen-migration.js";
import { genPolicy } from "./commands/gen-policy.js";
import { migrate, rollback } from "./commands/migrate.js";
import { rmResource } from "./commands/rm.js";
import { addRole } from "./commands/role.js";
import { makeSeed, runSeeds } from "./commands/seed.js";
import { syncPlans } from "./commands/billing-sync.js";
import { syncTypes } from "./commands/sync.js";
import { setUserRole } from "./commands/user-role.js";
import { DELEGATED_COMMANDS } from "./commands/run.js";

export function createCli() {
  const cli = cac("flare");

  cli
    .command("create <dir>", "Scaffold a new Flare app")
    .option("--pm <manager>", "Package manager: pnpm, npm, yarn, or bun (default: detected)")
    .option("--auth-providers <list>", "OAuth providers to scaffold, comma-separated (google, github)")
    .option("--skip-install", "Write files without installing dependencies")
    .example("flare create shop --auth-providers google,github")
    .action((dir: string, options: { pm?: string; skipInstall?: boolean; authProviders?: string }) => {
      const install = !options.skipInstall;
      const result = createApp(dir, { pm: options.pm, install, authProviders: options.authProviders });
      printNextSteps(result, install);
    });

  cli
    .command("gen <generator> [name]", "Generate code. Generators: resource, migration, policy, billing, security")
    .option("--fields <fields>", 'resource: fields, e.g. "name:string, email:string!, status:enum(lead,customer)"')
    .option("--force", "resource/policy/billing/security: overwrite hand-edited generated blocks")
    .option("--from-schema", "migration: diff the current tables instead of a blank migration")
    .option("--roles <roles>", "policy: roles allowed to read, create and update, e.g. admin,staff")
    .option("--delete-roles <roles>", "policy: roles allowed to delete (default: the first --roles entry)")
    .option("--provider <provider>", "billing: payment provider (default: stripe)")
    .option("--mode <mode>", "billing: subscriptions (the default; includes one-time checkout)")
    .option("--skip-install", "billing: write files without installing the stripe dependency")
    .option("--skip-migration", "billing/security: skip generating the schema migration")
    .example('flare gen resource Contact --fields "name:string, email:string!, company:belongsTo(Company)?"')
    .example("flare gen migration backfill_contact_status")
    .example("flare gen migration add_phone_to_contacts --from-schema")
    .example("flare gen policy Invoice --roles admin,staff --delete-roles admin")
    .example("flare gen billing --provider stripe --mode subscriptions")
    .example("flare gen security")
    .action(
      async (
        generator: string,
        name: string | undefined,
        options: {
          fields?: string;
          force?: boolean;
          fromSchema?: boolean;
          roles?: string;
          deleteRoles?: string;
          provider?: string;
          mode?: string;
          skipInstall?: boolean;
          skipMigration?: boolean;
        },
      ) => {
        if (generator === "billing")
          return genBilling({ provider: options.provider, mode: options.mode, force: options.force, skipInstall: options.skipInstall, skipMigration: options.skipMigration });
        if (generator === "security") return genSecurity({ force: options.force, skipMigration: options.skipMigration });
        if (["resource", "migration", "policy"].includes(generator) && !name) {
          throw new Error(`flare gen ${generator} needs a name, e.g. flare gen ${generator} ${generator === "migration" ? "add_phone_to_contacts" : "Contact"}`);
        }
        if (generator === "resource") return genResource(name!, { fields: options.fields, force: options.force });
        if (generator === "migration") return genMigration(name!, { fromSchema: options.fromSchema });
        if (generator === "policy") return genPolicy(name!, { roles: options.roles, deleteRoles: options.deleteRoles, force: options.force });
        throw new Error(`Unknown generator "${generator}". Available: resource, migration, policy, billing, security.`);
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
    .command("role:add <name>", "Register a role users can be assigned (local database unless --remote)")
    .option("--label <label>", "Display label (default: humanized name)")
    .option("--remote", "Target the deployed database")
    .option("--env <name>", "Wrangler environment")
    .example("flare role:add support")
    .action(async (name: string, options: { label?: string; remote?: boolean; env?: string }) => {
      process.exitCode = await addRole(name, options);
    });

  cli
    .command("user:role <email> <role>", "Set a user's role, e.g. make the first admin (local database unless --remote)")
    .option("--remote", "Target the deployed database")
    .option("--env <name>", "Wrangler environment")
    .example("flare user:role you@example.com admin")
    .action(async (email: string, role: string, options: { remote?: boolean; env?: string }) => {
      process.exitCode = await setUserRole(email, role, options);
    });

  cli
    .command("migrate", "Apply pending D1 migrations (local database unless --remote)")
    .option("--remote", "Target the deployed database")
    .option("--env <name>", "Wrangler environment")
    .option("--database <binding>", "D1 binding, when the app has several")
    .action(async (options: { remote?: boolean; env?: string; database?: string }) => {
      process.exitCode = await migrate(options);
    });

  cli
    .command("migrate:rollback", "Undo the most recently applied migrations")
    .option("--steps <n>", "How many migrations to roll back", { default: 1 })
    .option("--remote", "Target the deployed database (requires --yes)")
    .option("--yes", "Confirm a remote rollback")
    .option("--env <name>", "Wrangler environment")
    .option("--database <binding>", "D1 binding, when the app has several")
    .action(async (options: { steps: number | string; remote?: boolean; yes?: boolean; env?: string; database?: string }) => {
      process.exitCode = await rollback({ ...options, steps: Number(options.steps) });
    });

  cli
    .command("seed [...names]", "Run seed files from seeds/ against the local D1 database")
    .example("flare seed            # every seed, in file-name order")
    .example("flare seed contacts   # just seeds/contacts.seed.ts")
    .action(async (names: string[]) => {
      await runSeeds({ names });
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

  // Handled before parsing in index.ts (arguments are forwarded verbatim); registered here for --help.
  for (const [name, spec] of Object.entries(DELEGATED_COMMANDS)) {
    cli.command(`${name} [...args]`, spec.description).allowUnknownOptions();
  }

  cli.help();
  cli.version(FLARE_VERSION);
  return cli;
}
