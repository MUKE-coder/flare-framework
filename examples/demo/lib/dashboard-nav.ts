// Extra dashboard sidebar links (maintained by flare generators such as `flare gen security`).
// Add your own links outside the generated block.
// generated:start hash=9f64464593c4
export interface DashboardLink {
  label: string;
  href: string;
  /** A resource icon name, e.g. "shield" (see components/dashboard/resource-icon.tsx). */
  icon: string;
}

export const generatedDashboardLinks: DashboardLink[] = [{ label: "Security", href: "/dashboard/security", icon: "shield" }];
// generated:end

/** Links shown under "Platform" in the dashboard sidebar. */
export const dashboardLinks: DashboardLink[] = [...generatedDashboardLinks, { label: "API reference", href: "/api/reference", icon: "book" }];
