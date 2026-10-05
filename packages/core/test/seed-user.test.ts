import { describe, expect, it } from "vitest";
import { credentialUserRows } from "../src/seed.js";
import { verifyPassword } from "../src/password.js";

/**
 * Seeding somebody you can sign in as.
 *
 * Better Auth finds a credential account by `accountId`, and for a password account that
 * column holds the user's own id. A hand-written seed usually puts the email there, which
 * leaves a row that looks right and a sign-in that answers "User not found".
 */
describe("the rows a credential user needs", () => {
  const input = { email: "Ada@Example.com", password: "correct-horse-battery" };

  it("puts the user's id in accountId, not the email", async () => {
    const { user, account } = await credentialUserRows(input);
    expect(account.accountId).toBe(user.id);
    expect(account.accountId).not.toBe(user.email);
  });

  it("points the account at the user and names the provider", async () => {
    const { user, account } = await credentialUserRows(input);
    expect(account.userId).toBe(user.id);
    expect(account.providerId).toBe("credential");
    // Its own primary key, not shared with the user.
    expect(account.id).not.toBe(user.id);
  });

  it("stores a hash the sign-in route can verify", async () => {
    const { account } = await credentialUserRows(input);
    expect(account.password).not.toBe(input.password);
    expect(await verifyPassword({ hash: account.password, password: input.password })).toBe(true);
    expect(await verifyPassword({ hash: account.password, password: "something else" })).toBe(false);
  });

  it("lowercases the email, because that is how sign-in looks it up", async () => {
    const { user } = await credentialUserRows({ ...input, email: "  Ada@Example.com  " });
    expect(user.email).toBe("ada@example.com");
  });

  it("marks the user verified, since an unverified one cannot sign in", async () => {
    expect((await credentialUserRows(input)).user.emailVerified).toBe(true);
    expect((await credentialUserRows({ ...input, emailVerified: false })).user.emailVerified).toBe(false);
  });

  it("names them after the local part when no name is given", async () => {
    expect((await credentialUserRows(input)).user.name).toBe("ada");
    expect((await credentialUserRows({ ...input, name: "Ada Lovelace" })).user.name).toBe("Ada Lovelace");
  });

  it("carries a role through, which the dashboard policies read", async () => {
    expect((await credentialUserRows({ ...input, role: "admin" })).user.role).toBe("admin");
    expect((await credentialUserRows(input)).user.role).toBeUndefined();
  });

  it("gives every user a distinct id", async () => {
    const a = await credentialUserRows(input);
    const b = await credentialUserRows({ ...input, email: "grace@example.com" });
    expect(a.user.id).not.toBe(b.user.id);
  });

  it("refuses input that could not sign in anyway", async () => {
    await expect(credentialUserRows({ ...input, email: "ada" })).rejects.toThrow(/email address/i);
    await expect(credentialUserRows({ ...input, password: "" })).rejects.toThrow(/password/i);
  });
});
