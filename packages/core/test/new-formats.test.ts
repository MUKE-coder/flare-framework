import { describe, expect, it } from "vitest";
import { createValidators, defineResource, field } from "../src/resource/index.js";

/** The formats added so a descriptor can describe ordinary things without a regex. */
const resource = defineResource({
  name: "Vendor",
  fields: {
    handle: field.string({ format: "username" }),
    serverIp: field.string({ format: "ip" }),
    externalId: field.string({ format: "uuid" }),
    timezone: field.string({ format: "timezone" }),
    locale: field.string({ format: "locale" }),
    currency: field.string({ format: "currency" }),
    postcode: field.string({ format: "postcode" }),
    commission: field.float({ format: "percent" }),
    minimumOrder: field.float({ format: "money" }),
    stars: field.int({ format: "rating" }),
  },
});

const validators = createValidators(resource);
const check = (over: Record<string, unknown>) =>
  validators.create.safeParse({
    handle: "ada_lovelace",
    serverIp: "192.168.1.1",
    externalId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    timezone: "Africa/Kampala",
    locale: "en-GB",
    currency: "UGX",
    postcode: "SW1A 1AA",
    commission: 12.5,
    minimumOrder: 25,
    stars: 4,
    ...over,
  });

describe("the new string formats", () => {
  it("accepts ordinary values", () => {
    expect(check({}).success).toBe(true);
  });

  it.each([
    ["handle", ".nope"],
    ["serverIp", "999.1.1.1"],
    ["externalId", "not-a-uuid"],
    ["timezone", "Mars/Olympus"],
    ["locale", "english"],
    ["currency", "Dollars"],
  ])("rejects a bad %s", (key, value) => {
    const result = check({ [key]: value });
    expect(result.success, `${key}=${value}`).toBe(false);
  });

  it("normalises the ones with an obvious canonical form", () => {
    const result = check({ currency: "ugx", externalId: "3F2504E0-4F89-11D3-9A0C-0305E82C3301", postcode: "sw1a 1aa" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.currency).toBe("UGX");
    expect(result.data.externalId).toBe("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(result.data.postcode).toBe("SW1A 1AA");
  });

  it("accepts IPv6", () => {
    expect(check({ serverIp: "2001:db8::1" }).success).toBe(true);
  });
});

describe("the number formats", () => {
  it("keeps a rating inside its stars", () => {
    expect(check({ stars: 5 }).success).toBe(true);
    expect(check({ stars: 6 }).success).toBe(false);
    expect(check({ stars: -1 }).success).toBe(false);
  });

  it("refuses negative money unless the descriptor allows it", () => {
    expect(check({ minimumOrder: -5 }).success).toBe(false);

    const refunds = defineResource({ name: "Refund", fields: { amount: field.float({ format: "money", min: -1000 }) } });
    expect(createValidators(refunds).create.safeParse({ amount: -50 }).success).toBe(true);
  });

  it("leaves a percent alone, because 150% is a real number", () => {
    expect(check({ commission: 150 }).success).toBe(true);
  });
});
