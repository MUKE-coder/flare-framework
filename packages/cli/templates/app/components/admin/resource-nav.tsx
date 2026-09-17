"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboardIcon } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { resourceIcon } from "./resource-icon";

export interface NavResource {
  name: string;
  pluralLabel: string;
  slug: string;
  icon?: string;
  /** Optional count badge (off by default). */
  badge?: number;
}

/**
 * Sidebar navigation, one item per registered resource. The icon comes from the
 * descriptor's `icon`, the label from its plural label, and the active item from the
 * current path.
 */
export function ResourceNav({ appName, resources }: { appName: string; resources: NavResource[] }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={appName}>
              <Link href="/admin">
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <LayoutDashboardIcon className="size-4" />
                </div>
                <span className="truncate font-semibold">{appName}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Resources</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {resources.map((resource) => {
                const href = `/admin/${resource.slug}`;
                const Icon = resourceIcon(resource.icon);
                return (
                  <SidebarMenuItem key={resource.name}>
                    <SidebarMenuButton asChild isActive={pathname === href || pathname.startsWith(`${href}/`)} tooltip={resource.pluralLabel}>
                      <Link href={href}>
                        <Icon />
                        <span>{resource.pluralLabel}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
