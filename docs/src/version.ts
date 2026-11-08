import cli from "../../packages/cli/package.json";

/** The Flare release these docs describe: the CLI's version, read at build time. */
export const FLARE_VERSION: string = cli.version;
export const RELEASE_URL = `https://github.com/MUKE-coder/flare-framework/releases/tag/v${FLARE_VERSION}`;

/**
 * What this release is about, in a few words.
 *
 * Kept here rather than in the pages so there is one line to change per release, and so
 * the version beside it can never disagree with the version in package.json. The hero
 * pill reads it.
 */
export const RELEASE_HEADLINE = "Roles that cover the dashboard itself, not just your resources";
