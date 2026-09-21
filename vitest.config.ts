import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const stub = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "test", "cloudflare-workers-stub.ts");

export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": stub,
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});