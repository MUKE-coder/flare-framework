"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { OtpInput } from "./otp-input";
import { authErrorMessage } from "./sign-in-flow";
import { useResend } from "./use-resend";
import { AuthInput, AuthLabel, FormMessage, PrimaryButton, TextButton } from "./ui";

type Method = "authenticator" | "email" | "backup";

interface Props {
  methods: { authenticator: boolean; email: boolean };
  next: string;
}

const LABELS: Record<Method, string> = { authenticator: "Authenticator app", email: "Email code", backup: "Backup code" };

/** The second step of a password sign-in: an authenticator code, an emailed code, or a backup code. */
export function TwoFactorForm({ methods, next }: Props) {
  const available: Method[] = [...(methods.authenticator ? (["authenticator"] as const) : []), ...(methods.email ? (["email"] as const) : []), "backup"];
  const [method, setMethod] = useState<Method>(available[0]!);
  const [code, setCode] = useState("");
  const [trust, setTrust] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const choose = (item: Method) => {
    setMethod(item);
    setCode("");
    setError(null);
  };

  const sendEmail = async () => {
    setPending(true);
    setError(null);
    const { error } = await authClient.twoFactor.sendOtp();
    setPending(false);
    if (error) return setError(authErrorMessage(error));
    setSent(true);
  };

  const emailResend = useResend(sendEmail);

  const verify = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setPending(true);
    setError(null);
    const body = { code: code.trim(), trustDevice: trust };
    const { error } =
      method === "authenticator"
        ? await authClient.twoFactor.verifyTotp(body)
        : method === "email"
          ? await authClient.twoFactor.verifyOtp(body)
          : await authClient.twoFactor.verifyBackupCode(body);
    setPending(false);
    if (error) return setError(authErrorMessage(error));
    window.location.href = next;
  };

  const waitingForEmail = method === "email" && !sent;

  return (
    <form className="flex flex-col gap-4" onSubmit={verify}>
      {available.length > 1 && (
        <div role="tablist" aria-label="Verify with" className="grid auto-cols-fr grid-flow-col gap-1 rounded-[calc(var(--radius)+2px)] bg-surface-muted p-1">
          {available.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={method === item}
              onClick={() => choose(item)}
              className={cn("rounded-[var(--radius)] px-2 py-1.5 text-xs font-medium text-foreground-muted", method === item && "bg-surface text-foreground shadow-sm")}
            >
              {LABELS[item]}
            </button>
          ))}
        </div>
      )}
      <p className="text-sm text-foreground-muted">
        {method === "authenticator" && "Open your authenticator app and enter the 6-digit code for this account."}
        {method === "email" && (sent ? "We sent a 6-digit code to your email." : "We'll email you a 6-digit code.")}
        {method === "backup" && "Enter one of the backup codes you saved when you set up two-factor. Each works once."}
      </p>
      {waitingForEmail ? (
        <>
          <FormMessage>{error}</FormMessage>
          <PrimaryButton type="button" onClick={sendEmail} pending={pending}>
            Email me a code
          </PrimaryButton>
        </>
      ) : (
        <>
          {method === "backup" ? (
            <div className="flex flex-col gap-2">
              <AuthLabel htmlFor="code">Backup code</AuthLabel>
              <AuthInput
                id="code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="text"
                autoComplete="one-time-code"
                className="text-center font-mono text-lg tracking-[0.2em]"
                required
                autoFocus
                aria-invalid={Boolean(error) || undefined}
              />
            </div>
          ) : (
            <OtpInput
              value={code}
              onChange={setCode}
              onComplete={() => void verify()}
              label={method === "authenticator" ? "Authenticator code" : "Emailed code"}
              autoFocus
              disabled={pending}
            />
          )}
          <label className="flex items-center gap-2 text-sm text-foreground-muted">
            <input type="checkbox" checked={trust} onChange={(event) => setTrust(event.target.checked)} className="size-4 accent-[var(--brand)]" />
            Trust this device for 30 days
          </label>
          <FormMessage>{error}</FormMessage>
          <PrimaryButton type="submit" pending={pending}>
            Verify
          </PrimaryButton>
          {method === "email" && (
            <TextButton onClick={() => void emailResend.resend()} disabled={emailResend.disabled || pending} className="self-center">
              {emailResend.label}
            </TextButton>
          )}
        </>
      )}
    </form>
  );
}
