"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface AccountLink {
  href: string;
  label: string;
}

/**
 * The account's own navigation. Each part of an account is its own page: a single page
 * of everything means scrolling past two-factor to reach your devices, and no way to
 * send someone straight to the part that needs their attention.
 */
export function AccountNav({ links }: { links: AccountLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="-mb-px flex gap-1 overflow-x-auto border-b">
      {links.map((link) => {
        const current = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              current ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
