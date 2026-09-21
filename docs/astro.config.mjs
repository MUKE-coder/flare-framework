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
      expressiveCode: {
        themes: ["github-dark-default", "github-light-default"],
        // Strings take the brand's ember, as in the landing page's code panels.
        customizeTheme(theme) {
          theme.settings.push({
            // Quoted strings only: shell grammars mark every bare argument as string.unquoted.
            scope: ["string.quoted", "string.template", "punctuation.definition.string"],
            settings: { foreground: theme.type === "dark" ? "#FF8A5B" : "#C2410C" },
          });
          // Shell commands and bare arguments read as plain text; flags and quoted strings keep colour.
          theme.settings.push({
            scope: ["entity.name.command", "string.unquoted.argument", "support.function.builtin.shell", "entity.name.function.call.shell"],
            settings: { foreground: theme.type === "dark" ? "#E6E6E6" : "#1F1F1F" },
          });
          return theme;
        },
        // Expressive Code resolves these at build time, so they're real colours per theme
        // (CSS variables would break its contrast maths), matching flare-theme.css.
        styleOverrides: {
          borderRadius: "0.75rem",
          borderColor: ({ theme }) => (theme.type === "dark" ? "#2a2a2a" : "#eaeaea"),
          codeBackground: ({ theme }) => (theme.type === "dark" ? "#181818" : "#fafafa"),
          codeFontFamily: "'Geist Mono Variable', ui-monospace, monospace",
          codeFontSize: "0.8125rem",
          codeLineHeight: "1.7",
          codePaddingBlock: "1rem",
          codePaddingInline: "1.125rem",
          uiFontFamily: "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
          frames: {
            shadowColor: "transparent",
            frameBoxShadowCssValue: "none",
            editorActiveTabIndicatorTopColor: ({ theme }) => (theme.type === "dark" ? "#ff6b35" : "#f2541d"),
            editorActiveTabBackground: ({ theme }) => (theme.type === "dark" ? "#181818" : "#fafafa"),
            editorTabBarBackground: ({ theme }) => (theme.type === "dark" ? "#1f1f1f" : "#f4f4f4"),
            terminalTitlebarBackground: ({ theme }) => (theme.type === "dark" ? "#1f1f1f" : "#f4f4f4"),
            terminalBackground: ({ theme }) => (theme.type === "dark" ? "#181818" : "#fafafa"),
            terminalTitlebarBorderBottomColor: ({ theme }) => (theme.type === "dark" ? "#2a2a2a" : "#eaeaea"),
            terminalTitlebarDotsForeground: ({ theme }) => (theme.type === "dark" ? "#3a3a3a" : "#dcdcdc"),
          },
        },
      },
      favicon: "/favicon.svg",
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
            { label: "File storage (R2)", slug: "guides/storage" },
            { label: "Email (Resend)", slug: "guides/mail" },
            { label: "Roles & policies", slug: "guides/roles-and-policies" },
            { label: "The admin dashboard", slug: "guides/admin-dashboard" },
            { label: "Caching", slug: "guides/caching" },
            { label: "Realtime", slug: "guides/realtime" },
            { label: "Billing (Stripe)", slug: "guides/billing" },
            { label: "Security", slug: "guides/security" },
            { label: "Sharing your local app", slug: "guides/tunnels" },
            { label: "Migrations & seeds", slug: "guides/migrations-and-seeds" },
            { label: "Deploying to Cloudflare", slug: "guides/deployment" },
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
