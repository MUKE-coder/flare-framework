import { cookies } from "next/headers";
import { count, eq } from "drizzle-orm";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { DashboardHeader, type Notice, type Theme } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { getDb } from "@/db";
import { passkey } from "@/db/auth-schema";
import { authConfig, twoFactorAvailable } from "@/lib/auth-config";
import { areaId } from "@/lib/areas";
import { dashboardLinks } from "@/lib/dashboard-nav";
import { visibleAreas, visibleResources } from "@/lib/dashboard";
import { requireSession } from "@/lib/session";
import { listViews } from "@/lib/views";

/**
 * The frame around every signed-in page: the app's resources in the sidebar, the
 * account menu in the header and in the sidebar's footer.
 *
 * Everyone signed in gets a dashboard. What's in it depends on the permissions: the
 * sidebar lists only the resources this person may read, and only the pages of the
 * dashboard itself they have been granted (lib/areas.ts).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession("/dashboard");
  const jar = await cookies();
  const theme = (jar.get("flare-theme")?.value ?? "system") as Theme;
  const collapsed = jar.get("sidebar_state")?.value === "false";
  const role = (user as { role?: string | null }).role ?? "";

  const views = await listViews();
  const resources = (await visibleResources()).map((resource) => ({
    name: resource.name,
    pluralLabel: resource.pluralLabel,
    slug: resource.slug,
    icon: resource.icon,
    group: resource.group,
    views: views.filter((view) => view.resource === resource.name).map(({ id, name, query }) => ({ id, name, query })),
  }));

  // What the bell has to say: the things about this account that aren't done yet.
  const [{ passkeys } = { passkeys: 0 }] = await getDb().select({ passkeys: count() }).from(passkey).where(eq(passkey.userId, user.id));
  const notices: Notice[] = [
    ...(user.emailVerified
      ? []
      : [{ id: "verify-email", title: "Verify your email address", description: "We'll send a new link or code.", href: "/verify-email", tone: "warning" as const }]),
    ...(twoFactorAvailable && !(user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled
      ? [{ id: "two-factor", title: "Turn on two-factor authentication", description: "A second step after your password.", href: "/dashboard/account/security" }]
      : []),
    ...(authConfig.passkeys && passkeys === 0
      ? [{ id: "passkey", title: "Add a passkey", description: "Sign in with Face ID, Touch ID or Windows Hello.", href: "/dashboard/account/security" }]
      : []),
  ];

  // Both lists are filtered here rather than in the sidebar: the sidebar is a client
  // component, and which pages exist is a server question.
  const areas = await visibleAreas(role);
  const links = dashboardLinks.filter((link) => areas.includes(areaId(link.href)));

  const account = { name: user.name, email: user.email, image: (user as { image?: string | null }).image };

  return (
    <SidebarProvider defaultOpen={!collapsed}>
      <DashboardSidebar appName="__APP_TITLE__" resources={resources} links={links} areas={areas} user={account} />
      <SidebarInset>
        <DashboardHeader user={account} initialTheme={theme} notices={notices} canManageRoles={areas.includes("@roles")} />
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">{children}</main>
      </SidebarInset>
      <Toaster theme={theme} />
    </SidebarProvider>
  );
}
