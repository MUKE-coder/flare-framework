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
