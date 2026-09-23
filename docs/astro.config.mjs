// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// This site is fully static — no SSR, so no @astrojs/cloudflare adapter is
// needed. It deploys to Cloudflare as Workers Static Assets (see
// wrangler.jsonc), which serves a plain static build directly with no
// framework adapter in the loop.
// https://astro.build/config
export default defineConfig({
  site: "https://flare-docs.codetotech.com",
  integrations: [
    starlight({
      title: "Flare",
      description:
        "Flare is a batteries-included, generator-driven fullstack framework for Cloudflare Workers, built on vinext.",
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/MUKE-coder/flare-framework" },
      ],
      customCss: ["@fontsource-variable/geist", "@fontsource-variable/geist-mono", "/src/styles/flare-theme.css"],
      favicon: "/favicon.svg",
      // The site title carries the Flare version these docs describe.
      components: { SiteTitle: "./src/components/SiteTitle.astro" },
      logo: {
        src: "./src/assets/flare-mark.svg",
        replacesTitle: false,
      },
      editLink: {
        baseUrl: "https://github.com/MUKE-coder/flare-framework/edit/main/docs/",
      },
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "What is Flare?", slug: "index" },
            { label: "Quickstart", slug: "start/quickstart" },
            { label: "Installation", slug: "start/installation" },
            { label: "Project structure", slug: "start/project-structure" },
          ],
        },
        {
          label: "Core concepts",
          items: [
            { label: "The resource descriptor", slug: "concepts/resource-descriptor" },
            { label: "Field type grammar", slug: "concepts/field-grammar" },
            { label: "What `gen resource` emits", slug: "concepts/generated-files" },
            { label: "The codegen overwrite contract", slug: "concepts/codegen-contract" },
            { label: "Drift & `sync-types`", slug: "concepts/sync-types" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Authentication", slug: "guides/auth" },
            { label: "Themes", slug: "guides/themes" },
            { label: "File storage (R2)", slug: "guides/storage" },
            { label: "Email (Resend)", slug: "guides/mail" },
            { label: "Roles & policies", slug: "guides/roles-and-policies" },
            { label: "The dashboard", slug: "guides/dashboard" },
            { label: "Where your code goes", slug: "guides/your-code" },
            { label: "Caching", slug: "guides/caching" },
            { label: "Realtime", slug: "guides/realtime" },
            { label: "Billing (Stripe)", slug: "guides/billing" },
            { label: "Security", slug: "guides/security" },
            { label: "Sharing your local app", slug: "guides/tunnels" },
            { label: "API reference (OpenAPI)", slug: "guides/api-reference" },
            { label: "Drizzle cheat sheet", slug: "guides/drizzle-cheatsheet" },
            { label: "Coming from Prisma", slug: "guides/prisma-to-drizzle" },
            { label: "Migrations & seeds", slug: "guides/migrations-and-seeds" },
            { label: "Deploying to Cloudflare", slug: "guides/deployment" },
          ],
        },
        {
          label: "Tutorials",
          items: [
            { label: "A shop with a till", slug: "tutorials/shop" },
            { label: "A drive", slug: "tutorials/drive" },
          ],
        },
        {
          label: "Reference",
          items: [{ label: "CLI reference", slug: "reference/cli" }],
        },
        {
          label: "Examples",
          items: [{ label: "The demo app", slug: "examples/demo" }],
        },
      ],
    }),
  ],
});
