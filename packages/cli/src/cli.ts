import { cac } from "cac";
import { FLARE_VERSION } from "@flare/core";
import { createApp, printNextSteps } from "./commands/create.js";
import { genResource } from "./commands/gen.js";
import { migrate, rollback } from "./commands/migrate.js";
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
    .command("gen <generator> <name>", "Generate code. Generators: resource")
    .option("--fields <fields>", 'Resource fields, e.g. "name:string, email:string!, status:enum(lead,customer)"')
    .example('flare gen resource Contact --fields "name:string, email:string!, company:belongsTo(Company)?"')
    .action((generator: string, name: string, options: { fields?: string }) => {
      if (generator !== "resource") throw new Error(`Unknown generator "${generator}". Available: resource.`);
      return genResource(name, { fields: options.fields });
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

  // Handled before parsing in index.ts (arguments are forwarded verbatim); registered here for --help.
  for (const [name, spec] of Object.entries(DELEGATED_COMMANDS)) {
    cli.command(`${name} [...args]`, spec.description).allowUnknownOptions();
  }

  cli.help();
  cli.version(FLARE_VERSION);
  return cli;
}
