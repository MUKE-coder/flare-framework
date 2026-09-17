/**
 * Compact HMAC-SHA256 signed tokens: `<base64url JSON payload>.<base64url signature>`.
 * Payloads are readable (not encrypted); never put secrets in them.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("Invalid base64url");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/**
 * Import an HMAC key for one purpose. The purpose label is mixed in so the same
 * app secret (e.g. BETTER_AUTH_SECRET) yields unrelated keys for unrelated uses.
 */
export async function importSigningKey(secret: string, purpose: string): Promise<CryptoKey> {
  if (!secret) throw new Error("A signing secret is required.");
  const root = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const derived = await crypto.subtle.sign("HMAC", root, encoder.encode(`flare:${purpose}`));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signToken(key: CryptoKey, payload: object): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
  return `${body}.${base64UrlEncode(signature)}`;
}

/** Returns the payload when the signature is valid, otherwise null. Does not check expiry. */
export async function verifyToken<T>(key: CryptoKey, token: string): Promise<T | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts as [string, string];
  try {
    // crypto.subtle.verify compares in constant time.
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signature) as BufferSource,
      encoder.encode(body),
    );
    if (!valid) return null;
    return JSON.parse(decoder.decode(base64UrlDecode(body))) as T;
  } catch {
    return null;
  }
}
