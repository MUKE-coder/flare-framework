import { cac } from "cac";
import { FLARE_VERSION } from "@flare/core";
import { createApp, printNextSteps } from "./commands/create.js";

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

  cli.help();
  cli.version(FLARE_VERSION);
  return cli;
}
