// Extra admin sidebar links (maintained by flare generators such as `flare gen security`).
// Add your own links outside the generated block.
// generated:start hash=6616eb7d8dc9
export interface AdminLink {
  label: string;
  href: string;
  /** A resource icon name, e.g. "shield" (see components/admin/resource-icon.tsx). */
  icon: string;
}

export const generatedAdminLinks: AdminLink[] = [{ label: "Security", href: "/admin/security", icon: "shield" }];
// generated:end

/** Links shown under "Platform" in the admin sidebar. */
export const adminLinks: AdminLink[] = [...generatedAdminLinks, { label: "Realtime", href: "/admin/realtime", icon: "radio" }];
