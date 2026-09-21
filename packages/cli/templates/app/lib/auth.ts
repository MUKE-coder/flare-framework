import { env, waitUntil } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { hashPassword, verifyPassword } from "@flaredev/core";
import { getDb, schema } from "@/db";

/** Optional: set when serving from a custom domain (e.g. https://example.com). */
const configuredURL = (env as { BETTER_AUTH_URL?: string }).BETTER_AUTH_URL;

export const auth = betterAuth({
  appName: "__APP_NAME__",
  secret: env.BETTER_AUTH_SECRET,
  // Without BETTER_AUTH_URL, accept local dev on any port and this app's workers.dev
  // host. Cloudflare only routes hosts this Worker serves, so the allowlist can't be spoofed.
  baseURL: configuredURL || {
    allowedHosts: ["localhost:*", "127.0.0.1:*", "__APP_NAME__.*.workers.dev"],
  },
  database: drizzleAdapter(getDb(), { provider: "sqlite", schema }),
  socialProviders: __SOCIAL_PROVIDERS__,
  emailAndPassword: {
    enabled: true,
    // PBKDF2 via WebCrypto: the default scrypt exceeds Workers CPU limits.
    password: { hash: hashPassword, verify: verifyPassword },
  },
  advanced: {
    // Let emails and other deferred work finish after the response is sent.
    backgroundTasks: { handler: waitUntil },
  },
  plugins: [
    // Adds user.role (default "user") and admin APIs. The /admin area allows ADMIN_ROLES (lib/admin.ts).
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    // Must stay last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

/** OAuth providers with credentials configured, e.g. ["github"]. */
export function enabledSocialProviders(): string[] {
  return Object.keys(auth.options.socialProviders ?? {});
}
