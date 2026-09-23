import { slugify, type StoredField } from "@flaredev/core";

/**
 * Values a form can make up for itself.
 *
 * A unique code — a SKU, a slug, a reference — is the shop's business, not something
 * worth typing by hand, but it isn't something to impose either: these are offered
 * behind a button, and whatever comes out can be typed over.
 *
 * Only unique, unformatted strings get one. An email or a URL is unique too, and
 * inventing one would be nonsense.
 */
export function canSuggest(field: StoredField): boolean {
  return field.kind === "string" && field.unique === true && (field.format === undefined || field.format === "slug");
}

/** Four digits, so two products added in the same minute don't collide. */
const tail = () => String(Math.floor(Math.random() * 10_000)).padStart(4, "0");

/**
 * A code for `key`, derived from what's been typed so far.
 *
 * "Brushed steel desk lamp" gives the slug `brushed-steel-desk-lamp` and the SKU
 * `BRU-4821` — recognisable at a glance in a list, which is the whole point of a code
 * someone reads out over a counter.
 */
export function suggestValue(key: string, field: StoredField, title: string): string {
  const source = title.trim();
  const format = field.kind === "string" ? field.format : undefined;
  if (format === "slug" || /slug/i.test(key)) {
    return source ? slugify(source) : `item-${tail()}`;
  }
  const letters = source.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
  return `${letters || "REF"}-${tail()}`;
}
