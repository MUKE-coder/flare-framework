import type { Metadata } from "next";
import { site } from "@/lib/site";
import { activeTheme } from "@/lib/theme";
import "./globals.css";
// One typeface per theme, self-hosted; the browser only downloads the one in use.
// These are imported here rather than from globals.css because Tailwind inlines a CSS
// @import, and the font files' relative URLs are then resolved against the wrong file
// and never emitted — which shows up only in a build, as every font 404ing.
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/noto-sans";
import "@fontsource-variable/geist";
import "@fontsource-variable/figtree";

export const metadata: Metadata = {
  title: { default: site.name, template: `%s · ${site.name}` },
  description: site.description,
};

/**
 * Applies the saved theme (the `flare-theme` cookie the admin's toggle writes) before
 * first paint. It runs in the browser rather than reading cookies() here: a layout
 * that reads cookies makes every page under it dynamic, and dynamic pages can never
 * be served from the CDN cache.
 */
const themeScript = `(function(){try{var m=document.cookie.match(/(?:^|; )flare-theme=(light|dark)/);if(m)document.documentElement.classList.add(m[1]);}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme={activeTheme} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
