// Code block styling (Expressive Code). Kept out of astro.config.mjs because it holds
// functions, which the <Code> component can only load from this file.
import { defineEcConfig } from "@astrojs/starlight/expressive-code";

export default defineEcConfig({
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
      });
