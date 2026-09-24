// Extra dashboard sidebar links (maintained by flare generators such as `flare gen security`).
// Add your own links outside the generated block.
// generated:start
export interface DashboardLink {
  label: string;
  href: string;
  /** A resource icon name, e.g. "shield" (see components/dashboard/resource-icon.tsx). */
  icon: string;
}

export const generatedDashboardLinks: DashboardLink[] = [];
// generated:end

/** Links shown under "Platform" in the dashboard sidebar. */
export const dashboardLinks: DashboardLink[] = [
  { label: "Till", href: "/dashboard/pos", icon: "shopping-cart" },
  { label: "Costs", href: "/dashboard/costs", icon: "wallet" },
  ...generatedDashboardLinks,
  { label: "API reference", href: "/api/reference", icon: "book" },
];
