import { createCli } from "./cli.js";

const cli = createCli();
cli.parse(process.argv, { run: false });

if (!cli.matchedCommand && cli.args.length === 0 && !cli.options.help && !cli.options.version) {
  cli.outputHelp();
} else {
  await cli.runMatchedCommand();
}
