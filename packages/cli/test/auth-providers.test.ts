import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseAuthProviders, socialProvidersCode } from "../src/auth-providers.js";
import { createApp } from "../src/commands/create.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("parseAuthProviders", () => {
  it("parses, normalizes, and de-duplicates", () => {
    expect(parseAuthProviders(" Google, github ,google")).toEqual(["google", "github"]);
  });

  it("returns an empty list when omitted", () => {
    expect(parseAuthProviders(undefined)).toEqual([]);
    expect(parseAuthProviders("")).toEqual([]);
  });

  it("rejects unknown providers with the supported list", () => {
    expect(() => parseAuthProviders("google,twitter,myspace")).toThrow(
      "Unknown auth providers: twitter, myspace. Supported: google, github.",
    );
  });
});

describe("socialProvidersCode", () => {
  it("is an empty object without providers", () => {
    expect(socialProvidersCode([])).toBe("{}");
  });

  it("gates each provider on its credentials", () => {
    const code = socialProvidersCode(["github"]);
    expect(code).toContain(
      "...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } } : {}),",
    );
  });
});

describe("create --auth-providers", () => {
  function scaffold(authProviders?: string) {
    const root = mkdtempSync(join(tmpdir(), "flare-oauth-"));
    dirs.push(root);
    const dir = join(root, "app");
    createApp(dir, { install: false, pm: "pnpm", authProviders });
    const read = (file: string) => readFileSync(join(dir, file), "utf8");
    return { auth: read("lib/auth.ts"), devVars: read(".dev.vars"), example: read(".dev.vars.example") };
  }

  it("scaffolds provider config, env placeholders, and callback docs", () => {
    const { auth, devVars, example } = scaffold("google,github");
    expect(auth).toContain("{ google: { clientId: env.GOOGLE_CLIENT_ID");
    expect(auth).toContain("{ github: { clientId: env.GITHUB_CLIENT_ID");
    expect(auth).not.toMatch(/__[A-Z_]+__/);
    expect(devVars).toMatch(/GOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nGITHUB_CLIENT_ID=\nGITHUB_CLIENT_SECRET=\n$/);
    expect(example).toContain("# Callback URL: <your app URL>/api/auth/callback/google");
    expect(example).toContain("# Callback URL: <your app URL>/api/auth/callback/github");
  });

  it("scaffolds no providers by default", () => {
    const { auth, devVars } = scaffold();
    expect(auth).toContain("socialProviders: {},");
    expect(devVars).not.toContain("CLIENT_ID");
  });

  it("fails before writing anything for an unknown provider", () => {
    const root = mkdtempSync(join(tmpdir(), "flare-oauth-"));
    dirs.push(root);
    expect(() => createApp(join(root, "app"), { install: false, authProviders: "twitter" })).toThrow(/Unknown auth provider/);
    expect(() => readFileSync(join(root, "app/package.json"))).toThrow();
  });
});
