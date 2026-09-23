"use client";

import Link from "next/link";
import { KeyRoundIcon, LogOutIcon, MonitorSmartphoneIcon, ShieldCheckIcon, UserIcon } from "lucide-react";
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
 */
export function UserMenuItems({ user }: { user: DashboardUser }) {
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
            <UserIcon />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/account/password">
            <KeyRoundIcon />
            Password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/account/security">
            <ShieldCheckIcon />
            Security
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/account/sessions">
            <MonitorSmartphoneIcon />
            Devices
          </Link>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem variant="destructive" onSelect={signOut}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </>
  );
}
