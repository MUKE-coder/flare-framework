"use client";

import Link from "next/link";
import { LogOutIcon, ShieldIcon, UserCircleIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export interface DashboardUser {
  name?: string | null;
  email: string;
  image?: string | null;
}

/** "Ada Lovelace" → "AL"; an address falls back to its first letter. */
export function initials(user: DashboardUser): string {
  const source = user.name?.trim() || user.email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : source.slice(0, 2)).toUpperCase();
}

export function UserAvatar({ user, className }: { user: DashboardUser; className?: string }) {
  return (
    <Avatar className={className}>
      {user.image && <AvatarImage src={user.image} alt="" />}
      <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">{initials(user)}</AvatarFallback>
    </Avatar>
  );
}

/**
 * What's inside the account menu, wherever it's opened from — the header's avatar and
 * the sidebar's footer both show this, so there's one list of account actions, not two.
 *
 * Three entries, not a sitemap. Password, security and devices are tabs inside Account
 * settings, so linking each of them here was the same door four times. "Manage roles"
 * appears for the people who can use it.
 */
export function UserMenuItems({ user, isAdmin = false }: { user: DashboardUser; isAdmin?: boolean }) {
  const signOut = async () => {
    await authClient.signOut();
    window.location.assign("/sign-in");
  };

  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-2 font-normal">
        <UserAvatar user={user} className="size-8" />
        <span className="grid min-w-0">
          <span className="truncate text-sm font-medium">{user.name || "Signed in"}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/account">
            <UserCircleIcon />
            Account settings
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/dashboard/users">
              <ShieldIcon />
              Manage roles
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem variant="destructive" onSelect={signOut}>
          <LogOutIcon />
          Log out
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  );
}
