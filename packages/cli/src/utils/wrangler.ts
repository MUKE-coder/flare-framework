import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";

export interface WranglerResult {
  code: number;
  output: string;
}

/**
 * Run the app's wrangler with our own Node. stdin is closed unless `stdin` is given, so
 * wrangler uses its non-interactive defaults instead of prompting.
 */
export function runWrangler(
  wranglerBin: string,
  args: string[],
  cwd: string,
  options: { capture?: boolean; stdin?: string } = {},
): Promise<WranglerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wranglerBin, ...args], {
      cwd,
      stdio: [options.stdin !== undefined ? "pipe" : "ignore", options.capture ? "pipe" : "inherit", options.capture ? "pipe" : "inherit"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk));
    child.stderr?.on("data", (chunk) => (output += chunk));
    if (options.stdin !== undefined) child.stdin!.end(options.stdin);
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code: code ?? 1, output }));
  });
}

/** The JSON value in wrangler output that may be preceded by its banner. */
export function extractJson<T>(output: string, open: "[" | "{" = "["): T {
  const close = open === "[" ? "]" : "}";
  const start = output.indexOf(open);
  const end = output.lastIndexOf(close);
  if (start === -1 || end < start) throw new Error(`Expected JSON from wrangler, got:\n${output.trim()}`);
  return JSON.parse(output.slice(start, end + 1)) as T;
}

export interface D1Database {
  binding: string;
  database_name: string;
  migrations_dir?: string;
}

export function readD1Databases(appRoot: string): D1Database[] {
  const path = join(appRoot, "wrangler.jsonc");
  if (!existsSync(path)) return [];
  const config = parseJsonc(readFileSync(path, "utf8")) as { d1_databases?: D1Database[] } | undefined;
  return (config?.d1_databases ?? []).filter((db) => db.binding && db.database_name);
}
