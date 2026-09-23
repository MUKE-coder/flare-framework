"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";

/**
 * Toasts for the shop front.
 *
 * The dashboard mounts its own, themed from the admin's cookie. Two toasters on one page
 * would show every message twice, so this one stands down inside /dashboard.
 */
export function StoreToaster() {
  const pathname = usePathname();
  if (pathname.startsWith("/dashboard")) return null;
  return <Toaster />;
}
