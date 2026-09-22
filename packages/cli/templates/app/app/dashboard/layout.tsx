import Link from "next/link";
import { BrandMark } from "@/components/auth/auth-shell";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { ADMIN_ROLES } from "@/lib/admin";
import { requireSession } from "@/lib/session";
import { site } from "@/lib/site";

/** The frame around every signed-in page: the app's mark, its sections and the account menu. */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession("/dashboard");
  const role = (user as { role?: string | null }).role ?? "";
  const links = [
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/account", label: "Account" },
    ...(ADMIN_ROLES.includes(role) ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <div className="min-h-dvh bg-surface-muted/40">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 pt-4">
          <Link href="/dashboard" className="flex items-center gap-3">
            <BrandMark className="pointer-events-none" />
            <span className="font-semibold">{site.name}</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-foreground-muted sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-3">
          <DashboardNav links={links} />
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">{children}</main>
    </div>
  );
}
