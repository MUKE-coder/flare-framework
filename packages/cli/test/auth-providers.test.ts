import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_AUTH_METHODS, parseAuthMethods, parseAuthProviders, renderAuthConfig } from "../src/auth-providers.js";
import { createApp } from "../src/commands/create.js";
import { parseTheme } from "../src/themes.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("parseAuthProviders", () => {
  it("parses, normalizes, and de-duplicates", () => {
    expect(parseAuthProviders(" Google, github ,google, APPLE, microsoft")).toEqual(["google", "github", "apple", "microsoft"]);
  });

  it("returns an empty list when omitted", () => {
    expect(parseAuthProviders(undefined)).toEqual([]);
    expect(parseAuthProviders("")).toEqual([]);
  });

  it("rejects unknown providers with the supported list", () => {
    expect(() => parseAuthProviders("google,twitter,myspace")).toThrow(
      "Unknown auth providers: twitter, myspace. Supported: google, github, apple, microsoft.",
    );
  });
});

describe("parseAuthMethods", () => {
  it("defaults to every method, and accepts all / none / a list", () => {
    expect(parseAuthMethods(undefined)).toEqual(DEFAULT_AUTH_METHODS);
    expect(parseAuthMethods("all")).toEqual(DEFAULT_AUTH_METHODS);
    expect(parseAuthMethods("none")).toEqual([]);
    expect(parseAuthMethods("passkeys, 2fa-app")).toEqual(["passkeys", "2fa-app"]);
    expect(() => parseAuthMethods("passkeys,sms")).toThrow(/Unknown sign-in method: sms/);
  });
});

describe("renderAuthConfig", () => {
  it("switches each method on or off and lists the providers", () => {
    const config = renderAuthConfig(["magic-link", "2fa-app"], ["google", "github"]);
    expect(config).toContain("magicLink: true,");
    expect(config).toContain("emailOtp: false,");
    expect(config).toContain("passkeys: false,");
    expect(config).toContain("authenticator: true,");
    expect(config).toContain("email: false,");
    expect(config).toContain('social: ["google", "github"] as SocialProvider[],');
  });
});

describe("parseTheme", () => {
  it("accepts the six themes and rejects others", () => {
    expect(parseTheme(undefined)).toBe("default");
    expect(parseTheme("Mono")).toBe("mono");
    expect(() => parseTheme("airbnb")).toThrow(/Themes: default, coral, amber, sky, mono, emerald/);
  });
});

describe("create with auth and theme choices", () => {
  function scaffold(options: { authProviders?: string; auth?: string; theme?: string } = {}) {
    const root = mkdtempSync(join(tmpdir(), "flare-oauth-"));
    dirs.push(root);
    const dir = join(root, "app");
    createApp(dir, { install: false, pm: "pnpm", ...options });
    const read = (file: string) => readFileSync(join(dir, file), "utf8");
    return { config: read("lib/auth-config.ts"), site: read("lib/site.ts"), auth: read("lib/auth.ts"), devVars: read(".dev.vars"), example: read(".dev.vars.example") };
  }

  it("writes the chosen providers, env placeholders and callback docs", () => {
    const { config, devVars, example, auth } = scaffold({ authProviders: "google,microsoft" });
    expect(config).toContain('social: ["google", "microsoft"] as SocialProvider[],');
    expect(devVars).toMatch(/GOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nMICROSOFT_CLIENT_ID=\nMICROSOFT_CLIENT_SECRET=\n$/);
    expect(example).toContain("# Callback URL: <your app URL>/api/auth/callback/google");
    expect(example).toContain("MICROSOFT_TENANT_ID=");
    expect(auth).not.toMatch(/__[A-Z_]+__/);
  });

  it("switches every method on and no providers by default, with the default theme", () => {
    const { config, devVars, site } = scaffold();
    expect(config).toContain("magicLink: true,");
    expect(config).toContain("passkeys: true,");
    expect(config).toContain("social: [] as SocialProvider[],");
    expect(devVars).not.toContain("CLIENT_ID");
    expect(site).toContain('theme: "default" as ThemeName,');
  });

  it("writes the chosen theme and methods", () => {
    const { config, site } = scaffold({ theme: "emerald", auth: "passkeys" });
    expect(site).toContain('theme: "emerald" as ThemeName,');
    expect(config).toContain("passkeys: true,");
    expect(config).toContain("magicLink: false,");
  });

  it("fails before writing anything for an unknown provider or theme", () => {
    const root = mkdtempSync(join(tmpdir(), "flare-oauth-"));
    dirs.push(root);
    expect(() => createApp(join(root, "app"), { install: false, authProviders: "twitter" })).toThrow(/Unknown auth provider/);
    expect(() => createApp(join(root, "app"), { install: false, theme: "neon" })).toThrow(/Unknown theme/);
    expect(() => readFileSync(join(root, "app/package.json"))).toThrow();
  });
});
