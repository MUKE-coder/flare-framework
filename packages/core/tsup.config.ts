import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/server.ts",
    "src/client.ts",
    "src/react.ts",
    "src/realtime/client.ts",
    "src/realtime/server.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  target: "es2022",
  external: ["cloudflare:workers", "react", "react/jsx-runtime"],
});
