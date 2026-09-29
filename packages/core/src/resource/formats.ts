/**
 * Rules and data behind the string formats (see StringFormat in fields.ts), shared
 * by validation, the admin inputs and display so all three agree.
 *
 * Phone numbers use libphonenumber-js (min metadata): real per-country validation
 * and formatting. Country names come from Intl.DisplayNames, so they follow the
 * viewer's locale with no data file to ship.
 */
import {
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";

export interface Country {
  /** ISO 3166-1 alpha-2, e.g. "UG". */
  code: string;
  name: string;
  /** International dialling code without "+", e.g. "256". */
  dialCode: string;
  flag: string;
}

/** 🇺🇬 from "UG": two regional-indicator letters. */
export function flagEmoji(code: string): string {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  return String.fromCodePoint(...[...upper].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

const namesCache = new Map<string, Intl.DisplayNames | null>();
function displayNames(locale: string): Intl.DisplayNames | null {
  if (!namesCache.has(locale)) {
    try {
      namesCache.set(locale, new Intl.DisplayNames([locale, "en"], { type: "region" }));
    } catch {
      namesCache.set(locale, null);
    }
  }
  return namesCache.get(locale)!;
}

export function countryName(code: string, locale = "en"): string {
  const upper = code.toUpperCase();
  try {
    return displayNames(locale)?.of(upper) ?? upper;
  } catch {
    return upper;
  }
}

const listCache = new Map<string, Country[]>();

/** Every country with a dialling code, sorted by name in `locale`. */
export function countries(locale = "en"): Country[] {
  let list = listCache.get(locale);
  if (!list) {
    list = getCountries()
      .map((code) => ({ code, name: countryName(code, locale), dialCode: getCountryCallingCode(code), flag: flagEmoji(code) }))
      .filter((country) => country.name !== country.code)
      .sort((a, b) => a.name.localeCompare(b.name, locale));
    listCache.set(locale, list);
  }
  return list;
}

export function isCountryCode(value: string): boolean {
  return getCountries().includes(value.toUpperCase() as CountryCode);
}

/** A valid international number, e.g. "+256772123456". */
export function isPhoneNumber(value: string): boolean {
  return value.startsWith("+") && isValidPhoneNumber(value);
}

/** "+256 772 123456" for display; the value itself when it can't be parsed. */
export function formatPhone(value: string): string {
  return parsePhoneNumberFromString(value)?.formatInternational() ?? value;
}

/** The country and national part of a stored number, to fill the admin input. */
export function splitPhone(value: string): { country: string | undefined; national: string } {
  const parsed = value ? parsePhoneNumberFromString(value) : undefined;
  if (!parsed) return { country: undefined, national: value.replace(/^\+/, "") };
  return { country: parsed.country, national: parsed.nationalNumber };
}

/** E.164 from a country and whatever the person typed, e.g. ("UG", "0772 123456") → "+256772123456". */
export function toE164(country: string, national: string): string {
  const digits = national.replace(/[^\d+]/g, "");
  if (!digits) return "";
  if (digits.startsWith("+")) return parsePhoneNumberFromString(digits)?.number ?? digits;
  const parsed = parsePhoneNumberFromString(digits, country.toUpperCase() as CountryCode);
  return parsed?.number ?? `+${getCountryCallingCode(country.toUpperCase() as CountryCode)}${digits.replace(/^0+/, "")}`;
}

const DOMAIN = /^(?=.{1,253}$)(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+[a-z][a-z0-9-]{0,62}[a-z0-9]$/;

/** "https://Example.com/path" → "example.com": what someone pasted, as a bare hostname. */
export function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/\.$/, "");
}

export const isDomain = (value: string) => DOMAIN.test(value);

export const isColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export const isSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

/** "My First Post!" → "my-first-post". */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** An IPv4 or IPv6 address. */
export const isIpAddress = (value: string) =>
  /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)
    ? value.split(".").every((part) => Number(part) <= 255)
    : /^[0-9a-f:]+$/i.test(value) && value.includes(":") && value.split("::").length <= 2;

/** A UUID, any version. */
export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/**
 * An IANA time zone such as `Africa/Kampala`.
 *
 * Checked against the runtime's own list rather than a regex, because the list is the
 * only thing that knows which names are real.
 */
export function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** A BCP-47 language tag such as `en`, `en-GB` or `sw-UG`. */
export function isLocale(value: string): boolean {
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|\d{3}))?$/.test(value)) return false;
  try {
    return new Intl.Locale(value).language.length >= 2;
  } catch {
    return false;
  }
}

/** An ISO 4217 currency code such as `UGX` or `USD`. Three letters, upper case. */
export const isCurrencyCode = (value: string) => /^[A-Z]{3}$/.test(value);

/** A handle: letters, digits, underscore and dot, 2–32 characters, not starting with a dot. */
export const isUsername = (value: string) => /^[A-Za-z0-9_][A-Za-z0-9_.]{1,31}$/.test(value);

/** A postal code, loosely: letters, digits, spaces and hyphens, 2–12 characters. */
export const isPostcode = (value: string) => /^[A-Za-z0-9][A-Za-z0-9 -]{0,10}[A-Za-z0-9]$/.test(value);
