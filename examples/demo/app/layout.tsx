import type { Metadata } from "next";
import { site } from "@/lib/site";
import { activeTheme } from "@/lib/theme";
import "./globals.css";

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
