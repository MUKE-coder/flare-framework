"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavLink {
  href: string;
  label: string;
}

/** The dashboard's section links, with the current one marked. */
export function DashboardNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard" className="-mb-px flex gap-1 overflow-x-auto">
      {links.map((link) => {
        const current = link.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap text-foreground-muted transition-colors hover:text-foreground",
              current ? "border-brand text-foreground" : "border-transparent",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
