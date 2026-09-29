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
      // Shared links get the banner. Starlight sets the title and description
      // tags itself; these are only the image ones it leaves alone.
      head: [
        { tag: "meta", attrs: { property: "og:image", content: "https://flare-docs.codetotech.com/banner-social.png" } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1280" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "640" } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "meta", attrs: { name: "twitter:image", content: "https://flare-docs.codetotech.com/banner-social.png" } },
      ],
      components: {
        SiteTitle: "./src/components/SiteTitle.astro",
        // Puts the "Build with AI" strip on every docs page (the splash page opts out
        // and renders its own, larger one).
        Footer: "./src/components/Footer.astro",
      },
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
            { label: "Choosing a stack", slug: "start/stacks" },
            { label: "Project structure", slug: "start/project-structure" },
          ],
        },
        {
          label: "About",
          items: [
            { label: "The pitch", slug: "about/pitch" },
            { label: "Who Flare is for", slug: "about/who-its-for" },
            { label: "Philosophy", slug: "about/philosophy" },
          ],
        },
        {
          label: "Core concepts",
          items: [
            { label: "Nothing is hidden", slug: "concepts/no-magic" },
            { label: "How Flare is built", slug: "concepts/architecture" },
            { label: "Every file in an app", slug: "concepts/file-structure" },
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
            { label: "Relationships", slug: "guides/relationships" },
            { label: "File uploads", slug: "guides/file-uploads" },
            { label: "File storage (R2)", slug: "guides/storage" },
            { label: "Email (Resend)", slug: "guides/mail" },
            { label: "Roles & policies", slug: "guides/roles-and-policies" },
            { label: "The dashboard", slug: "guides/dashboard" },
            { label: "Where your code goes", slug: "guides/your-code" },
            { label: "Caching", slug: "guides/caching" },
            { label: "Realtime", slug: "guides/realtime" },
            { label: "Billing (Stripe)", slug: "guides/billing" },
            { label: "API routes and handlers", slug: "guides/api-routes" },
            { label: "CRUD, end to end", slug: "guides/crud-example" },
            { label: "API reference (OpenAPI)", slug: "guides/api-reference" },
            { label: "Building with AI", slug: "guides/build-with-ai" },
            { label: "What it costs", slug: "guides/costs" },
            { label: "Self-hosting", slug: "guides/self-hosting" },
          ],
        },
        // The two stacks, each with the pages that only apply to it: where it
        // deploys, what it can do that the other can't, and a tutorial that
        // builds something real on it.
        {
          label: "Stack: Cloudflare Workers",
          collapsed: false,
          items: [
            { label: "Cloudflare vs Next.js", slug: "start/stacks" },
            { label: "Setting up Cloudflare", slug: "start/cloudflare-setup" },
            { label: "Deploying to Cloudflare", slug: "guides/deployment" },
            { label: "Migrations & seeds (D1)", slug: "guides/migrations-and-seeds" },
            { label: "Realtime", slug: "guides/realtime" },
            { label: "Security", slug: "guides/security" },
            { label: "Sharing your local app", slug: "guides/tunnels" },
            { label: "Drizzle cheat sheet", slug: "guides/drizzle-cheatsheet" },
            { label: "Coming from Prisma", slug: "guides/prisma-to-drizzle" },
            { label: "Tutorial: a shop with a till", slug: "tutorials/shop" },
            { label: "Tutorial: a drive", slug: "tutorials/drive" },
          ],
        },
        {
          label: "Stack: Next.js on Vercel",
          collapsed: false,
          items: [
            { label: "Cloudflare vs Next.js", slug: "start/stacks" },
            { label: "Deploying to Vercel", slug: "guides/vercel-deployment" },
            { label: "Tutorial: a catalogue", slug: "tutorials/next-shop" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "CLI reference", slug: "reference/cli" },
            { label: "Changelog", slug: "reference/changelog" },
          ],
        },
        {
          label: "Examples",
          items: [{ label: "The demo app", slug: "examples/demo" }],
        },
      ],
    }),
  ],
});
