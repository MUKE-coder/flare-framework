import pc from "picocolors";
import { createCli } from "./cli.js";
import { isDelegatedCommand, runDelegated } from "./commands/run.js";

try {
  const [command, ...rest] = process.argv.slice(2);
  if (isDelegatedCommand(command)) {
    // Forward everything after the command verbatim (including --help) to vinext/wrangler,
    // rather than letting our own argument parser interpret or reject unknown flags.
    process.exitCode = await runDelegated(command, rest);
  } else {
    const cli = createCli();
    cli.parse(process.argv, { run: false });
    if (!cli.matchedCommand && cli.args.length === 0 && !cli.options.help && !cli.options.version) {
      cli.outputHelp();
    } else {
      await cli.runMatchedCommand();
    }
  }
} catch (error) {
  console.error(pc.red(`✖ ${error instanceof Error ? error.message : String(error)}`));
  process.exitCode = 1;
}
