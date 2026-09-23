import type { ThemeName } from "./theme";

/**
 * What the site says about itself: the home page, the sign-in screens' side panels and
 * the page titles read from here. Edit freely.
 */
export const site = {
  name: "shop",
  tagline: "The fastest way to run your business",
  description: "shop keeps your team, your customers and your data in one place, and it's live on the edge in every region.",
  /**
   * The look of the whole app: sign-in screens, dashboard, admin and home page.
   * One of: default, coral, amber, sky, mono, emerald. FLARE_THEME (shell or .env)
   * overrides it when the app is built or run with `flare dev`.
   */
  theme: "amber" as ThemeName,
  /** How the dashboard behaves. */
  dashboard: {
    /**
     * Where a record is created and edited: in a dialog over the list ("modal", the
     * default, which keeps the list, its filters and your place in it), or on its own
     * page ("page", better for long forms).
     */
    forms: "modal" as "modal" | "page",
  },
  /** The small pill above the home page headline; set to null to hide it. */
  announcement: { label: "New", text: "Passkeys and two-factor sign-in are here", href: "/sign-up" } as { label: string; text: string; href: string } | null,
  /** The home page's feature grid (icon names from lucide.dev). */
  features: [
    { icon: "zap", title: "Fast everywhere", description: "Served from the edge in every region, so pages load in milliseconds wherever your customers are." },
    { icon: "shield-check", title: "Secure by default", description: "Passkeys, two-factor sign-in, roles and rate limits, switched on from day one." },
    { icon: "layout-dashboard", title: "One place for your data", description: "Every record your team keeps, with search, filters and an admin built in." },
    { icon: "users", title: "Built for teams", description: "Invite your team, give each person the right access, and see who changed what." },
    { icon: "plug", title: "Connects to your tools", description: "A documented API for every record, ready for your scripts and integrations." },
    { icon: "credit-card", title: "Billing when you need it", description: "Plans, checkout and invoices through Stripe, without building a billing system." },
  ],
  /** Placeholder names for the logo strip: replace them with your customers (or remove the strip). */
  customers: ["Acme", "Globex", "Initech", "Vandelay", "Northwind", "Brightline"],
  /** Shown beside the sign-up form. */
  highlights: [
    "Set up in minutes, with nothing to install",
    "Secure sign-in with passkeys and two-factor",
    "Your data stays yours: export it any time",
  ],
  /** Shown on the sign-in screen of themes with a quote panel. */
  testimonial: {
    quote: "We moved our whole workflow over in an afternoon. The team hasn't looked back.",
    author: "Alex Rivera",
    role: "Head of Operations",
  },
  links: {
    terms: "/terms",
    privacy: "/privacy",
    support: "mailto:support@example.com",
  },
};
