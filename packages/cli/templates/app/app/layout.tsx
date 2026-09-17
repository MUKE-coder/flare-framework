import { cookies } from "next/headers";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "__APP_NAME__",
  description: "Built with Flare",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The theme cookie is applied on the server so the first paint matches the choice.
  const theme = (await cookies()).get("flare-theme")?.value;
  return (
    <html lang="en" className={theme === "dark" || theme === "light" ? theme : undefined} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
