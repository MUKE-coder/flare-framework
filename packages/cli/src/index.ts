import pc from "picocolors";
import { createCli } from "./cli.js";

const cli = createCli();

try {
  cli.parse(process.argv, { run: false });
  if (!cli.matchedCommand && cli.args.length === 0 && !cli.options.help && !cli.options.version) {
    cli.outputHelp();
  } else {
    await cli.runMatchedCommand();
  }
} catch (error) {
  console.error(pc.red(`✖ ${error instanceof Error ? error.message : String(error)}`));
  process.exitCode = 1;
}
