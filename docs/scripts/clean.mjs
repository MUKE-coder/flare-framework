// Deploys start from a clean build: Astro's content cache doesn't notice changes to
// astro.config.mjs (code themes, for one) and would ship stale pages.
import { rmSync } from "node:fs";
for (const dir of ["dist", ".astro", "node_modules/.astro"]) rmSync(new URL(`../${dir}`, import.meta.url), { recursive: true, force: true });
