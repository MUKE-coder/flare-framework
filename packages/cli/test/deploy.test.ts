import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { declaredSecretNames, parseDeployArgs, parseSecretNames, runDeploy } from "../src/commands/deploy.js";

describe("parseDeployArgs", () => {
  it("strips flare flags and captures the environment", () => {
    expect(parseDeployArgs(["--skip-secrets", "--env", "staging", "--name", "x"])).toEqual({
      forwarded: ["--env", "staging", "--name", "x"],
      skipMigrations: false,
      skipSecrets: true,
      skipSecurity: false,
      env: "staging",
      passthroughOnly: false,
    });
    expect(parseDeployArgs(["--env=prod", "--skip-migrations"])).toMatchObject({ env: "prod", skipMigrations: true });
    expect(parseDeployArgs(["--preview"]).env).toBe("preview");
  });

  it("treats --dry-run and --help as passthrough only", () => {
    expect(parseDeployArgs(["--dry-run"]).passthroughOnly).toBe(true);
    expect(parseDeployArgs(["--help"]).passthroughOnly).toBe(true);
  });
});

describe("output parsing", () => {
  it("reads secret names after wrangler's banner", () => {
    const output = ' ⛅️ wrangler 4.x\n────\n[\n  { "name": "BETTER_AUTH_SECRET", "type": "secret_text" }\n]\n';
    expect(parseSecretNames(output)).toEqual(["BETTER_AUTH_SECRET"]);
    expect(parseSecretNames("banner\n[]")).toEqual([]);
    expect(() => parseSecretNames("not logged in")).toThrow(/Unexpected output/);
  });

  it("lists uncommented variables from .dev.vars.example", () => {
    const example = "# comment\nBETTER_AUTH_SECRET=\n# BETTER_AUTH_URL=\nRESEND_API_KEY=\n  MAIL_FROM=\nlowercase=x\n";
    expect(declaredSecretNames(example)).toEqual(["BETTER_AUTH_SECRET", "RESEND_API_KEY", "MAIL_FROM"]);
  });
});

/** A fake wrangler: records each call (and stdin length) and answers from environment variables. */
const FAKE_WRANGLER = `
const fs = require("fs");
const args = process.argv.slice(2);
let stdin = "";
const finish = (code) => { fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, stdinLength: stdin.length }) + "\\n"); process.exit(code); };
const answer = () => {
  const cmd = args.slice(0, 2).join(" ");
  if (cmd === "d1 info") {
    if (process.env.FAKE_DB === "exists") { console.log("{}"); return finish(0); }
    if (process.env.FAKE_DB === "missing") { console.error("Couldn't find a D1 DB with name 'x'"); return finish(1); }
    console.error("Authentication error"); return finish(1);
  }
  if (cmd === "d1 migrations") return finish(Number(process.env.FAKE_MIGRATE_CODE || 0));
  if (cmd === "secret list") { console.log(" ⛅️ wrangler\\n" + (process.env.FAKE_SECRETS || "[]")); return finish(0); }
  if (cmd === "secret put") return finish(0);
  finish(99);
};
if (args[0] === "secret" && args[1] === "put") { process.stdin.on("data", (d) => (stdin += d)); process.stdin.on("end", answer); }
else answer();
`;

describe("runDeploy", () => {
  let appRoot: string;
  let logPath: string;
  let wranglerBin: string;
  const saved = { ...process.env };

  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), "flare-deploy-"));
    logPath = join(appRoot, "calls.log");
    wranglerBin = join(appRoot, "fake-wrangler.cjs");
    writeFileSync(wranglerBin, FAKE_WRANGLER);
    writeFileSync(logPath, "");
    mkdirSync(join(appRoot, "migrations"));
    writeFileSync(
      join(appRoot, "wrangler.jsonc"),
      `{
        // comments and URLs like https://example.com must not break parsing
        "name": "shop",
        "d1_databases": [{ "binding": "DB", "database_name": "shop-db", "migrations_dir": "migrations" }],
      }`,
    );
    writeFileSync(join(appRoot, ".dev.vars.example"), "BETTER_AUTH_SECRET=\nRESEND_API_KEY=\n");
    process.env.FAKE_LOG = logPath;
  });

  afterEach(() => {
    process.env = { ...saved };
    rmSync(appRoot, { recursive: true, force: true });
  });

  async function deploy(args: string[] = [], deployCode = 0) {
    const events: string[] = [];
    const messages: string[] = [];
    const code = await runDeploy(args, {
      appRoot,
      wranglerBin,
      deploy: async (forwarded) => {
        events.push(`deploy ${forwarded.join(" ")}`.trim());
        writeFileSync(logPath, readFileSync(logPath, "utf8") + JSON.stringify({ args: ["<deploy>"] }) + "\n");
        return deployCode;
      },
      log: (message) => messages.push(message),
    });
    const calls = readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { args: string[]; stdinLength?: number });
    return { code, calls, events, output: messages.join("\n") };
  }

  it("migrates an existing database before deploying, then generates the missing auth secret", async () => {
    process.env.FAKE_DB = "exists";
    const { code, calls, output } = await deploy();

    expect(code).toBe(0);
    expect(calls.map((c) => c.args.slice(0, 3).join(" "))).toEqual([
      "d1 info shop-db",
      "d1 migrations apply",
      "<deploy>",
      "secret list",
      "secret put BETTER_AUTH_SECRET",
    ]);
    expect(calls[1]!.args).toEqual(["d1", "migrations", "apply", "DB", "--remote"]);
    expect(calls[4]!.stdinLength).toBe(44); // base64 of 32 random bytes, sent via stdin, not argv
    expect(output).toContain("wrangler secret put RESEND_API_KEY");
  });

  it("on a first deploy, migrates after wrangler provisions the database", async () => {
    process.env.FAKE_DB = "missing";
    const { calls } = await deploy();
    expect(calls.map((c) => c.args.slice(0, 2).join(" "))).toEqual([
      "d1 info",
      "<deploy>",
      "d1 migrations",
      "secret list",
      "secret put",
    ]);
  });

  it("leaves existing secrets alone and forwards --env to wrangler", async () => {
    process.env.FAKE_DB = "exists";
    process.env.FAKE_SECRETS = '[{"name":"BETTER_AUTH_SECRET"},{"name":"RESEND_API_KEY"}]';
    const { calls, events, output } = await deploy(["--env", "staging"]);
    expect(calls.some((c) => c.args[1] === "put")).toBe(false);
    expect(calls.filter((c) => c.args[0] !== "<deploy>").every((c) => c.args.join(" ").endsWith("--env staging"))).toBe(true);
    expect(events).toEqual(["deploy --env staging"]);
    expect(output).not.toContain("Optional secrets");
  });

  it("aborts before deploying when a migration fails", async () => {
    process.env.FAKE_DB = "exists";
    process.env.FAKE_MIGRATE_CODE = "1";
    await expect(deploy()).rejects.toThrow(/Migrations failed for shop-db/);
    const calls = readFileSync(logPath, "utf8");
    expect(calls).not.toContain("<deploy>");
  });

  it("aborts on unexpected database lookup errors instead of assuming a first deploy", async () => {
    process.env.FAKE_DB = "auth-error";
    await expect(deploy()).rejects.toThrow(/Authentication error/);
  });

  it("stops after a failed deploy", async () => {
    process.env.FAKE_DB = "missing";
    const { code, calls } = await deploy([], 1);
    expect(code).toBe(1);
    expect(calls.map((c) => c.args[0])).toEqual(["d1", "<deploy>"]);
  });

  it("does nothing remote for --dry-run and honours skip flags", async () => {
    expect((await deploy(["--dry-run"])).calls.map((c) => c.args[0])).toEqual(["<deploy>"]);
    writeFileSync(logPath, "");
    expect((await deploy(["--skip-migrations", "--skip-secrets"])).calls.map((c) => c.args[0])).toEqual(["<deploy>"]);
  });
});
