import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import pc from "picocolors";
import { descriptorPath, renderDescriptor, resourceName } from "../generator/descriptor.js";
import { parseFields } from "../generator/grammar.js";
import { findAppRoot } from "./run.js";

export interface GenResourceOptions {
  fields?: string;
  cwd?: string;
  log?: (message: string) => void;
}

export interface GenResult {
  name: string;
  written: string[];
}

export function genResource(rawName: string, options: GenResourceOptions): GenResult {
  const log = options.log ?? ((message: string) => console.log(message));
  const appRoot = findAppRoot(options.cwd ?? process.cwd());
  const name = resourceName(rawName);
  if (!options.fields) throw new Error(`--fields is required, e.g. flare gen resource ${name} --fields "name:string, email:string"`);

  const fields = parseFields(options.fields);
  const relativePath = descriptorPath(name);
  const path = join(appRoot, relativePath);
  if (existsSync(path)) throw new Error(`${relativePath} already exists.`);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderDescriptor(name, fields));
  log(`${pc.green("create")} ${relativePath}`);
  return { name, written: [relativePath] };
}
