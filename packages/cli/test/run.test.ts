import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { delegatedArgv, findAppRoot, isDelegatedCommand, resolveBin } from "../src/commands/run.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(path: string, content: unknown) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, typeof content === "string" ? content : JSON.stringify(content));
}

/** A fake app with vinext, wrangler and @vinext/cloudflare "installed" in a parent node_modules (like a pnpm workspace). */
function fakeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "flare-run-"));
  dirs.push(root);
  const app = join(root, "examples", "shop");
  write(join(app, "package.json"), { name: "shop", dependencies: { vinext: "1.0.0" } });
  write(join(root, "node_modules/vinext/package.json"), { name: "vinext", bin: { vinext: "dist/cli.js" } });
  write(join(root, "node_modules/wrangler/package.json"), { name: "wrangler", bin: { wrangler: "bin/wrangler.js", wrangler2: "bin/wrangler.js" } });
  write(join(root, "node_modules/@vinext/cloudflare/package.json"), { name: "@vinext/cloudflare", bin: { "vinext-cloudflare": "dist/cli.js" } });
  return { root, app };
}

describe("isDelegatedCommand", () => {
  it("recognises only the delegated verbs", () => {
    for (const verb of ["dev", "build", "start", "deploy"]) expect(isDelegatedCommand(verb)).toBe(true);
    for (const verb of ["create", "toString", "constructor", undefined]) expect(isDelegatedCommand(verb)).toBe(false);
  });
});

describe("findAppRoot", () => {
  it("finds the nearest package that depends on vinext, from a nested directory", () => {
    const { app } = fakeWorkspace();
    const nested = join(app, "app", "dashboard");
    mkdirSync(nested, { recursive: true });
    expect(findAppRoot(nested)).toBe(app);
  });

  it("skips package.json files that don't depend on vinext", () => {
    const { app } = fakeWorkspace();
    const lib = join(app, "packages", "lib");
    write(join(lib, "package.json"), { name: "lib" });
    expect(findAppRoot(lib)).toBe(app);
  });

  it("explains when run outside an app", () => {
    const dir = mkdtempSync(join(tmpdir(), "flare-run-empty-"));
    dirs.push(dir);
    expect(() => findAppRoot(dir)).toThrow(/Not inside a Flare app/);
  });
});

describe("resolveBin / delegatedArgv", () => {
  it("resolves bins from a parent node_modules", () => {
    const { root, app } = fakeWorkspace();
    expect(resolveBin(app, "wrangler", "wrangler")).toBe(join(root, "node_modules/wrangler/bin/wrangler.js"));
  });

  it("builds the delegated argv with forwarded arguments last", () => {
    const { root, app } = fakeWorkspace();
    expect(delegatedArgv(app, "dev", ["--port", "4000"])).toEqual([
      join(root, "node_modules/vinext/dist/cli.js"),
      "dev",
      "--port",
      "4000",
    ]);
    expect(delegatedArgv(app, "start", [])).toEqual([
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      "dev",
      "--config",
      "dist/server/wrangler.json",
      "--persist-to",
      ".wrangler/state",
    ]);
    expect(delegatedArgv(app, "deploy", ["--dry-run", "--name", "my app"])).toEqual([
      join(root, "node_modules/@vinext/cloudflare/dist/cli.js"),
      "deploy",
      "--config",
      "dist/server/wrangler.json",
      "--dry-run",
      "--name",
      "my app",
    ]);
  });

  it("tells the user to install when a package is missing", () => {
    const { app } = fakeWorkspace();
    expect(() => resolveBin(app, "not-installed", "x")).toThrow(/Install dependencies first/);
  });
});
