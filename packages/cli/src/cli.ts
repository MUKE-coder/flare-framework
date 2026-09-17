import { cac } from "cac";
import { FLARE_VERSION } from "@flare/core";

export function createCli() {
  const cli = cac("flare");
  cli.help();
  cli.version(FLARE_VERSION);
  return cli;
}
