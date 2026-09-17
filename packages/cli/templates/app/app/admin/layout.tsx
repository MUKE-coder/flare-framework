import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { AdminHeader, type Theme } from "@/components/admin/admin-header";
import { ResourceNav } from "@/components/admin/resource-nav";
import { adminResources, requireAdmin } from "@/lib/admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const jar = await cookies();
  const theme = (jar.get("flare-theme")?.value ?? "system") as Theme;
  const collapsed = jar.get("sidebar_state")?.value === "false";

  const resources = adminResources().map((resource) => ({
    name: resource.name,
    pluralLabel: resource.pluralLabel,
    slug: resource.slug,
    icon: resource.icon,
  }));

  return (
    <SidebarProvider defaultOpen={!collapsed}>
      <ResourceNav appName="__APP_NAME__" resources={resources} />
      <SidebarInset>
        <AdminHeader user={{ name: session.user.name, email: session.user.email }} initialTheme={theme} />
        <main className="flex-1 p-6 md:p-8">{children}</main>
      </SidebarInset>
      <Toaster theme={theme} />
    </SidebarProvider>
  );
}
