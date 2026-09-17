/** Naming helpers shared by descriptors and the generator. */

/** "OrderItem" / "order item" / "order-item" → ["order", "item"] */
export function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase());
}

export const pascalCase = (value: string) => words(value).map((w) => w[0]!.toUpperCase() + w.slice(1)).join("");
export const camelCase = (value: string) => {
  const pascal = pascalCase(value);
  return pascal ? pascal[0]!.toLowerCase() + pascal.slice(1) : pascal;
};
export const snakeCase = (value: string) => words(value).join("_");
export const kebabCase = (value: string) => words(value).join("-");
/** "orderItem" → "Order item" */
export const humanize = (value: string) => {
  const text = words(value).join(" ");
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
};

const UNCOUNTABLE = new Set(["equipment", "information", "rice", "money", "species", "series", "fish", "sheep", "data", "news"]);
const IRREGULAR: Record<string, string> = { person: "people", man: "men", woman: "women", child: "children", mouse: "mice" };

/** English plural of the last word: "category" → "categories", "OrderItem" → "OrderItems". */
export function pluralize(value: string): string {
  const match = /([A-Za-z]+)$/.exec(value);
  if (!match) return value;
  const word = match[1]!;
  const lower = word.toLowerCase();
  const head = value.slice(0, value.length - word.length);
  const keepCase = (plural: string) => (word[0] === word[0]!.toUpperCase() ? plural[0]!.toUpperCase() + plural.slice(1) : plural);

  if (UNCOUNTABLE.has(lower)) return value;
  if (IRREGULAR[lower]) return head + keepCase(IRREGULAR[lower]!);
  if (/[^aeiou]y$/i.test(word)) return head + word.slice(0, -1) + "ies";
  if (/(s|x|z|ch|sh)$/i.test(word)) return head + word + "es";
  return head + word + "s";
}
