import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Resource } from "@flare/core";
import { createJiti } from "jiti";

export interface LoadedResource {
  resource: Resource;
  /** e.g. "resources/contact.resource.ts" */
  file: string;
  /** e.g. "contact" (the import name and file stem) */
  stem: string;
}

/** Load every `resources/*.resource.ts` descriptor of an app, sorted by file name. */
export async function loadResources(root: string): Promise<LoadedResource[]> {
  const appRoot = resolve(root);
  const dir = join(appRoot, "resources");
  if (!existsSync(dir)) return [];
  // A fresh loader each time, so edited descriptors are re-read.
  const jiti = createJiti(join(appRoot, "package.json"), { moduleCache: false, fsCache: false });

  const loaded: LoadedResource[] = [];
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".resource.ts")).sort()) {
    const path = join(dir, file);
    const mod = (await jiti.import(path)) as { default?: Resource };
    const resource = mod.default;
    if (!resource || typeof resource !== "object" || !("fields" in resource) || !("table" in resource)) {
      throw new Error(`resources/${file} must \`export default defineResource({ ... })\`.`);
    }
    loaded.push({ resource, file: `resources/${file}`, stem: file.replace(/\.resource\.ts$/, "") });
  }

  const byName = new Map<string, string>();
  for (const { resource, file } of loaded) {
    if (byName.has(resource.name)) throw new Error(`Resource "${resource.name}" is defined twice: ${byName.get(resource.name)} and ${file}.`);
    byName.set(resource.name, file);
  }
  return loaded;
}
