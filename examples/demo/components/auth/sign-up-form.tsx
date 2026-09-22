"use client";

import { useState } from "react";
import { MailIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { SocialProvider } from "@/lib/auth-config";
import { authErrorMessage } from "./sign-in-flow";
import { SocialButtons } from "./social-buttons";
import { AuthInput, AuthLabel, Divider, FormMessage, PrimaryButton } from "./ui";

interface Props {
  providers: SocialProvider[];
  socialPlacement: "before" | "after";
  socialStyle: "full" | "icon";
  next: string;
  /** With email verification required, sign-up ends on "check your email". */
  verifyFirst: boolean;
}

export function SignUpForm({ providers, socialPlacement, socialStyle, next, verifyFirst }: Props) {
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [key]: event.target.value });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (values.password.length < 8) return setError("Use at least 8 characters for your password.");
    setPending(true);
    const { error } = await authClient.signUp.email({ ...values, callbackURL: next });
    setPending(false);
    if (error) return setError(authErrorMessage(error));
    if (verifyFirst) return setSent(true);
    window.location.href = next;
  };

  if (sent) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand/15 text-link">
          <MailIcon className="size-6" />
        </span>
        <p className="text-base font-medium">Check your email</p>
        <p className="text-sm text-foreground-muted">
          We sent a link to <span className="font-medium text-foreground">{values.email}</span>. Open it to verify your address and sign in.
        </p>
      </div>
    );
  }

  const social = <SocialButtons providers={providers} variant={socialStyle} next={next} onError={setError} />;
  return (
    <div className="flex flex-col gap-4">
      {providers.length > 0 && socialPlacement === "before" && (
        <>
          {social}
          <Divider />
        </>
      )}
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className="flex flex-col gap-2">
          <AuthLabel htmlFor="name">Name</AuthLabel>
          <AuthInput id="name" name="name" autoComplete="name" value={values.name} onChange={set("name")} required autoFocus />
        </div>
        <div className="flex flex-col gap-2">
          <AuthLabel htmlFor="email">Email</AuthLabel>
          <AuthInput id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" value={values.email} onChange={set("email")} required />
        </div>
        <div className="flex flex-col gap-2">
          <AuthLabel htmlFor="password">Password</AuthLabel>
          <AuthInput
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={set("password")}
            required
            minLength={8}
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="text-xs text-foreground-muted">
            At least 8 characters.
          </p>
        </div>
        <FormMessage>{error}</FormMessage>
        <PrimaryButton type="submit" pending={pending}>
          Create account
        </PrimaryButton>
      </form>
      {providers.length > 0 && socialPlacement === "after" && (
        <>
          <Divider />
          {social}
        </>
      )}
    </div>
  );
}
