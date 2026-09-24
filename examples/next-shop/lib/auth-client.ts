import { passkeyClient } from "@better-auth/passkey/client";
import { emailOTPClient, magicLinkClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser-side auth client. Same origin as the app, so no baseURL is needed. */
export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    emailOTPClient(),
    passkeyClient(),
    // A password sign-in that needs a second factor continues on /two-factor.
    twoFactorClient({
      onTwoFactorRedirect: () => {
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = `/two-factor${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      },
    }),
  ],
});
