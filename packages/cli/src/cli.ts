import { cac } from "cac";
import { FLARE_VERSION } from "@flare/core";
import { createApp, printNextSteps } from "./commands/create.js";
import { genResource } from "./commands/gen.js";
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
      genResource(name, { fields: options.fields });
    });

  // Handled before parsing in index.ts (arguments are forwarded verbatim); registered here for --help.
  for (const [name, spec] of Object.entries(DELEGATED_COMMANDS)) {
    cli.command(`${name} [...args]`, spec.description).allowUnknownOptions();
  }

  cli.help();
  cli.version(FLARE_VERSION);
  return cli;
}
