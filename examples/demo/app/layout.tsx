import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "demo",
  description: "Built with Flare",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
