import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { DashboardHeader, type Theme } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { dashboardLinks } from "@/lib/dashboard-nav";
import { ADMIN_ROLES, visibleResources } from "@/lib/dashboard";
import { requireSession } from "@/lib/session";

/**
 * The frame around every signed-in page: the app's resources in the sidebar, the
 * account menu in the header.
 *
 * Everyone signed in gets a dashboard. What's in it depends on the policies: the
 * sidebar lists only the resources this person may read, and the sections that manage
 * the app itself are for ADMIN_ROLES (lib/dashboard.ts).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession("/dashboard");
  const jar = await cookies();
  const theme = (jar.get("flare-theme")?.value ?? "system") as Theme;
  const collapsed = jar.get("sidebar_state")?.value === "false";
  const role = (user as { role?: string | null }).role ?? "";

  const resources = (await visibleResources()).map((resource) => ({
    name: resource.name,
    pluralLabel: resource.pluralLabel,
    slug: resource.slug,
    icon: resource.icon,
    group: resource.group,
  }));

  return (
    <SidebarProvider defaultOpen={!collapsed}>
      <DashboardSidebar appName="__APP_NAME__" resources={resources} links={dashboardLinks} isAdmin={ADMIN_ROLES.includes(role)} />
      <SidebarInset>
        <DashboardHeader user={{ name: user.name, email: user.email }} initialTheme={theme} />
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">{children}</main>
      </SidebarInset>
      <Toaster theme={theme} />
    </SidebarProvider>
  );
}
