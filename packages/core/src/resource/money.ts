/**
 * Money, stored exactly.
 *
 * A `money` field used to be a `float`, and `0.1 + 0.2` is the reason that was a bug
 * waiting for a shop with a till in it. Binary floating point cannot represent most
 * decimal fractions, so a column of them drifts: sum a few thousand prices and the total
 * is wrong by a cent, which is the kind of wrong nobody can explain to an accountant.
 *
 * So the column holds **minor units** — whole cents, whole fils, whole yen — and an
 * integer column is exact. The store converts at the boundary, so everything above it
 * still works in the units people write and read: the API sends 19.99, the form shows
 * 19.99, and only the database sees 1999.
 *
 * Flare's own billing code has always done this (`amount:int`, formatted as `cents / 100`).
 * This brings `money` fields in line with it.
 */

/**
 * How many decimal places a currency has, where it is not two.
 *
 * ISO 4217 calls this the minor unit exponent. Most currencies are 2, a few are 0 — a yen
 * is not divided — and three Gulf currencies are 3. Getting it wrong by a factor of ten is
 * the kind of bug that only shows up in one country, so the exceptions are listed rather
 * than assumed.
 */
const EXPONENTS: Record<string, number> = {
  // No minor unit at all.
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0,
  UGX: 0, UYI: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0,
  // Thousandths.
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  // Ten-thousandths.
  CLF: 4,
};

/** The default when a field names no currency: two places, which is almost everywhere. */
export const DEFAULT_MONEY_EXPONENT = 2;

/** Decimal places for an ISO 4217 code. Unknown codes get two, which is the common case. */
export function moneyExponent(currency?: string): number {
  if (!currency) return DEFAULT_MONEY_EXPONENT;
  return EXPONENTS[currency.toUpperCase()] ?? DEFAULT_MONEY_EXPONENT;
}

/** 10 ** exponent, as an integer. */
const factor = (exponent: number) => 10 ** exponent;

/**
 * A decimal amount as whole minor units: 19.99 → 1999.
 *
 * Through `toFixed` rather than `Math.round(amount * 100)`, because multiplying first adds
 * an error of its own: `2.675 * 100` is 267.50000000000006, which rounds to 268, while the
 * double behind `2.675` is 2.67499999999999982 and rounds to 267. `toFixed` asks the
 * runtime to round the value that is actually there, so this agrees with what every other
 * tool prints for the same number.
 *
 * Neither approach can rescue a value the double never held — `1.005` is 1.00499999999999989
 * and becomes 100, not 101. Nothing short of decimal arithmetic all the way from the client
 * fixes that, which is why the validator refuses an amount with more places than its
 * currency has: the place to catch it is before it is a double at all.
 */
export function toMinorUnits(amount: number, currency?: string): number {
  if (!Number.isFinite(amount)) throw new TypeError(`Not an amount: ${amount}`);
  // The minus sign travels with the string, so negatives need no special case.
  return Number(amount.toFixed(moneyExponent(currency)).replace(".", ""));
}

/** Whole minor units as a decimal amount: 1999 → 19.99. */
export function fromMinorUnits(minor: number, currency?: string): number {
  const exponent = moneyExponent(currency);
  if (exponent === 0) return minor;
  // Divide and then round to the currency's places: 1999 / 100 is exactly 19.99 as a
  // double, but a value like 8.17 is not, and leaving the artefact in means it reaches JSON.
  return Number((minor / factor(exponent)).toFixed(exponent));
}

/**
 * Whether an amount has more decimal places than its currency has.
 *
 * 19.999 in a two-place currency is not a rounding problem to solve quietly — it is a
 * caller sending something they did not mean, and storing 20.00 instead would be a silent
 * change to a number that matters.
 */
export function hasTooManyPlaces(amount: number, currency?: string): boolean {
  const exponent = moneyExponent(currency);
  // The shortest decimal form of the double, which is what the caller wrote.
  const text = String(amount);
  if (text.includes("e") || text.includes("E")) return true;
  const places = text.includes(".") ? text.length - text.indexOf(".") - 1 : 0;
  return places > exponent;
}
