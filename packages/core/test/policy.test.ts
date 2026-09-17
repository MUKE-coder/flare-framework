import { describe, expect, it } from "vitest";
import { allowedActions, can, definePolicy } from "../src/resource/policy.js";

const policy = definePolicy({
  resource: "Invoice",
  read: ["admin", "staff", "staff"],
  create: ["admin", "staff"],
  update: ["admin"],
  delete: [],
});

describe("definePolicy", () => {
  it("normalizes and defaults every action", () => {
    expect(policy).toEqual({ resource: "Invoice", read: ["admin", "staff"], create: ["admin", "staff"], update: ["admin"], delete: [] });
    expect(definePolicy({ resource: "Note" })).toEqual({ resource: "Note", read: [], create: [], update: [], delete: [] });
  });

  it("rejects bad resource names and roles", () => {
    expect(() => definePolicy({ resource: "invoice" })).toThrow(/PascalCase/);
    expect(() => definePolicy({ resource: "Invoice", read: ["Admin"] })).toThrow(/invalid role "Admin"/);
  });
});

describe("can", () => {
  it("allows any signed-in user when there is no policy", () => {
    expect(can(undefined, "user", "delete")).toBe(true);
    expect(can(null, null, "read")).toBe(true);
  });

  it("checks the role for each action, mapping list to read", () => {
    expect(can(policy, "staff", "list")).toBe(true);
    expect(can(policy, "staff", "read")).toBe(true);
    expect(can(policy, "staff", "create")).toBe(true);
    expect(can(policy, "staff", "update")).toBe(false);
    expect(can(policy, "admin", "update")).toBe(true);
    expect(can(policy, "admin", "delete")).toBe(false);
    expect(can(policy, "user", "read")).toBe(false);
    expect(can(policy, null, "read")).toBe(false);
  });

  it('treats "*" as any signed-in role', () => {
    const open = definePolicy({ resource: "Note", read: ["*"] });
    expect(can(open, "user", "read")).toBe(true);
    expect(can(open, null, "read")).toBe(false);
    expect(can(open, "user", "create")).toBe(false);
  });
});

describe("allowedActions", () => {
  it("summarizes what a role may do", () => {
    expect(allowedActions(policy, "staff")).toEqual({ read: true, create: true, update: false, delete: false });
    expect(allowedActions(undefined, "anyone")).toEqual({ read: true, create: true, update: true, delete: true });
  });
});
