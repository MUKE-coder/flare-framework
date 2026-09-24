"use client";

import { useState } from "react";
import Link from "next/link";
import { BellIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { UserAvatar, UserMenuItems, type DashboardUser } from "./user-menu";

export type Theme = "light" | "dark" | "system";

export interface Notice {
  id: string;
  title: string;
  description?: string;
  href?: string;
  /** "warning" marks the bell, so it only pulls the eye when something needs doing. */
  tone?: "info" | "warning";
}

/** Persist the choice for SSR (so the first paint matches) and apply it now. */
function applyTheme(theme: Theme) {
  document.cookie = `flare-theme=${theme}; path=/; max-age=31536000; samesite=lax`;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  if (theme !== "system") root.classList.add(theme);
}

export function DashboardHeader({ user, initialTheme, notices = [] }: { user: DashboardUser; initialTheme: Theme; notices?: Notice[] }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const dark = theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const needsAttention = notices.some((notice) => notice.tone === "warning");

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-1 h-4" />

      <div className="ml-auto flex items-center gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={notices.length ? `Notifications (${notices.length})` : "Notifications"} className="relative">
              <BellIcon />
              {notices.length > 0 && (
                <span
                  aria-hidden="true"
                  className={cn("absolute top-1.5 right-1.5 size-2 rounded-full ring-2 ring-background", needsAttention ? "bg-warning" : "bg-primary")}
                />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b px-4 py-3 text-sm font-medium">Notifications</div>
            {notices.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing needs you right now.</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {notices.map((notice) => {
                  const body = (
                    <>
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className={cn("size-1.5 shrink-0 rounded-full", notice.tone === "warning" ? "bg-warning" : "bg-primary")} aria-hidden="true" />
                        {notice.title}
                      </span>
                      {notice.description && <span className="block pl-3.5 text-xs text-muted-foreground">{notice.description}</span>}
                    </>
                  );
                  return (
                    <li key={notice.id} className="border-b last:border-b-0">
                      {notice.href ? (
                        <Link href={notice.href} className="block px-4 py-3 hover:bg-muted">
                          {body}
                        </Link>
                      ) : (
                        <div className="px-4 py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          onClick={() => {
            const next: Theme = dark ? "light" : "dark";
            setTheme(next);
            applyTheme(next);
          }}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Account" className="rounded-full">
              <UserAvatar user={user} className="size-7" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <UserMenuItems user={user} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
