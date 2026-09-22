"use client";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={async () => {
        await authClient.signOut();
        window.location.assign("/sign-in");
      }}
      className="rounded-[var(--button-radius)] border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      Sign out
    </button>
  );
}
