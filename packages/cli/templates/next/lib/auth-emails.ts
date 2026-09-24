import { prisma } from "@/lib/db";
import { sendTransactionalEmail } from "./mail";

/**
 * Every email the sign-in flows send. Change the wording here; the layout comes from
 * lib/mail.ts. Without RESEND_API_KEY these print to the console, links and codes included.
 */

const ignore = "If you didn't ask for this, you can ignore this email.";

/** Accounts with two-factor sign-in never get a one-step email sign-in (it would skip the second factor). */
async function usesTwoFactor(email: string): Promise<boolean> {
  const row = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { twoFactorEnabled: true } });
  return Boolean(row?.twoFactorEnabled);
}

async function sendTwoFactorNotice(email: string) {
  await sendTransactionalEmail({
    to: email,
    subject: "Sign in with your password or a passkey",
    heading: "Email sign-in is off for your account",
    paragraphs: [
      "Someone asked to sign in to your account by email. Your account uses two-factor authentication, so we don't send sign-in links or codes.",
      "Sign in with your password and second factor, or with a passkey.",
    ],
    footer: ignore,
  });
}

export async function sendMagicLink({ email, url }: { email: string; url: string }) {
  if (await usesTwoFactor(email)) return sendTwoFactorNotice(email);
  await sendTransactionalEmail({
    to: email,
    subject: "Your sign-in link",
    heading: "Sign in",
    paragraphs: ["Use this link to sign in. It works once and expires in 5 minutes."],
    action: { label: "Sign in", url },
    footer: ignore,
    preheader: "Your sign-in link",
  });
}

export async function sendEmailCode({ email, otp, type }: { email: string; otp: string; type: "sign-in" | "email-verification" | "forget-password" | "change-email" }) {
  if (type === "sign-in" && (await usesTwoFactor(email))) return sendTwoFactorNotice(email);
  const purpose = {
    "sign-in": ["Your sign-in code", "Enter this code to sign in."],
    "email-verification": ["Verify your email", "Enter this code to verify your email address."],
    "forget-password": ["Reset your password", "Enter this code to choose a new password."],
    "change-email": ["Confirm your new email", "Enter this code to confirm your new email address."],
  }[type];
  await sendTransactionalEmail({
    to: email,
    subject: `${purpose[0]}: ${otp}`,
    heading: otp,
    paragraphs: [purpose[1], "It expires in 5 minutes."],
    footer: ignore,
    preheader: purpose[0],
  });
}

export async function sendTwoFactorCode({ user, otp }: { user: { email: string }; otp: string }) {
  await sendTransactionalEmail({
    to: user.email,
    subject: `Your verification code: ${otp}`,
    heading: otp,
    paragraphs: ["Enter this code to finish signing in. It expires in 5 minutes."],
    footer: "If you didn't just sign in, change your password: someone else knows it.",
    preheader: "Your verification code",
  });
}

export async function sendPasswordReset({ user, url }: { user: { email: string }; url: string }) {
  await sendTransactionalEmail({
    to: user.email,
    subject: "Reset your password",
    heading: "Reset your password",
    paragraphs: ["Use this link to choose a new password. It expires in 1 hour."],
    action: { label: "Choose a new password", url },
    footer: ignore,
  });
}

export async function sendVerificationEmail({ user, url }: { user: { email: string }; url: string }) {
  await sendTransactionalEmail({
    to: user.email,
    subject: "Verify your email",
    heading: "Verify your email",
    paragraphs: ["Confirm this is your email address."],
    action: { label: "Verify email", url },
    footer: ignore,
  });
}
