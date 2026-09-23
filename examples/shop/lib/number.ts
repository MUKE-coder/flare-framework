/**
 * Numbers as people read and type them.
 *
 * A price typed as 2000 is easier to check at a glance as 2,000, but the form and the
 * API only ever see the plain number — the grouping is put on for display and taken off
 * again on every keystroke, so nothing downstream has to unpick a comma.
 *
 * Kept free of server imports: the field widgets that use it run in the browser.
 */

/** "2000.5" → "2,000.5". A half-typed "1," or "12." is left alone so typing isn't fought. */
export function groupDigits(value: string): string {
  if (!value) return "";
  const negative = value.startsWith("-");
  const body = negative ? value.slice(1) : value;
  const [whole = "", ...rest] = body.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // Keep a trailing "." while someone is still typing the decimals.
  const decimals = rest.length > 0 ? `.${rest.join("")}` : "";
  return `${negative ? "-" : ""}${grouped}${decimals}`;
}

/**
 * "2,000.50" → "2000.50". Everything that isn't a digit goes, along with any minus sign
 * that isn't leading and any second decimal point.
 */
export function ungroup(value: string, allowDecimal: boolean): string {
  const negative = value.trimStart().startsWith("-");
  const digits = value.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = digits.split(".");
  const body = allowDecimal && rest.length > 0 ? `${whole}.${rest.join("")}` : whole;
  return `${negative && body ? "-" : ""}${body}`;
}
