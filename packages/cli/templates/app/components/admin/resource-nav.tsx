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
export function ResourceNav({
  appName,
  resources,
  links = [],
}: {
  appName: string;
  resources: NavResource[];
  /** Extra pages (see lib/admin-nav.ts), shown under "Platform". */
  links?: Array<{ label: string; href: string; icon: string }>;
}) {
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
        {links.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {links.map((link) => {
                  const Icon = resourceIcon(link.icon);
                  return (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton asChild isActive={pathname === link.href || pathname.startsWith(`${link.href}/`)} tooltip={link.label}>
                        <Link href={link.href}>
                          <Icon />
                          <span>{link.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
