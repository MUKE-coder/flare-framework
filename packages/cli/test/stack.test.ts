import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineResource, field, type Resource } from "@flaredev/core";
import { describe, expect, it } from "vitest";
import type { LoadedResource } from "../src/generator/load.js";
import { planFiles } from "../src/generator/plan.js";
import { isStack, readStack, writeStack } from "../src/stack.js";

const loaded = (resource: Resource, stem: string): LoadedResource => ({ resource, stem, file: `resources/${stem}.resource.ts` });

const product = loaded(
  defineResource({
    name: "Product",
    fields: { name: field.string(), sku: field.string({ unique: true }), kind: field.enum(["stock", "digital"]) },
  }),
  "product",
);

const paths = (stack: "cloudflare" | "next") => planFiles([product], undefined, stack).map((file) => file.path);

describe("what each stack generates", () => {
  it("shares everything that isn't the database", () => {
    const shared = [
      "app/api/products/route.ts",
      "app/api/products/[id]/route.ts",
      "resources/product.client.ts",
      "resources/product.validators.ts",
      "app/dashboard/products/page.tsx",
      "app/dashboard/products/[id]/page.tsx",
      "resources/index.ts",
      "resources/server.ts",
    ];
    for (const path of shared) {
      expect(paths("cloudflare")).toContain(path);
      expect(paths("next")).toContain(path);
    }
  });

  it("writes Drizzle tables and a schema index on Cloudflare", () => {
    const files = paths("cloudflare");
    expect(files).toContain("db/schema/products.ts");
    expect(files).toContain("db/schema.ts");
    expect(files).toContain("db/relations.ts");
    expect(files).not.toContain("prisma/schema.prisma");
  });

  it("writes one Prisma schema and no Drizzle anything on Next.js", () => {
    const files = paths("next");
    expect(files).toContain("prisma/schema.prisma");
    expect(files.filter((path) => path.startsWith("db/"))).toEqual([]);
  });

  it("points the server registry at a Prisma delegate rather than a table", () => {
    const registry = (stack: "cloudflare" | "next") =>
      planFiles([product], undefined, stack).find((file) => file.path === "resources/server.ts")!.content;
    expect(registry("cloudflare")).toContain("table: products");
    expect(registry("next")).toContain("delegate: prisma.product");
    expect(registry("next")).toContain('import { prisma } from "@/lib/db";');
  });

  it("defaults to Cloudflare, so an app made before there was a choice is unaffected", () => {
    expect(planFiles([product]).map((file) => file.path)).toEqual(paths("cloudflare"));
  });
});

describe("remembering the choice", () => {
  const app = (json: object) => {
    const root = mkdtempSync(join(tmpdir(), "flare-stack-"));
    writeFileSync(join(root, "package.json"), JSON.stringify(json));
    return root;
  };

  it("reads the stack out of package.json", () => {
    expect(readStack(app({ name: "x", flare: { stack: "next" } }))).toBe("next");
  });

  it("treats an unmarked app as Cloudflare", () => {
    expect(readStack(app({ name: "x" }))).toBe("cloudflare");
    expect(readStack(app({ name: "x", flare: { stack: "nonsense" } }))).toBe("cloudflare");
    expect(readStack(mkdtempSync(join(tmpdir(), "flare-none-")))).toBe("cloudflare");
  });

  it("writes the choice without disturbing the rest of package.json", () => {
    const root = app({ name: "shop", dependencies: { next: "16" } });
    writeStack(root, "next");
    expect(readStack(root)).toBe("next");
    expect(JSON.parse(require("node:fs").readFileSync(join(root, "package.json"), "utf8"))).toMatchObject({
      name: "shop",
      dependencies: { next: "16" },
    });
  });

  it("knows a stack name when it sees one", () => {
    expect(isStack("next")).toBe(true);
    expect(isStack("cloudflare")).toBe(true);
    expect(isStack("deno")).toBe(false);
  });
});
