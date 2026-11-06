/**
 * How people sign in to this app. `flare create` wrote the choices you made; change
 * them here any time. Every method's tables already exist, so switching one on or off
 * needs no migration, and a method that's off is refused by the API, not just hidden.
 *
 * Email and password sign-in is always available.
 */
export const authConfig = {
  /**
   * Who may create an account.
   *
   * - `open` — anybody who finds the sign-up page. Right for a public product.
   * - `invite` — only somebody holding an invitation link. An admin issues them from
   *   /dashboard/invitations; see lib/invitations.ts.
   * - `closed` — nobody. Accounts are made with `flare user:add <email>`.
   *
   * The first account is always allowed, whatever this says: an app nobody can sign into
   * cannot be set up, and in `invite` mode there would be nobody to issue the invitation.
   * Every later sign-up goes through this.
   *
   * Enforced where the account is created rather than on each sign-up route, so it holds
   * for a password sign-up, a magic link, an email code and a social callback alike.
   */
  signup: "__SIGNUP__" as SignupMode,
  /** A sign-in link by email. */
  magicLink: true,
  /** A 6-digit sign-in code by email. */
  emailOtp: true,
  /** Face ID, Touch ID, Windows Hello or a security key. */
  passkeys: true,
  twoFactor: {
    /** Codes from an authenticator app (TOTP), with backup codes. */
    authenticator: true,
    /** Codes by email as the second step. */
    email: true,
  },
  /**
   * Social sign-in. Each provider also needs its credentials (see .dev.vars.example);
   * without them its button stays hidden.
   */
  social: [] as SocialProvider[],
  /** Refuse password sign-in until the email address is verified. */
  requireEmailVerification: false,
  /**
   * Check new passwords against Have I Been Pwned's breach list. Only the first five
   * characters of the password's hash are sent, and an outage lets the password through.
   */
  checkBreachedPasswords: true,
};

export type SocialProvider = "google" | "github" | "apple" | "microsoft";

/** Who may create an account. See `authConfig.signup`. */
export type SignupMode = "open" | "invite" | "closed";

/** Whether the sign-up page should be offered at all. */
export const signupOffered = authConfig.signup !== "closed";

/** Whether any second factor can be set up. */
export const twoFactorAvailable = authConfig.twoFactor.authenticator || authConfig.twoFactor.email;
