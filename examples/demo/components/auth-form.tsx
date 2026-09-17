"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

const PROVIDER_LABELS: Record<string, string> = { google: "Google", github: "GitHub" };

const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--foreground)]";

export function AuthForm({
  mode,
  next,
  socialProviders = [],
  initialError = null,
}: {
  mode: "sign-in" | "sign-up";
  next: string;
  socialProviders?: string[];
  initialError?: string | null;
}) {
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));

    const { error } =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name: String(form.get("name")) })
        : await authClient.signIn.email({ email, password });

    if (error) {
      setError(error.message ?? "Something went wrong. Please try again.");
      setPending(false);
      return;
    }
    // Full navigation so server components re-render with the new session cookie.
    window.location.assign(next);
  }

  async function signInWithProvider(provider: string) {
    setError(null);
    setPending(true);
    // Redirects the browser to the provider; failures come back to /sign-in?error=...
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: next,
      errorCallbackURL: `/sign-in?next=${encodeURIComponent(next)}`,
    });
    if (error) {
      setError(error.message ?? "Could not start sign-in. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {socialProviders.length > 0 && (
        <>
          <div className="flex flex-col gap-2">
            {socialProviders.map((provider) => (
              <button
                key={provider}
                type="button"
                disabled={pending}
                onClick={() => signInWithProvider(provider)}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-muted)] disabled:opacity-60"
              >
                Continue with {PROVIDER_LABELS[provider] ?? provider}
              </button>
            ))}
          </div>
          <p className="text-center text-xs text-[var(--foreground-muted)]">or use email</p>
        </>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === "sign-up" && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name
            <input name="name" required autoComplete="name" className={inputClass} />
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] disabled:opacity-60"
        >
          {pending ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
