import { site } from "./site";

/**
 * The six looks every Flare app ships with. The active one sets `data-theme` on <html>;
 * app/globals.css maps it to colours, radius and type, and the auth screens pick the
 * layout below.
 */
export const THEMES = {
  default: {
    label: "Default",
    description: "Calm and centred, indigo accents.",
    auth: "centered",
    social: "after",
    socialStyle: "full",
    signIn: (name: string) => ({ title: `Sign in to ${name}` }),
    signUp: (name: string) => ({ title: `Create your ${name} account` }),
  },
  coral: {
    label: "Coral",
    description: "Warm and rounded, a card floating over the page.",
    auth: "modal",
    social: "after",
    socialStyle: "icon",
    signIn: () => ({ title: "Log in or sign up" }),
    signUp: () => ({ title: "Create your account" }),
  },
  amber: {
    label: "Amber",
    description: "Plain and direct, a boxed form with pill buttons.",
    auth: "boxed",
    social: "after",
    socialStyle: "full",
    signIn: () => ({ title: "Sign in" }),
    signUp: () => ({ title: "Create account" }),
  },
  sky: {
    label: "Sky",
    description: "Crisp blue, a bold heading with social sign-in first.",
    auth: "banner",
    social: "before",
    socialStyle: "full",
    signIn: (name: string) => ({ title: `Log in to ${name}` }),
    signUp: (name: string) => ({ title: `Get started with ${name}` }),
  },
  mono: {
    label: "Mono",
    description: "Black and white on a fine grid, a showcase beside the form.",
    auth: "showcase",
    social: "after",
    socialStyle: "full",
    signIn: (name: string) => ({ title: `Log in to your ${name} account` }),
    signUp: (name: string) => ({ title: `Create your ${name} account` }),
  },
  emerald: {
    label: "Emerald",
    description: "Fresh green, the form beside a customer quote.",
    auth: "quote",
    social: "before",
    socialStyle: "full",
    signIn: () => ({ title: "Welcome back", subtitle: "Sign in to your account" }),
    signUp: () => ({ title: "Get started", subtitle: "Create a new account" }),
  },
} as const;

export type ThemeName = keyof typeof THEMES;
export type AuthLayout = (typeof THEMES)[ThemeName]["auth"];

/** Set from FLARE_THEME by vite.config.ts when the app is built or run. */
declare const __FLARE_THEME__: string;

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && value in THEMES;
}

/** The theme in use: FLARE_THEME if it names one, else lib/site.ts. */
export const activeTheme: ThemeName = isThemeName(__FLARE_THEME__) ? __FLARE_THEME__ : isThemeName(site.theme) ? site.theme : "default";

export const theme = THEMES[activeTheme];
export const authLayout: AuthLayout = theme.auth;
