/** OAuth providers `flare create` can switch on (`--auth-providers`). */
export const AUTH_PROVIDERS = {
  google: { label: "Google", envPrefix: "GOOGLE", console: "https://console.cloud.google.com/apis/credentials", extra: [] as string[] },
  github: { label: "GitHub", envPrefix: "GITHUB", console: "https://github.com/settings/developers", extra: [] as string[] },
  apple: {
    label: "Apple",
    envPrefix: "APPLE",
    console: "https://developer.apple.com/account/resources/identifiers/list/serviceId",
    // The client secret is a JWT signed with your key; the bundle id is only for native apps.
    extra: ["# APPLE_CLIENT_SECRET is a JWT you generate from your Sign in with Apple key (see the auth guide).", "APPLE_APP_BUNDLE_ID="],
  },
  microsoft: {
    label: "Microsoft",
    envPrefix: "MICROSOFT",
    console: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
    extra: ["# \"common\" (the default) accepts personal and work accounts; a tenant id limits sign-in to one organisation.", "MICROSOFT_TENANT_ID="],
  },
} as const;

export type AuthProvider = keyof typeof AUTH_PROVIDERS;

/** Sign-in methods `flare create` can switch on (`--auth`). Email + password is always on. */
export const AUTH_METHODS = {
  "magic-link": "Magic links (a sign-in link by email)",
  "email-otp": "Email codes (a 6-digit sign-in code)",
  passkeys: "Passkeys (Face ID, Touch ID, Windows Hello)",
  "2fa-app": "Two-factor with an authenticator app, plus backup codes",
  "2fa-email": "Two-factor with codes by email",
} as const;

export type AuthMethod = keyof typeof AUTH_METHODS;
export const DEFAULT_AUTH_METHODS: AuthMethod[] = ["magic-link", "email-otp", "passkeys", "2fa-app", "2fa-email"];

function parseList<T extends string>(input: string, known: readonly T[], what: string): T[] {
  const names = input
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const unknown = names.filter((name) => !known.includes(name as T));
  if (unknown.length > 0) {
    throw new Error(`Unknown ${what}${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Supported: ${known.join(", ")}.`);
  }
  return [...new Set(names)] as T[];
}

/** Parse a comma-separated provider list ("google, github"), rejecting unknown names and dropping duplicates. */
export function parseAuthProviders(input: string | undefined): AuthProvider[] {
  if (!input) return [];
  return parseList(input, Object.keys(AUTH_PROVIDERS) as AuthProvider[], "auth provider");
}

/** Parse `--auth`: a comma-separated list, or "all" / "none". */
export function parseAuthMethods(input: string | undefined): AuthMethod[] {
  if (input === undefined) return DEFAULT_AUTH_METHODS;
  const value = input.trim().toLowerCase();
  if (value === "all") return [...DEFAULT_AUTH_METHODS];
  if (value === "none" || value === "") return [];
  return parseList(value, Object.keys(AUTH_METHODS) as AuthMethod[], "sign-in method");
}

/** `lib/auth-config.ts` for the chosen methods and providers. */
export function renderAuthConfig(methods: AuthMethod[], providers: AuthProvider[]): string {
  const on = (method: AuthMethod) => methods.includes(method);
  return `/**
 * How people sign in to this app. \`flare create\` wrote the choices you made; change
 * them here any time. Every method's tables already exist, so switching one on or off
 * needs no migration, and a method that's off is refused by the API, not just hidden.
 *
 * Email and password sign-in is always available.
 */
export const authConfig = {
  /** A sign-in link by email. */
  magicLink: ${on("magic-link")},
  /** A 6-digit sign-in code by email. */
  emailOtp: ${on("email-otp")},
  /** Face ID, Touch ID, Windows Hello or a security key. */
  passkeys: ${on("passkeys")},
  twoFactor: {
    /** Codes from an authenticator app (TOTP), with backup codes. */
    authenticator: ${on("2fa-app")},
    /** Codes by email as the second step. */
    email: ${on("2fa-email")},
  },
  /**
   * Social sign-in. Each provider also needs its credentials (see .dev.vars.example);
   * without them its button stays hidden.
   */
  social: ${JSON.stringify(providers).replace(/","/g, '", "')} as SocialProvider[],
  /** Refuse password sign-in until the email address is verified. */
  requireEmailVerification: false,
  /**
   * Check new passwords against Have I Been Pwned's breach list. Only the first five
   * characters of the password's hash are sent, and an outage lets the password through.
   */
  checkBreachedPasswords: true,
};

export type SocialProvider = "google" | "github" | "apple" | "microsoft";

/** Whether any second factor can be set up. */
export const twoFactorAvailable = authConfig.twoFactor.authenticator || authConfig.twoFactor.email;
`;
}

/** Empty credential entries for `.dev.vars` (declaring them also types them via `wrangler types`). */
export function devVarsEntries(providers: AuthProvider[]): string {
  return providers
    .map((provider) => `${AUTH_PROVIDERS[provider].envPrefix}_CLIENT_ID=\n${AUTH_PROVIDERS[provider].envPrefix}_CLIENT_SECRET=\n`)
    .join("");
}

/** Documented credential entries for `.dev.vars.example`. */
export function devVarsExampleEntries(providers: AuthProvider[]): string {
  return providers
    .map((provider) => {
      const { label, envPrefix, console, extra } = AUTH_PROVIDERS[provider];
      return [
        "",
        `# ${label} sign-in: ${console}`,
        `# Callback URL: <your app URL>/api/auth/callback/${provider}`,
        `${envPrefix}_CLIENT_ID=`,
        `${envPrefix}_CLIENT_SECRET=`,
        ...extra,
        "",
      ].join("\n");
    })
    .join("");
}
