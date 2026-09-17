import { describe, expect, it } from "vitest";
import { userRoleSql } from "../src/commands/user-role.js";

describe("userRoleSql", () => {
  it("builds a case-insensitive update that returns the row", () => {
    expect(userRoleSql("Ada@Example.com", "admin")).toContain(`WHERE lower(email) = lower('Ada@Example.com') RETURNING email, role`);
    expect(userRoleSql("a@b.co", "staff")).toContain(`SET role = 'staff'`);
  });

  it.each([
    ["a@b.co' OR 1=1 --", "admin", /doesn't look like an email/],
    ["not-an-email", "admin", /doesn't look like an email/],
    ["a@b.co", "Admin", /Invalid role/],
    ["a@b.co", "admin'; DROP TABLE user; --", /Invalid role/],
    ["a@b.co", "", /Invalid role/],
  ])("rejects unsafe input %s / %s", (email, role, message) => {
    expect(() => userRoleSql(email, role)).toThrow(message);
  });
});
