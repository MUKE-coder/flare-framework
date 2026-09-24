/**
 * What makes a password acceptable here, in one place: the sign-up, reset and change
 * forms show these rules as you type, and the server checks the same ones before it
 * accepts a password (lib/auth.ts).
 *
 * Only the length is required. The rest are advice, shown as a strength reading — length
 * beats punctuation, and a form that refuses "correct horse battery staple" while
 * accepting "P@ssw0rd" has its rules the wrong way round.
 */

export const PASSWORD_MIN_LENGTH = 8;
/** Better Auth's own ceiling; long passphrases are the point, so it's generous. */
export const PASSWORD_MAX_LENGTH = 128;

/** Passwords guessed first in every credential-stuffing list, and the words they're built from. */
const COMMON = new Set([
  "password", "passw0rd", "p@ssword", "p@ssw0rd", "letmein", "welcome", "monkey", "dragon", "football", "baseball",
  "iloveyou", "sunshine", "princess", "admin", "administrator", "login", "master", "hello", "freedom", "whatever",
  "qwerty", "qwertyuiop", "asdfgh", "zxcvbn", "111111", "123123", "123456", "1234567", "12345678", "123456789",
  "1234567890", "abc123", "trustno1", "superman", "batman", "starwars", "pokemon", "chocolate", "internet", "computer",
  "samsung", "google", "facebook", "flare", "changeme", "secret", "test", "temp", "default", "guest",
]);

const KEYBOARD_RUNS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "abcdefghijklmnopqrstuvwxyz"];

export type RuleId = "length" | "variety" | "notCommon" | "notPersonal";

export interface PasswordRule {
  id: RuleId;
  label: string;
  met: boolean;
  /** A password can't be used until every required rule is met. */
  required: boolean;
}

export interface PasswordCheck {
  rules: PasswordRule[];
  /** 0 (hopeless) to 4 (strong), the way zxcvbn scores. */
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
  /** The one thing most worth fixing, or null when there's nothing to say. */
  advice: string | null;
  /** Every required rule is met. */
  valid: boolean;
}

/** Strip the digits and punctuation people add to the end: "Password123!" is "password". */
const stem = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1{2,}/g, "$1");

const looksCommon = (password: string): boolean => {
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || COMMON.has(stem(lower))) return true;
  // A common word with anything tacked on either end is still that word.
  for (const word of COMMON) {
    if (word.length >= 5 && lower.includes(word)) return true;
  }
  return KEYBOARD_RUNS.some((run) => {
    for (let i = 0; i + 5 <= run.length; i++) {
      const slice = run.slice(i, i + 5);
      if (lower.includes(slice) || lower.includes([...slice].reverse().join(""))) return true;
    }
    return false;
  });
};

/** Characters that carry information: repeats and runs count once. */
function effectiveLength(password: string): number {
  let length = 0;
  let previous = "";
  let run = 0;
  for (const character of password) {
    if (character === previous) {
      run++;
      length += run > 1 ? 0.25 : 0.5;
    } else {
      run = 0;
      length += 1;
    }
    previous = character;
  }
  return length;
}

const classes = (password: string) =>
  [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/, /\s/].filter((pattern) => pattern.test(password)).length;

/**
 * Check a password, for the form as you type and for the server on submit.
 * `avoid` is the things it shouldn't contain — the person's name and email.
 */
export function checkPassword(password: string, avoid: (string | null | undefined)[] = []): PasswordCheck {
  const personal = avoid
    .filter((value): value is string => Boolean(value && value.length > 2))
    .flatMap((value) => [value.toLowerCase(), ...value.toLowerCase().split(/[@.\s]+/)])
    .filter((part) => part.length > 2);
  const lower = password.toLowerCase();

  const rules: PasswordRule[] = [
    { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: password.length >= PASSWORD_MIN_LENGTH, required: true },
    { id: "variety", label: "Letters and something else: a number, a symbol or a space", met: classes(password) >= 2, required: false },
    { id: "notCommon", label: "Not a password everyone tries first", met: password.length > 0 && !looksCommon(password), required: false },
    { id: "notPersonal", label: "Nothing from your name or email", met: !personal.some((part) => lower.includes(part)), required: false },
  ];

  const valid = rules.every((rule) => !rule.required || rule.met) && password.length <= PASSWORD_MAX_LENGTH;
  const failed = rules.find((rule) => !rule.met);

  let score: PasswordCheck["score"] = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) {
    const length = effectiveLength(password);
    const variety = classes(password);
    const guessable = !rules.find((rule) => rule.id === "notCommon")!.met || !rules.find((rule) => rule.id === "notPersonal")!.met;
    const raw = length >= 20 ? 4 : length >= 16 ? 3.5 : length >= 12 ? 3 : length >= 10 ? 2 : 1;
    const adjusted = raw + (variety >= 3 ? 0.5 : 0) - (guessable ? 2 : 0);
    score = Math.max(1, Math.min(4, Math.round(adjusted))) as PasswordCheck["score"];
  }

  const label = password.length < PASSWORD_MIN_LENGTH ? "Too short" : (["Weak", "Weak", "Fair", "Good", "Strong"] as const)[score];

  let advice: string | null = null;
  if (password.length === 0) advice = null;
  else if (password.length < PASSWORD_MIN_LENGTH) advice = `${PASSWORD_MIN_LENGTH - password.length} more to go.`;
  else if (password.length > PASSWORD_MAX_LENGTH) advice = `That's over ${PASSWORD_MAX_LENGTH} characters.`;
  else if (failed?.id === "notCommon") advice = "That's close to a password attackers try first. A few unrelated words work better.";
  else if (failed?.id === "notPersonal") advice = "Anyone who knows your email can guess this. Try something unrelated to you.";
  else if (score < 3) advice = "Longer is stronger: three or four unrelated words beat a short password with symbols.";

  return { rules, score, label, advice, valid };
}

/**
 * Has this password appeared in a breach? Asks Have I Been Pwned with the k-anonymity
 * range API: only the first five characters of the hash leave the Worker, and the
 * password itself never does.
 *
 * Fails open — an outage shouldn't stop people signing up.
 */
export async function isBreachedPassword(password: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password)));
    const hash = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
    const response = await fetchImpl(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return false;
    const suffix = hash.slice(5);
    return (await response.text()).split("\n").some((line) => {
      const [candidate, count] = line.trim().split(":");
      return candidate === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}
