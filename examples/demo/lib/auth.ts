import { env, waitUntil } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { hashPassword, verifyPassword } from "@flare/core";
import { getDb, schema } from "@/db";

/** Optional: set when serving from a custom domain (e.g. https://example.com). */
const configuredURL = (env as { BETTER_AUTH_URL?: string }).BETTER_AUTH_URL;

export const auth = betterAuth({
  appName: "demo",
  secret: env.BETTER_AUTH_SECRET,
  // Without BETTER_AUTH_URL, accept local dev on any port and this app's workers.dev
  // host. Cloudflare only routes hosts this Worker serves, so the allowlist can't be spoofed.
  baseURL: configuredURL || {
    allowedHosts: ["localhost:*", "127.0.0.1:*", "demo.*.workers.dev"],
  },
  database: drizzleAdapter(getDb(), { provider: "sqlite", schema }),
  emailAndPassword: {
    enabled: true,
    // PBKDF2 via WebCrypto: the default scrypt exceeds Workers CPU limits.
    password: { hash: hashPassword, verify: verifyPassword },
  },
  advanced: {
    // Let emails and other deferred work finish after the response is sent.
    backgroundTasks: { handler: waitUntil },
  },
  // Must stay last: lets server actions set auth cookies.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
