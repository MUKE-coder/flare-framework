import type { ThemeName } from "./theme";

/**
 * What the site says about itself: the home page, the sign-in screens' side panels and
 * the page titles read from here. Edit freely.
 */
export const site = {
  name: "__APP_NAME__",
  tagline: "The fastest way to run your business",
  description: "__APP_NAME__ keeps your team, your customers and your data in one place, and it's live on the edge in every region.",
  /**
   * The look of the whole app: sign-in screens, dashboard, admin and home page.
   * One of: default, coral, amber, sky, mono, emerald. FLARE_THEME (shell or .env)
   * overrides it when the app is built or run with `flare dev`.
   */
  theme: "__THEME__" as ThemeName,
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
