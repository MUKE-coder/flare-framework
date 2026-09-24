"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { checkPassword } from "@/lib/password-rules";
import { PasswordField } from "./password-field";
import { authErrorMessage } from "./sign-in-flow";
import { AuthInput, AuthLabel, FormMessage, PrimaryButton } from "./ui";

/** Asks for a reset link. Says the same thing whether or not the address has an account. */
export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setPending(false);
    if (error) return setError(authErrorMessage(error));
    setSent(true);
  };

  if (sent) {
    return <FormMessage tone="success">If {email} has an account, a reset link is on its way. It expires in 1 hour.</FormMessage>;
  }
  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="flex flex-col gap-2">
        <AuthLabel htmlFor="email">Email</AuthLabel>
        <AuthInput id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
      </div>
      <FormMessage>{error}</FormMessage>
      <PrimaryButton type="submit" pending={pending}>
        Send reset link
      </PrimaryButton>
    </form>
  );
}

/** Sets the new password from the emailed link's token. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const check = checkPassword(password);
    if (!check.valid) return setError(check.advice ?? "That password is too short.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (error) {
      return setError(error.code === "INVALID_TOKEN" ? "This link has expired or was already used. Ask for a new one." : authErrorMessage(error));
    }
    window.location.href = "/sign-in?reset=1";
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <PasswordField id="password" label="New password" value={password} onChange={setPassword} autoFocus />
      <PasswordField id="confirm" label="Confirm it" name="confirm" value={confirm} onChange={setConfirm} showRules={false} />
      <FormMessage>{error}</FormMessage>
      <PrimaryButton type="submit" pending={pending}>
        Set new password
      </PrimaryButton>
    </form>
  );
}
