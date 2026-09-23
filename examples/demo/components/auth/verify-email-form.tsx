"use client";

import { useState } from "react";
import { CheckCircle2Icon, MailIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { OtpInput } from "./otp-input";
import { authErrorMessage } from "./sign-in-flow";
import { useResend } from "./use-resend";
import { AuthInput, AuthLabel, Divider, FormMessage, PrimaryButton, SecondaryButton, TextButton } from "./ui";

interface Props {
  /** The address to verify; empty when they arrived without one. */
  initialEmail: string;
  /** Whether emailed codes are switched on, as well as the link. */
  codes: boolean;
  next: string;
}

/**
 * Verify an email address, by the code in the message or by the link in it.
 *
 * People land here from the "check your email" step, from the account page, or by
 * opening a link whose token has expired — so the page has to work without one.
 */
export function VerifyEmailForm({ initialEmail, codes, next }: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);

  const send = async () => {
    setError(null);
    if (!email) return setError("Enter the email address you signed up with.");
    const { error } = codes
      ? await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" })
      : await authClient.sendVerificationEmail({ email, callbackURL: next });
    if (error) return setError(authErrorMessage(error));
    setSent(true);
  };

  const resend = useResend(send);

  const verify = async (value = code) => {
    if (value.length !== 6) return;
    setPending(true);
    setError(null);
    const { error } = await authClient.emailOtp.verifyEmail({ email, otp: value });
    setPending(false);
    if (error) return setError(authErrorMessage(error));
    setDone(true);
    window.location.href = next;
  };

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-success/15 text-success">
          <CheckCircle2Icon className="size-6" />
        </span>
        <p className="text-base font-medium">Email verified</p>
        <p className="text-sm text-foreground-muted">Taking you to your account…</p>
      </div>
    );
  }

  // Nothing sent yet: ask where to send it.
  if (!sent) {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          await send();
          setPending(false);
        }}
      >
        <p className="text-sm text-foreground-muted">
          {codes ? "We'll email you a 6-digit code to confirm this address." : "We'll email you a link to confirm this address."}
        </p>
        <div className="flex flex-col gap-2">
          <AuthLabel htmlFor="email">Email</AuthLabel>
          <AuthInput
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus={!initialEmail}
          />
        </div>
        <FormMessage>{error}</FormMessage>
        <PrimaryButton type="submit" pending={pending}>
          {codes ? "Send me a code" : "Send me a link"}
        </PrimaryButton>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-brand/15 text-link">
          <MailIcon className="size-6" />
        </span>
        <p className="text-sm text-foreground-muted">
          {codes ? "Enter the 6-digit code we sent to " : "Open the link we sent to "}
          <span className="font-medium text-foreground">{email}</span>.
        </p>
      </div>

      {codes && (
        <>
          <OtpInput value={code} onChange={setCode} onComplete={(value) => void verify(value)} label="Verification code" autoFocus disabled={pending} />
          <FormMessage>{error}</FormMessage>
          <PrimaryButton type="button" onClick={() => void verify()} pending={pending} disabled={code.length !== 6}>
            Verify email
          </PrimaryButton>
          <Divider />
        </>
      )}
      {!codes && <FormMessage>{error}</FormMessage>}

      <div className="flex flex-col items-center gap-2">
        <SecondaryButton onClick={() => void resend.resend()} disabled={resend.disabled}>
          {resend.label.replace("code", codes ? "code" : "link")}
        </SecondaryButton>
        <TextButton onClick={() => setSent(false)}>Use a different email</TextButton>
      </div>
    </div>
  );
}
