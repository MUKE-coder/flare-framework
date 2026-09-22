import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pc from "picocolors";
import { parseTheme, THEMES } from "../themes.js";
import { findAppRoot } from "./run.js";

const THEME_LINE = /theme: "([a-z]+)" as ThemeName,/;

/** `flare theme` lists the themes; `flare theme <name>` switches lib/site.ts to it. */
export function setTheme(name: string | undefined, cwd = process.cwd(), log: (message: string) => void = console.log): void {
  const appRoot = findAppRoot(cwd);
  const path = join(appRoot, "lib/site.ts");
  if (!existsSync(path)) throw new Error("lib/site.ts not found: this app was created before themes. Add it from the Flare app template.");
  const source = readFileSync(path, "utf8");
  const current = THEME_LINE.exec(source)?.[1];

  if (!name) {
    for (const [theme, description] of Object.entries(THEMES)) {
      log(`${theme === current ? pc.green("●") : " "} ${theme.padEnd(8)} ${pc.dim(description)}`);
    }
    log(pc.dim("\nSwitch with `flare theme <name>`. FLARE_THEME in .env overrides it for a build."));
    return;
  }
  const theme = parseTheme(name);
  if (!current) throw new Error('lib/site.ts has no `theme: "…" as ThemeName,` line to change.');
  writeFileSync(path, source.replace(THEME_LINE, `theme: "${theme}" as ThemeName,`));
  log(`${pc.green("✔")} Theme is now ${pc.bold(theme)}. Restart \`flare dev\` (or rebuild) to see it.`);
}
