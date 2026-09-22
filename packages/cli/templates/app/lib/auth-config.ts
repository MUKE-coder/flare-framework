/**
 * How people sign in to this app. `flare create` wrote the choices you made; change
 * them here any time. Every method's tables already exist, so switching one on or off
 * needs no migration, and a method that's off is refused by the API, not just hidden.
 *
 * Email and password sign-in is always available.
 */
export const authConfig = {
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
};

export type SocialProvider = "google" | "github" | "apple" | "microsoft";

/** Whether any second factor can be set up. */
export const twoFactorAvailable = authConfig.twoFactor.authenticator || authConfig.twoFactor.email;
