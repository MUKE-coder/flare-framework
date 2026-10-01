// API keys for non-browser clients — off until `flare gen apikeys`.
//
// A cookie works for a browser and for nothing else. A cron job, a mobile app, a partner
// integration or a shell script needs a credential it can put in a header, and this is
// where one is turned into a user.
//
// Until `flare gen apikeys` runs there is no key plugin and no apikey table, so
// `userFromApiKey` finds nothing and every request is authenticated by its cookie exactly
// as before. The call stays in `lib/api.ts` either way, so switching keys on does not
// change the shape of authorize().
import { auth } from "./auth";

/** Where a key may arrive. `Authorization: Bearer <key>` is the convention most clients expect. */
export function keyFromRequest(headers: Headers): string | null {
  const direct = headers.get("x-api-key");
  if (direct) return direct;
  const bearer = headers.get("authorization");
  const match = bearer?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * The user a request's API key belongs to, or null.
 *
 * Deliberately not Better Auth's `enableSessionForAPIKeys`. That option mocks a session
 * for any request carrying a valid key, and its own documentation says it is not
 * recommended for production — so the key is verified explicitly here instead, where the
 * check is readable and the failure cases are visible.
 *
 * `verifyApiKey` is where expiry, revocation, the per-key rate limit and the request
 * count all happen, so every call has to go through it rather than reading the table.
 */
export async function userFromApiKey(headers: Headers): Promise<{ id: string; email: string; role: string | null } | null> {
  const key = keyFromRequest(headers);
  if (!key) return null;

  // Loosely typed on purpose: `verifyApiKey` only exists once the apiKey plugin is in
  // lib/auth.ts, and this file ships before it. Absent, keys are simply not in use.
  const api = auth.api as {
    verifyApiKey?: (input: { body: { key: string }; headers: Headers }) => Promise<{ valid: boolean; error?: unknown; key?: { referenceId?: string } | null }>;
  };
  if (!api.verifyApiKey) return null;

  // `headers` is required, not optional: this app resolves its baseURL from the request
  // (lib/auth.ts), and a direct auth.api call without them throws rather than returning
  // invalid — which would read as "wrong key" for a configuration problem.
  const verified = await api.verifyApiKey({ body: { key }, headers }).catch((error: unknown) => {
    console.error("[flare] verifying an API key failed:", error);
    return null;
  });
  const referenceId = verified?.valid ? verified.key?.referenceId : undefined;
  if (!referenceId) return null;

  // Through Better Auth's own adapter, so this is the same call on D1 and on Postgres.
  // The role matters: policies are checked against it, and a key with no role would be
  // refused by every policy including `["*"]`.
  const context = await auth.$context;
  const user = await context.internalAdapter.findUserById(referenceId);
  if (!user) return null;
  return { id: user.id, email: user.email, role: (user as { role?: string | null }).role ?? null };
}
