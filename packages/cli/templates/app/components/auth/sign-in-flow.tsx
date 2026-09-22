"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FingerprintIcon, MailIcon, KeyRoundIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { SocialProvider } from "@/lib/auth-config";
import { AuthInput, AuthLabel, Divider, FormMessage, PrimaryButton, SecondaryButton, TextButton } from "./ui";
import { SocialButtons } from "./social-buttons";

export interface SignInMethods {
  magicLink: boolean;
  emailOtp: boolean;
  passkeys: boolean;
}

interface Props {
  providers: SocialProvider[];
  socialPlacement: "before" | "after";
  socialStyle: "full" | "icon";
  methods: SignInMethods;
  next: string;
  initialError?: string | null;
  initialNotice?: string | null;
}

type Step = "email" | "password" | "link-sent" | "code";

/** Messages for Better Auth's error codes, written for the person signing in. */
export function authErrorMessage(error: { code?: string; message?: string } | null | undefined, fallback = "Something went wrong. Try again."): string {
  switch (error?.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match.";
    case "EMAIL_NOT_VERIFIED":
      return "Verify your email first: we've sent you a new link.";
    case "INVALID_OTP":
    case "INVALID_CODE":
    case "INVALID_TWO_FACTOR_CODE":
      return "That code isn't right. Check it and try again.";
    case "OTP_EXPIRED":
      return "That code has expired. Ask for a new one.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many attempts. Ask for a new code.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with this email already exists. Sign in instead.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 8 characters.";
    default:
      return error?.message || fallback;
  }
}

const go = (next: string) => {
  window.location.href = next;
};

/**
 * Sign-in in two steps: the email first (with social and passkey sign-in beside it),
 * then the password or an emailed link or code. A password sign-in that needs a
 * second factor continues on /two-factor (see lib/auth-client.ts).
 */
export function SignInFlow({ providers, socialPlacement, socialStyle, methods, next, initialError, initialNotice }: Props) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Offer saved passkeys in the email field's autofill (conditional UI), where supported.
  useEffect(() => {
    if (!methods.passkeys || typeof PublicKeyCredential === "undefined") return;
    let cancelled = false;
    PublicKeyCredential.isConditionalMediationAvailable?.().then((available) => {
      if (!available || cancelled) return;
      void authClient.signIn.passkey({ autoFill: true }).then(({ error }) => {
        if (!error) go(next);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [methods.passkeys, next]);

  useEffect(() => {
    if (step === "password") passwordRef.current?.focus();
  }, [step]);

  const run = async (label: string, work: () => Promise<void>) => {
    setPending(label);
    setError(null);
    setNotice(null);
    try {
      await work();
    } finally {
      setPending(null);
    }
  };

  const signInWithPassword = () =>
    run("password", async () => {
      const { data, error } = await authClient.signIn.email({ email, password });
      if (error) return setError(authErrorMessage(error));
      // With two-factor on, the client plugin has already sent us to /two-factor.
      if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return;
      go(next);
    });

  const sendLink = () =>
    run("link", async () => {
      const { error } = await authClient.signIn.magicLink({ email, callbackURL: next, errorCallbackURL: "/sign-in?error=link" });
      if (error) return setError(authErrorMessage(error));
      setStep("link-sent");
    });

  const sendCode = () =>
    run("code", async () => {
      const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      if (error) return setError(authErrorMessage(error));
      setCode("");
      setStep("code");
    });

  const signInWithCode = () =>
    run("verify", async () => {
      const { error } = await authClient.signIn.emailOtp({ email, otp: code.trim() });
      if (error) return setError(authErrorMessage(error));
      go(next);
    });

  const signInWithPasskey = () =>
    run("passkey", async () => {
      const { error } = await authClient.signIn.passkey();
      if (error) return setError(authErrorMessage(error, "That passkey didn't work. Try again or use your email."));
      go(next);
    });

  const social = (
    <SocialButtons providers={providers} variant={socialStyle} next={next} onError={setError} />
  );
  const hasSocial = providers.length > 0;
  const changeEmail = (
    <div className="flex items-center justify-between rounded-[calc(var(--radius)-2px)] bg-surface-muted px-3.5 py-2.5 text-sm">
      <span className="truncate text-foreground">{email}</span>
      <TextButton onClick={() => setStep("email")}>Change</TextButton>
    </div>
  );

  if (step === "link-sent") {
    return (
      <div className="flex flex-col gap-5 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand/15 text-link">
          <MailIcon className="size-6" />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="text-base font-medium text-foreground">Check your email</p>
          <p className="text-sm text-foreground-muted">
            We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>. It works once and expires in 5 minutes.
          </p>
        </div>
        <FormMessage>{error}</FormMessage>
        <div className="flex justify-center gap-4">
          <TextButton onClick={sendLink} disabled={pending !== null}>Send it again</TextButton>
          <TextButton onClick={() => setStep("email")}>Use another email</TextButton>
        </div>
      </div>
    );
  }

  if (step === "code") {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void signInWithCode();
        }}
      >
        <p className="text-sm text-foreground-muted">
          Enter the 6-digit code we sent to <span className="font-medium text-foreground">{email}</span>.
        </p>
        <div className="flex flex-col gap-2">
          <AuthLabel htmlFor="code">Code</AuthLabel>
          <AuthInput
            id="code"
            name="code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            placeholder="123456"
            className="text-center font-mono text-xl tracking-[0.5em]"
            autoFocus
            required
            aria-invalid={Boolean(error) || undefined}
          />
        </div>
        <FormMessage>{error}</FormMessage>
        <PrimaryButton type="submit" pending={pending === "verify"} disabled={code.length !== 6}>
          Sign in
        </PrimaryButton>
        <div className="flex justify-center gap-4">
          <TextButton onClick={sendCode} disabled={pending !== null}>Send a new code</TextButton>
          <TextButton onClick={() => setStep("email")}>Use another email</TextButton>
        </div>
      </form>
    );
  }

  if (step === "password") {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void signInWithPassword();
        }}
      >
        {changeEmail}
        {/* Keeps the email with the password for password managers. */}
        <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <AuthLabel htmlFor="password">Password</AuthLabel>
            <Link href={`/forgot-password?email=${encodeURIComponent(email)}`} className="text-sm text-link hover:underline">
              Forgot password?
            </Link>
          </div>
          <AuthInput
            ref={passwordRef}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            aria-invalid={Boolean(error) || undefined}
          />
        </div>
        <FormMessage>{error}</FormMessage>
        <PrimaryButton type="submit" pending={pending === "password"}>
          Sign in
        </PrimaryButton>
        {(methods.magicLink || methods.emailOtp) && (
          <>
            <Divider />
            {methods.magicLink && (
              <SecondaryButton onClick={sendLink} disabled={pending !== null}>
                <MailIcon className="size-4" /> Email me a sign-in link
              </SecondaryButton>
            )}
            {methods.emailOtp && (
              <SecondaryButton onClick={sendCode} disabled={pending !== null}>
                <KeyRoundIcon className="size-4" /> Email me a code
              </SecondaryButton>
            )}
          </>
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {hasSocial && socialPlacement === "before" && (
        <>
          {social}
          <Divider />
        </>
      )}
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setStep("password");
        }}
      >
        <div className="flex flex-col gap-2">
          <AuthLabel htmlFor="email">Email</AuthLabel>
          <AuthInput
            id="email"
            name="email"
            type="email"
            autoComplete="username webauthn"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />
        </div>
        <FormMessage tone="success">{notice}</FormMessage>
        <FormMessage>{error}</FormMessage>
        <PrimaryButton type="submit">Continue</PrimaryButton>
      </form>
      {methods.passkeys && (
        <SecondaryButton onClick={signInWithPasskey} disabled={pending !== null}>
          <FingerprintIcon className="size-4" /> Sign in with a passkey
        </SecondaryButton>
      )}
      {hasSocial && socialPlacement === "after" && (
        <>
          <Divider />
          {social}
        </>
      )}
    </div>
  );
}
