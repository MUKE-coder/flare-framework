import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { genApiKeys } from "../src/commands/gen-apikeys.js";
import { genSecurity } from "../src/commands/gen-security.js";
import { existingNavLinks, renderNavBlock } from "../src/generator/nav.js";
import { API_KEY_PACKAGE, BETTER_AUTH_VERSION } from "../src/versions.js";

const scratch = mkdtempSync(join(import.meta.dirname, ".tmp-apikeys-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const quiet = { log: () => {}, skipMigration: true };
const read = (root: string, path: string) => readFileSync(join(root, path), "utf8");
const template = join(import.meta.dirname, "../templates/app");

/** Enough of an app for the generator: the files it edits, from the real templates. */
function app(stack: "cloudflare" | "next" = "cloudflare") {
  const root = join(scratch, `app-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, "lib"), { recursive: true });
  mkdirSync(join(root, "db"), { recursive: true });
  mkdirSync(join(root, "prisma/schema"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "shop", dependencies: { vinext: "1", "better-auth": "1.7.5" }, flare: { stack } }, null, 2),
  );
  for (const file of ["lib/dashboard-nav.ts", "lib/api-keys.ts", "lib/auth.ts"]) copyFileSync(join(template, file), join(root, file));
  // Just the shape addTable looks for; the real file is 200 lines of other tables.
  writeFileSync(join(root, "db/auth-schema.ts"), 'import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";\n\nexport const user = sqliteTable("user", {});\n');
  writeFileSync(join(root, "prisma/schema/base.prisma"), "model User {\n  id String @id\n}\n");
  return root;
}

describe("flare gen apikeys", () => {
  it("writes the dashboard screen and links to it", async () => {
    const root = app();
    await genApiKeys({ cwd: root, ...quiet });
    for (const file of ["app/dashboard/api-keys/page.tsx", "app/dashboard/api-keys/actions.ts", "app/dashboard/api-keys/key-controls.tsx"]) {
      expect(() => read(root, file), file).not.toThrow();
    }
    expect(read(root, "lib/dashboard-nav.ts")).toContain('href: "/dashboard/api-keys"');
  });

  it("puts apiKey() before nextCookies(), which has to stay last", async () => {
    const root = app();
    await genApiKeys({ cwd: root, ...quiet });
    const auth = read(root, "lib/auth.ts");
    expect(auth).toContain(`import { apiKey } from "${API_KEY_PACKAGE}";`);
    // nextCookies is what lets a server action set a cookie; a plugin after it never runs.
    expect(auth.indexOf("apiKey(")).toBeLessThan(auth.indexOf("nextCookies()"));
  });

  it("does not switch on enableSessionForAPIKeys", async () => {
    const root = app();
    await genApiKeys({ cwd: root, ...quiet });
    // The plugin's own documentation advises against it in production: it mocks a session
    // for any request carrying a valid key. lib/api-keys.ts verifies explicitly instead.
    expect(read(root, "lib/auth.ts")).not.toContain("enableSessionForAPIKeys");
    expect(read(root, "lib/api-keys.ts")).toContain("verifyApiKey");
  });

  it("raises every Better Auth package to one version, because the plugin pins it", async () => {
    const root = app();
    await genApiKeys({ cwd: root, ...quiet });
    const pkg = JSON.parse(read(root, "package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies[API_KEY_PACKAGE]).toBe(BETTER_AUTH_VERSION);
    expect(pkg.dependencies["better-auth"]).toBe(BETTER_AUTH_VERSION);
  });

  it("adds the table to the schema of whichever stack it is on", async () => {
    const cloudflare = app("cloudflare");
    await genApiKeys({ cwd: cloudflare, ...quiet });
    expect(read(cloudflare, "db/auth-schema.ts")).toContain('sqliteTable(\n  "apikey"');
    expect(read(cloudflare, "prisma/schema/base.prisma")).not.toContain("model ApiKey");

    const next = app("next");
    await genApiKeys({ cwd: next, ...quiet });
    expect(read(next, "prisma/schema/base.prisma")).toContain("model ApiKey {");
    expect(read(next, "db/auth-schema.ts")).not.toContain("apikey");
  });

  it("can be run twice without duplicating anything", async () => {
    const root = app();
    await genApiKeys({ cwd: root, ...quiet });
    await genApiKeys({ cwd: root, ...quiet });
    const auth = read(root, "lib/auth.ts");
    expect(auth.match(/apiKey\(\{/g) ?? []).toHaveLength(1);
    expect(auth.match(/import \{ apiKey \}/g) ?? []).toHaveLength(1);
    expect(read(root, "db/auth-schema.ts").match(/"apikey"/g) ?? []).toHaveLength(1);
  });

  it("skips the dependency when asked, for an install-free run", async () => {
    const root = app();
    await genApiKeys({ cwd: root, ...quiet, skipInstall: true });
    const pkg = JSON.parse(read(root, "package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies[API_KEY_PACKAGE]).toBeUndefined();
  });
});

describe("the dashboard nav block", () => {
  it("keeps the links other generators added", async () => {
    // This was a real collision: gen security rendered the array with only its own entry,
    // so whichever generator ran second removed the first one's link.
    const root = app();
    await genSecurity({ cwd: root, ...quiet });
    await genApiKeys({ cwd: root, ...quiet });
    const nav = read(root, "lib/dashboard-nav.ts");
    expect(nav).toContain('href: "/dashboard/security"');
    expect(nav).toContain('href: "/dashboard/api-keys"');

    // And in the other order.
    const other = app();
    await genApiKeys({ cwd: other, ...quiet });
    await genSecurity({ cwd: other, ...quiet });
    const both = read(other, "lib/dashboard-nav.ts");
    expect(both).toContain('href: "/dashboard/security"');
    expect(both).toContain('href: "/dashboard/api-keys"');
  });

  it("reads the links already in a file", () => {
    const source = 'export const generatedDashboardLinks: DashboardLink[] = [{ label: "Security", href: "/dashboard/security", icon: "shield" }];';
    expect(existingNavLinks(source)).toEqual([{ label: "Security", href: "/dashboard/security", icon: "shield" }]);
    expect(existingNavLinks("export const generatedDashboardLinks: DashboardLink[] = [];")).toEqual([]);
    expect(existingNavLinks("nothing here")).toEqual([]);
  });

  it("replaces a link rather than listing the same page twice", () => {
    const source = 'export const generatedDashboardLinks: DashboardLink[] = [{ label: "Keys", href: "/dashboard/api-keys", icon: "key" }];';
    const block = renderNavBlock(source, [{ label: "API keys", href: "/dashboard/api-keys", icon: "key-round" }]);
    expect(block.match(/\/dashboard\/api-keys/g) ?? []).toHaveLength(1);
    expect(block).toContain('label: "API keys"');
  });

  it("sorts by label, so the order does not depend on which generator ran first", () => {
    const block = renderNavBlock("", [
      { label: "Security", href: "/dashboard/security", icon: "shield" },
      { label: "API keys", href: "/dashboard/api-keys", icon: "key-round" },
    ]);
    expect(block.indexOf('"API keys"')).toBeLessThan(block.indexOf('"Security"'));
  });
});
