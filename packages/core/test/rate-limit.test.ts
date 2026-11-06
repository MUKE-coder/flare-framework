import { describe, expect, it } from "vitest";
import { fixedWindow, parseRate, rateFor, rateLimitKey, ratesIn, RateSyntaxError } from "../src/rate-limit.js";
import { defineResource, field, ResourceDefinitionError } from "../src/resource/index.js";

describe("parseRate (#36)", () => {
  it("reads the forms people write", () => {
    expect(parseRate("10/min")).toEqual({ limit: 10, seconds: 60 });
    expect(parseRate("5/s")).toEqual({ limit: 5, seconds: 1 });
    expect(parseRate("1000/hour")).toEqual({ limit: 1000, seconds: 3600 });
    expect(parseRate("200/day")).toEqual({ limit: 200, seconds: 86_400 });
  });

  it("takes a count in the window, for the gaps between the named ones", () => {
    expect(parseRate("30/5min")).toEqual({ limit: 30, seconds: 300 });
    expect(parseRate("2/30s")).toEqual({ limit: 2, seconds: 30 });
  });

  it("is relaxed about spaces and case", () => {
    expect(parseRate("  10 / MIN  ")).toEqual({ limit: 10, seconds: 60 });
  });

  it("refuses what it cannot read rather than guessing", () => {
    // A rate that quietly parsed as something else would leave an action unlimited while
    // the descriptor claimed otherwise.
    for (const bad of ["10", "10/", "/min", "ten/min", "10/mni", "10/0min", "abc"]) {
      expect(() => parseRate(bad), bad).toThrow(RateSyntaxError);
    }
  });

  it("refuses a limit of zero, and says what to use instead", () => {
    expect(() => parseRate("0/min")).toThrow(/use a policy/);
  });
});

describe("rateFor (#36)", () => {
  const config = { create: "10/min", "*": "120/min" } as const;

  it("prefers the named action over the catch-all", () => {
    expect(rateFor(config, "create")).toEqual({ limit: 10, seconds: 60 });
  });

  it("falls back to the catch-all for everything else", () => {
    expect(rateFor(config, "list")).toEqual({ limit: 120, seconds: 60 });
    expect(rateFor(config, "delete")).toEqual({ limit: 120, seconds: 60 });
  });

  it("is undefined when nothing applies", () => {
    expect(rateFor({ create: "10/min" }, "list")).toBeUndefined();
    expect(rateFor(undefined, "create")).toBeUndefined();
  });
});

describe("ratesIn (#36)", () => {
  it("lists every declared rate with its spec", () => {
    expect(ratesIn({ create: "10/min", "*": "120/min" })).toEqual([
      { action: "create", spec: "10/min", rate: { limit: 10, seconds: 60 } },
      { action: "*", spec: "120/min", rate: { limit: 120, seconds: 60 } },
    ]);
  });

  it("is empty for a resource with none", () => {
    expect(ratesIn(undefined)).toEqual([]);
  });
});

describe("a descriptor's rateLimit (#36)", () => {
  it("is kept on the resource", () => {
    const contact = defineResource({ name: "Contact", fields: { name: field.string() }, rateLimit: { create: "10/min" } });
    expect(contact.rateLimit).toEqual({ create: "10/min" });
  });

  it("is absent when not declared, so nothing downstream has to check for it", () => {
    expect(defineResource({ name: "Contact", fields: { name: field.string() } }).rateLimit).toBeUndefined();
  });

  it("refuses a typo at definition time, naming the resource and the action", () => {
    // Far better here, with the descriptor in front of you, than as an action that turns
    // out not to have been limited.
    expect(() => defineResource({ name: "Contact", fields: { name: field.string() }, rateLimit: { create: "10/mni" } })).toThrow(
      ResourceDefinitionError,
    );
    expect(() => defineResource({ name: "Contact", fields: { name: field.string() }, rateLimit: { create: "10/mni" } })).toThrow(
      /rateLimit\.create/,
    );
  });
});

describe("fixedWindow (#36)", () => {
  const counter = (counts: number[], ttl = 42) => {
    let index = 0;
    return async () => ({ count: counts[index++]!, ttl });
  };

  it("allows the call that reaches the limit, and refuses the next", async () => {
    // The off-by-one that matters: "10/min" means ten calls succeed, not nine.
    const rate = { limit: 3, seconds: 60 };
    expect(await fixedWindow(rate, counter([3]))).toEqual({ allowed: true, remaining: 0, retryAfter: 42 });
    expect(await fixedWindow(rate, counter([4]))).toEqual({ allowed: false, remaining: 0, retryAfter: 42 });
  });

  it("counts down what is left", async () => {
    const rate = { limit: 10, seconds: 60 };
    expect((await fixedWindow(rate, counter([1]))).remaining).toBe(9);
    expect((await fixedWindow(rate, counter([7]))).remaining).toBe(3);
  });

  it("never reports a negative remaining or a retry-after below one second", async () => {
    const decision = await fixedWindow({ limit: 2, seconds: 60 }, counter([9], 0.2));
    expect(decision.remaining).toBe(0);
    expect(decision.retryAfter).toBe(1);
  });

  it("rounds a part-second wait up, so a client that obeys it does not come back early", async () => {
    expect((await fixedWindow({ limit: 1, seconds: 60 }, counter([2], 12.3))).retryAfter).toBe(13);
  });
});

describe("rateLimitKey (#36)", () => {
  it("separates resource, action and caller", () => {
    expect(rateLimitKey("Contact", "create", "user_123")).toBe("Contact:create:user_123");
  });

  it("gives two actions on one resource different buckets", () => {
    expect(rateLimitKey("Contact", "create", "a")).not.toBe(rateLimitKey("Contact", "update", "a"));
  });

  it("gives two callers different buckets", () => {
    expect(rateLimitKey("Contact", "create", "a")).not.toBe(rateLimitKey("Contact", "create", "b"));
  });
});
