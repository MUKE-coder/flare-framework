"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ActivityIcon, LayoutDashboardIcon, UserCircleIcon } from "lucide-react";
import { ChevronsUpDownIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { resourceIcon } from "./resource-icon";
import { UserAvatar, UserMenuItems, type DashboardUser } from "./user-menu";

export interface NavResource {
  name: string;
  pluralLabel: string;
  slug: string;
  icon?: string;
  /** Heading it sits under, from the descriptor's `group`. */
  group?: string;
  /** Optional count badge (off by default). */
  badge?: number;
  /** This person's saved views of the resource, as "?q=…&filter[…]=…". */
  views?: { id: string; name: string; query: string }[];
}

/** Resources in the order given, under their headings; ungrouped ones come first. */
function byGroup(resources: NavResource[]): [string, NavResource[]][] {
  const groups = new Map<string, NavResource[]>();
  for (const resource of resources) {
    const heading = resource.group?.trim() || "Resources";
    const existing = groups.get(heading);
    if (existing) existing.push(resource);
    else groups.set(heading, [resource]);
  }
  return [...groups];
}

/**
 * Sidebar navigation, one item per registered resource. The icon comes from the
 * descriptor's `icon`, the label from its plural label, and the active item from the
 * current path.
 */
/** Sections every dashboard has, whatever resources the app defines. */
const ACCOUNT_LINKS = [{ href: "/dashboard/account", label: "Account", icon: UserCircleIcon }];
// Security has its own page once `flare gen security` runs, which adds its link to
// lib/dashboard-nav.ts; observability ships with every app.
const ADMIN_LINKS = [{ href: "/dashboard/observability", label: "Observability", icon: ActivityIcon }];

export function DashboardSidebar({
  appName,
  resources,
  links = [],
  isAdmin = false,
  user,
}: {
  appName: string;
  resources: NavResource[];
  /** Extra pages (see lib/dashboard-nav.ts), shown under "Platform". */
  links?: Array<{ label: string; href: string; icon: string }>;
  /** Whether to show the sections that manage the app itself. */
  isAdmin?: boolean;
  user: DashboardUser;
}) {
  const pathname = usePathname();
  // A saved view is the query it was saved with, so the one you're on is the one that matches.
  const search = useSearchParams().toString();
  const manage = [...ACCOUNT_LINKS, ...(isAdmin ? ADMIN_LINKS : [])];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip={appName}>
              <Link href="/dashboard">
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
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === "/dashboard"} tooltip="Overview">
                  <Link href="/dashboard">
                    <LayoutDashboardIcon />
                    <span>Overview</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {byGroup(resources).map(([heading, group]) => (
          <SidebarGroup key={heading}>
            <SidebarGroupLabel>{heading}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.map((resource) => {
                  const href = `/dashboard/${resource.slug}`;
                  const Icon = resourceIcon(resource.icon);
                  return (
                    <SidebarMenuItem key={resource.name}>
                      <SidebarMenuButton asChild isActive={pathname === href || pathname.startsWith(`${href}/`)} tooltip={resource.pluralLabel}>
                        <Link href={href}>
                          <Icon />
                          <span>{resource.pluralLabel}</span>
                        </Link>
                      </SidebarMenuButton>
                      {resource.views && resource.views.length > 0 && (
                        <SidebarMenuSub>
                          {resource.views.map((view) => (
                            <SidebarMenuSubItem key={view.id}>
                              <SidebarMenuSubButton asChild isActive={pathname === href && search === view.query}>
                                <Link href={`${href}?${view.query}`}>
                                  <span>{view.name}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {manage.map((link) => (
                <SidebarMenuItem key={link.href}>
                  <SidebarMenuButton asChild isActive={pathname === link.href || pathname.startsWith(`${link.href}/`)} tooltip={link.label}>
                    <Link href={link.href}>
                      <link.icon />
                      <span>{link.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
                  // Route handlers (/api/...) and other sites are whole pages: open them in a new tab.
                  const external = link.href.startsWith("/api/") || /^https?:\/\//.test(link.href);
                  const content = (
                    <>
                      <Icon />
                      <span>{link.label}</span>
                    </>
                  );
                  return (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton asChild isActive={pathname === link.href || pathname.startsWith(`${link.href}/`)} tooltip={link.label}>
                        {external ? (
                          <a href={link.href} target="_blank" rel="noreferrer">
                            {content}
                          </a>
                        ) : (
                          <Link href={link.href}>{content}</Link>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={user.email}>
                  <UserAvatar user={user} className="size-8 rounded-md" />
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-medium">{user.name || "Signed in"}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </span>
                  <ChevronsUpDownIcon className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60">
                <UserMenuItems user={user} />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
