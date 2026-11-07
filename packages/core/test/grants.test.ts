import { describe, expect, it } from "vitest";
import { definePolicy, can } from "../src/resource/policy.js";
import { grantIndex, isRestricted, withGrants, type PermissionGrant } from "../src/resource/grants.js";

const policy = definePolicy({ resource: "Invoice", read: ["admin"], create: ["admin"], update: ["admin"], delete: ["admin"] });
const grant = (role: string, action: PermissionGrant["action"], resource = "Invoice"): PermissionGrant => ({ role, resource, action });

describe("withGrants", () => {
  it("widens a policy with what the dashboard granted", () => {
    const effective = withGrants(policy, "Invoice", [grant("auditor", "read"), grant("auditor", "update")]);
    expect(can(effective, "auditor", "read")).toBe(true);
    expect(can(effective, "auditor", "update")).toBe(true);
    // Not granted, so still refused.
    expect(can(effective, "auditor", "delete")).toBe(false);
    // And the role the code gave is untouched.
    expect(can(effective, "admin", "delete")).toBe(true);
  });

  it("treats list as read, because that is what the policy does", () => {
    const effective = withGrants(policy, "Invoice", [grant("auditor", "read")]);
    expect(can(effective, "auditor", "list")).toBe(true);
  });

  it("never takes away what the code gave", () => {
    // The whole safety property: a database row cannot narrow a policy file, so an app
    // cannot be locked out by an edit made in a running dashboard.
    const effective = withGrants(policy, "Invoice", [grant("auditor", "read")]);
    for (const action of ["read", "create", "update", "delete"] as const) {
      expect(can(effective, "admin", action), action).toBe(true);
    }
  });

  it("leaves an unrestricted resource unrestricted", () => {
    // No policy file means every signed-in user may use it. Inventing a policy from
    // grants would start refusing people the moment somebody opened the roles screen.
    expect(withGrants(undefined, "Note", [grant("auditor", "read", "Note")])).toBeUndefined();
    expect(isRestricted(undefined)).toBe(false);
    expect(isRestricted(policy)).toBe(true);
  });

  it("ignores grants for other resources", () => {
    const effective = withGrants(policy, "Invoice", [grant("auditor", "read", "Contact")]);
    expect(can(effective, "auditor", "read")).toBe(false);
    // Nothing changed, so the same object comes back.
    expect(effective).toBe(policy);
  });

  it("survives a row an older or newer version wrote", () => {
    const rows = [{ role: "auditor", resource: "Invoice", action: "approve" }] as unknown as PermissionGrant[];
    expect(() => withGrants(policy, "Invoice", rows)).not.toThrow();
    expect(withGrants(policy, "Invoice", rows)).toBe(policy);
  });

  it("indexes grants the way a matrix is ticked", () => {
    const index = grantIndex([grant("auditor", "read"), grant("staff", "read"), grant("auditor", "create")]);
    expect([...(index.get("Invoice.read") ?? [])].sort()).toEqual(["auditor", "staff"]);
    expect([...(index.get("Invoice.create") ?? [])]).toEqual(["auditor"]);
    expect(index.get("Invoice.delete")).toBeUndefined();
  });
});
