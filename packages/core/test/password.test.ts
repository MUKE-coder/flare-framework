import { describe, expect, it } from "vitest";
import { hashPassword, PBKDF2_ITERATIONS, verifyPassword } from "../src/password.js";

describe("password hashing", () => {
  it("round-trips a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(new RegExp(`^pbkdf2-sha256\\$${PBKDF2_ITERATIONS}\\$[A-Za-z0-9+/=]+\\$[A-Za-z0-9+/=]+$`));
    expect(await verifyPassword({ hash, password: "correct horse battery staple" })).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword({ hash, password: "Correct horse battery staple" })).toBe(false);
  });

  it("salts each hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("honours the iteration count stored in the hash", async () => {
    const hash = await hashPassword("pw");
    const [, , salt, digest] = hash.split("$");
    const tampered = `pbkdf2-sha256$1000$${salt}$${digest}`;
    expect(await verifyPassword({ hash: tampered, password: "pw" })).toBe(false);
  });

  it("rejects malformed or foreign hashes without throwing", async () => {
    for (const hash of ["", "garbage", "scrypt$1$a$b", "pbkdf2-sha256$abc$a$b", "pbkdf2-sha256$1000$!!$!!"]) {
      expect(await verifyPassword({ hash, password: "pw" })).toBe(false);
    }
  });
});
