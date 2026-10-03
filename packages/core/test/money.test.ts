import { describe, expect, it } from "vitest";
import { fromMinorUnits, hasTooManyPlaces, moneyExponent, toMinorUnits } from "../src/resource/money.js";

/**
 * Money, stored as whole minor units.
 *
 * A `money` field was a `float`, which is why a column of prices drifts and a total comes
 * out a cent short. The column holds cents now and the store converts at the boundary, so
 * these conversions are the seam the whole change rests on.
 */
describe("the currency exponent", () => {
  it("is two unless the currency says otherwise", () => {
    expect(moneyExponent()).toBe(2);
    expect(moneyExponent("USD")).toBe(2);
    expect(moneyExponent("gbp")).toBe(2);
    // An unknown or made-up code: two is the common case and a better guess than throwing.
    expect(moneyExponent("ZZZ")).toBe(2);
  });

  it("is zero for a currency with no minor unit", () => {
    // A yen is not divided, and neither is a Ugandan shilling in practice.
    for (const code of ["JPY", "KRW", "UGX", "VND", "XOF"]) expect(moneyExponent(code), code).toBe(0);
  });

  it("is three for the Gulf currencies that use fils", () => {
    for (const code of ["KWD", "BHD", "JOD", "OMR", "TND"]) expect(moneyExponent(code), code).toBe(3);
  });
});

describe("converting to minor units", () => {
  it("turns an amount into whole units", () => {
    expect(toMinorUnits(19.99)).toBe(1999);
    expect(toMinorUnits(0.1)).toBe(10);
    expect(toMinorUnits(0)).toBe(0);
    expect(toMinorUnits(1_000_000)).toBe(100_000_000);
  });

  it("keeps the sign, for a refund or a credit", () => {
    expect(toMinorUnits(-19.99)).toBe(-1999);
    expect(toMinorUnits(-0.01)).toBe(-1);
  });

  it("follows the currency's exponent", () => {
    expect(toMinorUnits(1500, "JPY")).toBe(1500);
    expect(toMinorUnits(19.995, "KWD")).toBe(19995);
  });

  it("rounds the value that is actually there, not the one multiplying produces", () => {
    // The double behind 2.675 is 2.67499999999999982, so 267 is faithful to it.
    // `Math.round(2.675 * 100)` gives 268, because the multiplication adds its own error.
    expect(toMinorUnits(2.675)).toBe(267);
    expect(Math.round(2.675 * 100)).toBe(268);
  });

  it("refuses something that is not an amount", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -Number.POSITIVE_INFINITY]) {
      expect(() => toMinorUnits(value)).toThrow(/Not an amount/);
    }
  });
});

describe("converting back", () => {
  it("returns the amount people wrote", () => {
    expect(fromMinorUnits(1999)).toBe(19.99);
    expect(fromMinorUnits(10)).toBe(0.1);
    expect(fromMinorUnits(0)).toBe(0);
    expect(fromMinorUnits(-1999)).toBe(-19.99);
  });

  it("leaves a zero-exponent currency alone", () => {
    expect(fromMinorUnits(1500, "JPY")).toBe(1500);
  });

  it("does not leak a division artefact into JSON", () => {
    // 817 / 100 is 8.17 exactly as a double, but plenty of values are not, and an API
    // answering 8.170000000000001 is the sort of thing people screenshot.
    for (let minor = 0; minor < 2000; minor += 1) {
      const text = String(fromMinorUnits(minor));
      expect(text, text).not.toMatch(/\d{6,}$/);
    }
  });

  it("round-trips every amount a till would see", () => {
    for (let minor = -5000; minor <= 5000; minor += 1) {
      expect(toMinorUnits(fromMinorUnits(minor)), String(minor)).toBe(minor);
    }
  });

  it("adds up exactly, which is the whole point", () => {
    // Three 7p items. In float that is 0.21000000000000002, and a column of prices summed
    // in SQL drifts the same way — which is how a total ends up a penny out.
    const prices = [0.07, 0.07, 0.07];
    expect(prices.reduce((sum, price) => sum + price, 0)).not.toBe(0.21);

    const total = prices.reduce((sum, price) => sum + toMinorUnits(price), 0);
    expect(total).toBe(21);
    expect(fromMinorUnits(total)).toBe(0.21);
  });

  it("is only exact where the amounts are exact", () => {
    // Worth being honest about: plenty of sums happen to come out right in float, which is
    // exactly what makes the bug hard to find. 19.99 three times is fine; 0.07 three times
    // is not, and nothing in the prices tells you which you have.
    expect([19.99, 19.99, 19.99].reduce((sum, price) => sum + price, 0)).toBe(59.97);
  });
});

describe("too many decimal places", () => {
  it("catches an amount with more places than the currency has", () => {
    expect(hasTooManyPlaces(19.999)).toBe(true);
    expect(hasTooManyPlaces(19.99)).toBe(false);
    expect(hasTooManyPlaces(19.9)).toBe(false);
    expect(hasTooManyPlaces(19)).toBe(false);
  });

  it("uses the currency's own exponent", () => {
    expect(hasTooManyPlaces(19.5, "JPY")).toBe(true);
    expect(hasTooManyPlaces(19, "JPY")).toBe(false);
    expect(hasTooManyPlaces(19.995, "KWD")).toBe(false);
    expect(hasTooManyPlaces(19.9995, "KWD")).toBe(true);
  });

  it("treats an exponential literal as too precise to trust", () => {
    // 1e-7 is a real number and not a price; better refused than silently zeroed.
    expect(hasTooManyPlaces(1e-7)).toBe(true);
  });
});
