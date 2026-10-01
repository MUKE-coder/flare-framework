/**
 * The generated block of `lib/dashboard-nav.ts`: extra sidebar links.
 *
 * Additive, because more than one generator writes here. `flare gen security` used to
 * render the array with only its own entry in it, so running `flare gen apikeys`
 * afterwards removed the Security link — and running security again removed the keys
 * link. Each generator now says which link it owns and the existing ones are kept.
 */

export interface DashboardLink {
  label: string;
  href: string;
  /** A resource icon name, e.g. "shield" (see components/dashboard/resource-icon.tsx). */
  icon: string;
}

const HEADER = `export interface DashboardLink {
  label: string;
  href: string;
  /** A resource icon name, e.g. "shield" (see components/dashboard/resource-icon.tsx). */
  icon: string;
}
`;

/**
 * Links already in a `lib/dashboard-nav.ts`, read from its generated block.
 *
 * Parsed with a regex rather than by evaluating the file: this runs against an app's
 * source, which may be mid-edit, and a link list is not worth importing a module for.
 */
export function existingNavLinks(source: string): DashboardLink[] {
  const links: DashboardLink[] = [];
  const array = /generatedDashboardLinks:\s*DashboardLink\[\]\s*=\s*\[([\s\S]*?)\];/.exec(source);
  if (!array) return links;
  for (const entry of array[1]!.matchAll(/\{([^}]*)\}/g)) {
    const field = (name: string) => new RegExp(`${name}:\\s*"([^"]*)"`).exec(entry[1]!)?.[1];
    const label = field("label");
    const href = field("href");
    const icon = field("icon");
    if (label && href && icon) links.push({ label, href, icon });
  }
  return links;
}

/**
 * The block to write, with `adding` merged into whatever is already there.
 *
 * Keyed on `href`, so re-running a generator updates its own label or icon rather than
 * adding a second row for the same page. Sorted by label so the order does not depend on
 * which generator ran first.
 */
export function renderNavBlock(source: string, adding: DashboardLink[]): string {
  const byHref = new Map(existingNavLinks(source).map((link) => [link.href, link]));
  for (const link of adding) byHref.set(link.href, link);
  const links = [...byHref.values()].sort((a, b) => a.label.localeCompare(b.label));
  const rendered = links.map((link) => `{ label: ${JSON.stringify(link.label)}, href: ${JSON.stringify(link.href)}, icon: ${JSON.stringify(link.icon)} }`);
  const body = rendered.length === 0 ? "[]" : `[${rendered.join(", ")}]`;
  return `${HEADER}
export const generatedDashboardLinks: DashboardLink[] = ${body};
`;
}
