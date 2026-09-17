/**
 * Password hashing for Workers.
 *
 * Better Auth's default scrypt runs in pure JavaScript and costs ~250-300ms of
 * CPU per hash, far over the Workers free-plan CPU limit. PBKDF2-SHA256 through
 * WebCrypto runs natively and is several times cheaper. 100,000 iterations is
 * the maximum Workers' WebCrypto accepts.
 *
 * Stored format: `pbkdf2-sha256$<iterations>$<base64 salt>$<base64 hash>`.
 * The iteration count is read back from the stored hash, so it can be raised
 * later without breaking existing passwords.
 */

const ALGORITHM = "pbkdf2-sha256";
export const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const encoder = new TextEncoder();

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password.normalize("NFKC")), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

/** Constant-time comparison so verification time doesn't leak how many bytes matched. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return `${ALGORITHM}$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const [algorithm, iterationsText, saltText, hashText] = hash.split("$");
  const iterations = Number(iterationsText);
  if (algorithm !== ALGORITHM || !Number.isInteger(iterations) || iterations < 1 || !saltText || !hashText) {
    return false;
  }
  try {
    const expected = fromBase64(hashText);
    const actual = await derive(password, fromBase64(saltText), iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
