"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { SocialProvider } from "@/lib/auth-config";
import { cn } from "@/lib/utils";
import { PROVIDER_LABELS, ProviderIcon } from "./provider-icons";

interface Props {
  providers: SocialProvider[];
  /** "full": a labelled button per provider. "icon": a row of square buttons. */
  variant: "full" | "icon";
  next: string;
  onError: (message: string) => void;
}

/** One button per configured provider; each starts that provider's sign-in and comes back to `next`. */
export function SocialButtons({ providers, variant, next, onError }: Props) {
  const [pending, setPending] = useState<SocialProvider | null>(null);
  if (providers.length === 0) return null;

  const start = async (provider: SocialProvider) => {
    setPending(provider);
    const { error } = await authClient.signIn.social({ provider, callbackURL: next, errorCallbackURL: "/sign-in?error=oauth" });
    if (error) {
      setPending(null);
      onError(error.message ?? `Couldn't start ${PROVIDER_LABELS[provider]} sign-in.`);
    }
  };

  return (
    <div className={cn(variant === "icon" ? "flex justify-center gap-3" : "flex flex-col gap-3")}>
      {providers.map((provider) => (
        <button
          key={provider}
          type="button"
          onClick={() => start(provider)}
          disabled={pending !== null}
          aria-label={variant === "icon" ? `Continue with ${PROVIDER_LABELS[provider]}` : undefined}
          className={cn(
            "inline-flex items-center justify-center gap-2.5 border border-border bg-surface font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-60",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
            variant === "icon" ? "size-[74px] rounded-2xl" : "h-11 w-full rounded-[var(--button-radius)] px-4 text-[15px]",
          )}
        >
          {pending === provider ? (
            <span className="size-5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />
          ) : (
            <ProviderIcon provider={provider} className={variant === "icon" ? "size-6" : "size-5"} />
          )}
          {variant === "full" && `Continue with ${PROVIDER_LABELS[provider]}`}
        </button>
      ))}
    </div>
  );
}
