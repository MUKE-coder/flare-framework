import { defineResource, field, type Resource } from "@flaredev/core";
import { describe, expect, it } from "vitest";
import type { LoadedResource } from "../src/generator/load.js";
import { renderCollectionRoute, renderItemRoute } from "../src/generator/render.js";

const loaded = (resource: Resource): LoadedResource => ({ resource, stem: "contact", file: "resources/contact.resource.ts" });

const plain = loaded(defineResource({ name: "Contact", fields: { name: field.string() } }));
const limited = loaded(
  defineResource({ name: "Contact", fields: { name: field.string() }, rateLimit: { create: "10/min", "*": "120/min" } }),
);
const createOnly = loaded(defineResource({ name: "Contact", fields: { name: field.string() }, rateLimit: { create: "10/min" } }));

describe("rate limits in a generated route (#36)", () => {
  it("guards the action the descriptor limits, right after the policy check", () => {
    const route = renderCollectionRoute(createOnly);
    expect(route).toContain('const tooMany = await rateLimitGuard({ request, resource: contactResource, action: "create" });');
    expect(route).toContain("if (tooMany) return tooMany;");
    // After authorize: a request that was going to be refused should not spend somebody's
    // quota, and the caller is not known until then.
    expect(route.indexOf('action: "create" })')).toBeGreaterThan(route.indexOf('authorize({ request, resource: contactResource, action: "create" })'));
  });

  it("guards every action when the catch-all is set", () => {
    const collection = renderCollectionRoute(limited);
    const item = renderItemRoute(limited);
    for (const action of ["list", "create"]) expect(collection, action).toContain(`action: ${JSON.stringify(action)} })`);
    for (const action of ["read", "update", "delete"]) expect(item, action).toContain(`action: ${JSON.stringify(action)} })`);
  });

  it("guards only the named action when there is no catch-all", () => {
    const collection = renderCollectionRoute(createOnly);
    expect(collection).toContain('rateLimitGuard({ request, resource: contactResource, action: "create" })');
    expect(collection).not.toContain('rateLimitGuard({ request, resource: contactResource, action: "list" })');
    // And nothing at all in the item route, which has none of the limited actions.
    expect(renderItemRoute(createOnly)).not.toContain("rateLimitGuard");
  });

  it("leaves an unlimited resource's route with no mention of rate limiting", () => {
    // Nothing to read, and nothing to pay for, for a feature that is not in use.
    const route = renderCollectionRoute(plain);
    expect(route).not.toContain("rateLimitGuard");
    expect(route).not.toContain("tooMany");
  });

  it("imports the guard only when it is used", () => {
    expect(renderCollectionRoute(limited)).toContain('import { authorize, rateLimitGuard, currentUser, policyFor } from "@/lib/api";');
    expect(renderCollectionRoute(plain)).toContain('import { authorize, currentUser, policyFor } from "@/lib/api";');
  });

  it("does the same on the Next.js stack", () => {
    const route = renderCollectionRoute(limited, "next");
    expect(route).toContain("rateLimitGuard");
    expect(route).toContain('import { authorize, rateLimitGuard, currentUser, policyFor } from "@/lib/api";');
  });
});
