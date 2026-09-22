import cli from "../../packages/cli/package.json";

/** The Flare release these docs describe: the CLI's version, read at build time. */
export const FLARE_VERSION: string = cli.version;
export const RELEASE_URL = `https://github.com/MUKE-coder/flare-framework/releases/tag/v${FLARE_VERSION}`;
