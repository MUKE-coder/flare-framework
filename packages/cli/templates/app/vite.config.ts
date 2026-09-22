import { defineConfig, loadEnv } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";

export default defineConfig(({ mode }) => ({
  // FLARE_THEME (shell or .env) picks the theme for this build; see lib/theme.ts.
  define: { __FLARE_THEME__: JSON.stringify(loadEnv(mode, process.cwd(), "FLARE_").FLARE_THEME ?? "") },
  // `flare dev --tunnel` serves the dev server on a https://*.trycloudflare.com URL.
  server: { allowedHosts: [".trycloudflare.com"] },
  plugins: [
    vinext({
      cache: {
        // Data cache (`cached()`, fetch, "use cache") in Workers KV, shared by every colo.
        // Entries live a day unless a tag revalidates them first; a colo may reuse its own
        // copy for a minute after a write elsewhere.
        data: kvDataAdapter({ ttlSeconds: 86_400, entryCacheTtlSeconds: 60 }),
        // No `cdn` adapter yet. vinext's Workers Cache adapter (cdnAdapter) is experimental
        // in the 1.0 beta: behind it, any page that redirects fails with "Too many
        // redirects", and nothing is cached without an experimental two-stage deploy.
        // See "Caching" in the Flare docs before turning it on.
      },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
}));
