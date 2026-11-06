import { describe, expect, it } from "vitest";
import { configuredSignup } from "../src/commands/deploy.js";
import { parseSignup } from "../src/commands/create.js";
import { generatePassword, userAddSql } from "../src/commands/user-add.js";
import { credentialUserRows } from "@flaredev/core";

describe("parseSignup (#16)", () => {
  it("defaults to open", () => {
    // Deliberate: a new resource is admin-only and the first account is the admin, so a
    // stranger who signs up reaches nothing. `invite` is one flag away.
    expect(parseSignup(undefined)).toBe("open");
  });

  it("takes the three modes, however they are typed", () => {
    expect(parseSignup("invite")).toBe("invite");
    expect(parseSignup("CLOSED")).toBe("closed");
    expect(parseSignup("  open  ")).toBe("open");
  });

  it("refuses anything else rather than falling back to open", () => {
    // Falling back would be the dangerous reading: `--signup=invte` would silently leave
    // sign-up open on an app that asked for it to be closed.
    expect(() => parseSignup("invte")).toThrow(/Use open, invite or closed/);
    expect(() => parseSignup("")).toThrow();
  });
});

describe("generatePassword (#16)", () => {
  it("is long enough not to need rotating immediately", () => {
    expect(generatePassword()).toHaveLength(24);
    expect(generatePassword(40)).toHaveLength(40);
  });

  it("avoids the characters that get lost between a terminal and a chat message", () => {
    // No l/I/1/0/O: a password somebody has to retype from a screenshot.
    for (let attempt = 0; attempt < 50; attempt++) expect(generatePassword(64)).not.toMatch(/[lI1O0]/);
  });

  it("is different every time", () => {
    const seen = new Set(Array.from({ length: 20 }, () => generatePassword()));
    expect(seen.size).toBe(20);
  });
});

describe("userAddSql (#16)", () => {
  it("puts the user id in account_id, not the email", async () => {
    // The subtle one: Better Auth looks a credential account up by the user id. An email
    // there gives a row that looks right, hashes correctly, and cannot sign in.
    const rows = await credentialUserRows({ email: "Ada@Example.com", password: "correct-horse-battery-staple", role: "admin" });
    const sql = userAddSql(rows);
    expect(rows.account.accountId).toBe(rows.user.id);
    expect(sql).toContain(`'${rows.user.id}'`);
    expect(sql).not.toMatch(/account_id, provider_id, user_id, password[\s\S]*'ada@example\.com'/);
  });

  it("writes both rows: the user and the credential account", async () => {
    const rows = await credentialUserRows({ email: "ada@example.com", password: "correct-horse-battery-staple" });
    const sql = userAddSql(rows);
    expect(sql).toContain('INSERT INTO "user"');
    expect(sql).toContain("INSERT INTO account");
    expect(sql).toContain("'credential'");
  });

  it("stores a hash, never the password", async () => {
    const rows = await credentialUserRows({ email: "ada@example.com", password: "correct-horse-battery-staple" });
    const sql = userAddSql(rows);
    expect(sql).not.toContain("correct-horse-battery-staple");
    expect(rows.account.password).toBeTruthy();
  });

  it("lower-cases the email, so sign-in finds it however it was typed", async () => {
    const rows = await credentialUserRows({ email: "  Ada@Example.COM ", password: "correct-horse-battery-staple" });
    expect(rows.user.email).toBe("ada@example.com");
  });

  it("writes NULL rather than an empty role when none was given", async () => {
    const rows = await credentialUserRows({ email: "ada@example.com", password: "correct-horse-battery-staple" });
    expect(userAddSql(rows)).toMatch(/NULL,/);
  });

  it("escapes a quote in a name instead of breaking the statement", async () => {
    const rows = await credentialUserRows({ email: "ada@example.com", password: "x".repeat(20), name: "O'Hara" });
    expect(userAddSql(rows)).toContain("'O''Hara'");
  });
});

describe("configuredSignup (#16)", () => {
  it("reads the mode out of an auth-config file", () => {
    const source = [
      "export const authConfig = {",
      '  signup: "invite" as SignupMode,',
      "  magicLink: true,",
      "};",
    ].join("\n");
    expect(configuredSignup(source)).toBe("invite");
  });

  it("reads it however it is spaced", () => {
    expect(configuredSignup('signup:"closed"')).toBe("closed");
    expect(configuredSignup("signup :  \"open\"")).toBe("open");
  });

  it("says it cannot tell rather than assuming open", () => {
    // Assuming would be the dangerous reading: an app whose config it could not parse
    // would be reported as open whatever it actually is.
    expect(configuredSignup("export const authConfig = { magicLink: true };")).toBeUndefined();
    expect(configuredSignup('signup: "sometimes"')).toBeUndefined();
  });
});
