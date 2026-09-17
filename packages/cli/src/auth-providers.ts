/** OAuth providers `flare create --auth-providers` can scaffold. */
export const AUTH_PROVIDERS = {
  google: { envPrefix: "GOOGLE", console: "https://console.cloud.google.com/apis/credentials" },
  github: { envPrefix: "GITHUB", console: "https://github.com/settings/developers" },
} as const;

export type AuthProvider = keyof typeof AUTH_PROVIDERS;

/** Parse a comma-separated provider list ("google, github"), rejecting unknown names and dropping duplicates. */
export function parseAuthProviders(input: string | undefined): AuthProvider[] {
  if (!input) return [];
  const names = input
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const unknown = names.filter((name) => !(name in AUTH_PROVIDERS));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown auth provider${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Supported: ${Object.keys(AUTH_PROVIDERS).join(", ")}.`,
    );
  }
  return [...new Set(names)] as AuthProvider[];
}

/** The `socialProviders` value inserted into `lib/auth.ts`. */
export function socialProvidersCode(providers: AuthProvider[]): string {
  if (providers.length === 0) return "{}";
  const entries = providers.map((provider) => {
    const id = `env.${AUTH_PROVIDERS[provider].envPrefix}_CLIENT_ID`;
    const secret = `env.${AUTH_PROVIDERS[provider].envPrefix}_CLIENT_SECRET`;
    return `    ...(${id} && ${secret} ? { ${provider}: { clientId: ${id}, clientSecret: ${secret} } } : {}),`;
  });
  return [
    "{",
    "    // Each provider switches on once its credentials are set: .dev.vars locally,",
    "    // `wrangler secret put` in production.",
    ...entries,
    "  }",
  ].join("\n");
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
      const { envPrefix, console } = AUTH_PROVIDERS[provider];
      return [
        "",
        `# ${provider} OAuth app: ${console}`,
        `# Callback URL: <your app URL>/api/auth/callback/${provider}`,
        `${envPrefix}_CLIENT_ID=`,
        `${envPrefix}_CLIENT_SECRET=`,
        "",
      ].join("\n");
    })
    .join("");
}
