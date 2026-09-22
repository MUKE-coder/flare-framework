/** The themes every app ships with (templates/app/lib/theme.ts has the same list). */
export const THEMES = {
  default: "Calm and centred, indigo accents",
  coral: "Warm and rounded, sign-in as a card over the page",
  amber: "Plain and direct, boxed forms with pill buttons",
  sky: "Crisp blue, bold headings, social sign-in first",
  mono: "Black and white on a fine grid",
  emerald: "Fresh green, sign-in beside a customer quote",
} as const;

export type ThemeName = keyof typeof THEMES;

export function parseTheme(value: string | undefined): ThemeName {
  if (value === undefined) return "default";
  const name = value.trim().toLowerCase();
  if (!(name in THEMES)) throw new Error(`Unknown theme "${value}". Themes: ${Object.keys(THEMES).join(", ")}.`);
  return name as ThemeName;
}
