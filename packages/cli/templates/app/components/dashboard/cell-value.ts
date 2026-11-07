import { optionLabel, type EnumField, type MultiSelectField, type StoredField } from "@flaredev/core";

/**
 * Turning typed or pasted text into the value a field expects.
 *
 * Shared by the CSV import and the bulk-add sheet, deliberately: both take text a
 * person produced in a spreadsheet, and if they disagreed about what "yes", "1" or
 * "Lead" means, the same file would import one way and paste another.
 */

/** Comparison that ignores case, spaces, dashes and underscores. */
export const squash = (text: string) => text.toLowerCase().replace(/[\s_-]+/g, "");

/** An option from a cell holding either the stored value or the label shown in the admin. */
export function matchOption(def: EnumField | MultiSelectField, text: string): string {
  const match = def.options.find(
    (option) => option === text || squash(option) === squash(text) || squash(optionLabel(def, option)) === squash(text),
  );
  return match ?? text;
}

/**
 * A cell as the value its field expects. Text that doesn't convert is passed through
 * unchanged so validation reports it against the field, rather than guessing.
 */
export function toValue(def: StoredField, raw: string): unknown {
  const text = raw.trim();
  if (text === "") return undefined;
  switch (def.kind) {
    case "int":
    case "float": {
      const number = Number(text);
      return Number.isFinite(number) ? number : text;
    }
    case "boolean": {
      const lower = text.toLowerCase();
      if (["true", "yes", "1"].includes(lower)) return true;
      if (["false", "no", "0"].includes(lower)) return false;
      return text;
    }
    case "enum":
      return matchOption(def, text);
    case "multiselect":
      return text
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => matchOption(def, part));
    case "tags":
      // Semicolons first so a tag may contain a comma: "a, b; c" is two tags.
      return text
        .split(text.includes(";") ? ";" : ",")
        .map((part) => part.trim())
        .filter(Boolean);
    case "json":
      try {
        return JSON.parse(text);
      } catch {
        // Handed over as typed: the validator reports it against the row and the column,
        // which is more use than this throwing halfway through.
        return text;
      }
    default:
      // Dates keep their text: the descriptor's schema decides which formats it takes.
      return text;
  }
}
