import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { templatesDir } from "../src/utils/fs.js";

const base = readFileSync(join(templatesDir, "next", "prisma", "schema", "base.prisma"), "utf8");

/**
 * Better Auth checks the Prisma schema when it starts and refuses to run if a column it
 * needs is missing — which is a 500 on every page, not a warning. These are the columns
 * the configured plugins asked for, taken from `@better-auth/cli generate`.
 */
describe("the Next.js stack's base schema", () => {
  it("has the tables Better Auth needs", () => {
    for (const model of ["User", "Session", "Account", "Verification", "Passkey", "TwoFactor"]) {
      expect(base).toContain(`model ${model} {`);
    }
  });

  it("has the two-factor columns Better Auth refuses to start without", () => {
    for (const column of ["verified", "failedVerificationCount", "lockedUntil"]) {
      expect(base).toContain(column);
    }
  });

  it("has the tables the dashboard's own features need", () => {
    expect(base).toContain("model AuditLog {");
    expect(base).toContain("model SavedView {");
  });

  it("declares the generator and datasource, since the generated half must not", () => {
    expect(base).toContain('provider = "prisma-client"');
    expect(base).toContain('provider = "postgresql"');
    // Prisma 7 keeps the connection string in prisma.config.ts.
    expect(base).not.toMatch(/url\s*=/);
  });
});

describe("the Next.js stack's database client", () => {
  const db = readFileSync(join(templatesDir, "next", "lib", "db.ts"), "utf8");

  it("uses the ordinary Postgres driver, not a serverless one", () => {
    // The Neon serverless adapter speaks Neon's own protocol and can't reach a Postgres
    // on localhost, which makes developing against a container impossible.
    expect(db).toContain('from "@prisma/adapter-pg"');
    // The comment explains why the Neon driver isn't used, so only the import counts.
    expect(db).not.toContain('from "@prisma/adapter-neon"');
  });

  it("keeps one client across dev reloads, so the connection limit survives editing", () => {
    expect(db).toContain("globalForPrisma");
  });
});

/**
 * Realtime has no implementation on this stack — Vercel functions can't hold a websocket
 * open. That is a defensible gap; a publish that quietly returns is not, because the
 * calling code reads as though it worked and there is nothing to search for.
 */
describe("the Next.js stack's realtime stub", () => {
  const realtime = readFileSync(join(templatesDir, "next", "lib", "realtime.ts"), "utf8");

  it("warns instead of dropping a publish in silence", () => {
    expect(realtime).toContain("console.warn");
    expect(realtime).toMatch(/did nothing/);
    // Name the channel and event, or the warning can't be traced to a call site.
    expect(realtime).toContain("${name}");
    expect(realtime).toContain("${event}");
  });

  it("says the write still succeeded, and where to change this", () => {
    expect(realtime).toContain("The write itself succeeded");
    expect(realtime).toContain("lib/realtime.ts");
  });

  it("warns once per channel, not once per publish", () => {
    // A publish in an afterCreate hook runs on every write; a warning per write would
    // bury the log it is trying to be useful in.
    expect(realtime).toContain("warned.has(name)");
    expect(realtime).toContain("warned.add(name)");
  });

  it("still resolves, so a hook that publishes cannot fail a write", () => {
    expect(realtime).not.toContain("throw");
    expect(realtime).toMatch(/publish: async \(event\) =>/);
  });
});
