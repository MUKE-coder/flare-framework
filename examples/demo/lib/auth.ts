import { env, waitUntil } from "cloudflare:workers";
import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";
import { magicLink } from "better-auth/plugins/magic-link";
import { twoFactor } from "better-auth/plugins/two-factor";
import { hashPassword, verifyPassword } from "@flaredev/core";
import { getDb, schema } from "@/db";
import { authConfig, type SocialProvider } from "./auth-config";
import { sendEmailCode, sendMagicLink, sendPasswordReset, sendTwoFactorCode, sendVerificationEmail } from "./auth-emails";

const vars = env as unknown as Record<string, string | undefined>;

/** Optional: set when serving from a custom domain (e.g. https://example.com). */
const configuredURL = vars.BETTER_AUTH_URL;

/** A provider's credentials from the environment, when both are set. */
function credentials(prefix: string) {
  const clientId = vars[`${prefix}_CLIENT_ID`];
  const clientSecret = vars[`${prefix}_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

const providerSettings: Record<SocialProvider, Record<string, string> | undefined> = {
  google: credentials("GOOGLE"),
  github: credentials("GITHUB"),
  // Apple's client secret is a JWT you generate from your key (see the auth guide).
  apple: credentials("APPLE") && { ...credentials("APPLE")!, ...(vars.APPLE_APP_BUNDLE_ID ? { appBundleIdentifier: vars.APPLE_APP_BUNDLE_ID } : {}) },
  // "common" accepts personal and work accounts; set a tenant id to allow only your organisation.
  microsoft: credentials("MICROSOFT") && { ...credentials("MICROSOFT")!, tenantId: vars.MICROSOFT_TENANT_ID || "common" },
};

/** Social providers switched on in lib/auth-config.ts that also have credentials. */
const socialProviders = Object.fromEntries(
  authConfig.social.flatMap((provider) => (providerSettings[provider] ? [[provider, providerSettings[provider]]] : [])),
);

/** Endpoints of methods switched off in lib/auth-config.ts: refused, not just hidden. */
function disabledPath(path: string): boolean {
  if (!authConfig.magicLink && (path === "/sign-in/magic-link" || path === "/magic-link/verify")) return true;
  if (!authConfig.emailOtp && (path.startsWith("/email-otp/") || path === "/sign-in/email-otp" || path === "/forget-password/email-otp")) return true;
  if (!authConfig.passkeys && path.startsWith("/passkey/")) return true;
  const { authenticator, email } = authConfig.twoFactor;
  if (!authenticator && !email && path.startsWith("/two-factor/")) return true;
  if (!authenticator && (path === "/two-factor/get-totp-uri" || path === "/two-factor/verify-totp")) return true;
  if (!email && (path === "/two-factor/send-otp" || path === "/two-factor/verify-otp")) return true;
  return false;
}

export const auth = betterAuth({
  appName: "demo",
  secret: env.BETTER_AUTH_SECRET,
  // Without BETTER_AUTH_URL, accept local dev on any port, a `flare dev --tunnel` URL and
  // this app's workers.dev host. Cloudflare only routes hosts this Worker serves, so a
  // deployed app never sees a trycloudflare.com host and the allowlist can't be spoofed.
  baseURL: configuredURL || {
    allowedHosts: ["localhost:*", "127.0.0.1:*", "*.trycloudflare.com", "demo.*.workers.dev"],
  },
  // Sign in with Apple posts back from Apple's own origin.
  trustedOrigins: authConfig.social.includes("apple") ? ["https://appleid.apple.com"] : [],
  database: drizzleAdapter(getDb(), { provider: "sqlite", schema }),
  socialProviders,
  account: {
    // Signing in with Google as ada@example.com joins Ada's existing account (the provider has verified the address).
    accountLinking: { enabled: true, trustedProviders: ["google", "github", "apple", "microsoft"] },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: authConfig.requireEmailVerification,
    // PBKDF2 via WebCrypto: the default scrypt exceeds Workers CPU limits.
    password: { hash: hashPassword, verify: verifyPassword },
    sendResetPassword: ({ user, url }) => sendPasswordReset({ user, url }),
    resetPasswordTokenExpiresIn: 60 * 60,
    // A password reset signs every other device out.
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendVerificationEmail: ({ user, url }) => sendVerificationEmail({ user, url }),
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },
  advanced: {
    // Let emails and other deferred work finish after the response is sent.
    backgroundTasks: { handler: waitUntil },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (disabledPath(ctx.path)) throw new APIError("NOT_FOUND", { message: "This sign-in method isn't enabled." });
    }),
  },
  plugins: [
    // Adds user.role (default "user") and admin APIs. The /admin area allows ADMIN_ROLES (lib/admin.ts).
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    magicLink({ sendMagicLink: ({ email, url }) => sendMagicLink({ email, url }), expiresIn: 5 * 60, disableSignUp: false }),
    emailOTP({ sendVerificationOTP: (data) => sendEmailCode(data), otpLength: 6, expiresIn: 5 * 60, allowedAttempts: 5 }),
    twoFactor({
      issuer: "demo",
      otpOptions: { sendOTP: ({ user, otp }) => sendTwoFactorCode({ user, otp }), allowedAttempts: 5 },
      // With only email codes switched on there's no authenticator app to confirm first.
      skipVerificationOnEnable: !authConfig.twoFactor.authenticator,
      // People who signed up with a social account have no password to confirm with;
      // accounts that do have one must still give it.
      allowPasswordless: true,
    }),
    passkey({ rpName: "demo" }),
    // Must stay last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

/** OAuth providers switched on and configured, e.g. ["github"], for the sign-in buttons. */
export function enabledSocialProviders(): SocialProvider[] {
  return Object.keys(socialProviders) as SocialProvider[];
}
