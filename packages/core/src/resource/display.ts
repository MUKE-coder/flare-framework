import type { StoredField } from "./fields.js";
import { countryName, flagEmoji, formatPhone } from "./formats.js";

/** Semantic tone for a status-like enum value (style-guide status colors). */
export type Tone = "success" | "warning" | "danger" | "neutral";

const TONES: [Tone, RegExp][] = [
  ["success", /^(paid|fulfilled|active|approved|completed?|delivered|done|published|resolved|shipped|succeeded|success|verified|won)$/],
  ["danger", /^(banned|blocked|cancel+ed|churned|declined|error|expired|failed|lost|overdue|refunded|rejected|suspended)$/],
  ["warning", /^(awaiting|draft|in[-_ ]?review|on[-_ ]?hold|pending|processing|review|trial|unpaid|unverified)$/],
];

export function statusTone(value: unknown): Tone {
  if (typeof value !== "string") return "neutral";
  const normalized = value.trim().toLowerCase();
  return TONES.find(([, pattern]) => pattern.test(normalized))?.[0] ?? "neutral";
}

/** Display label for an enum option: the descriptor's optionLabels, else "on_hold" → "On hold". */
export function optionLabel(def: StoredField, value: string): string {
  if ((def.kind === "enum" || def.kind === "multiselect") && def.optionLabels?.[value]) return def.optionLabels[value]!;
  const text = value.replace(/[_-]+/g, " ").trim();
  return text ? text[0]!.toUpperCase() + text.slice(1) : value;
}

export interface FormatOptions {
  locale?: string;
  timeZone?: string;
}

/**
 * A field value as short display text (tables, detail views). Relations and files are
 * returned as-is (their ids/keys); callers resolve those to titles or links.
 */
export function formatValue(def: StoredField | { kind: "timestamp" }, value: unknown, options: FormatOptions = {}): string {
  if (value === null || value === undefined || value === "") return "—";
  const locale = options.locale ?? "en-US";
  switch (def.kind) {
    case "boolean":
      return value ? "Yes" : "No";
    case "int":
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(value));
    case "float":
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value));
    case "date": {
      // Date-only values have no time zone: format them in UTC so they never shift a day.
      const date = new Date(`${String(value)}T00:00:00Z`);
      return Number.isNaN(date.getTime())
        ? String(value)
        : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
    }
    case "datetime":
    case "timestamp": {
      const date = value instanceof Date ? value : new Date(value as string | number);
      return Number.isNaN(date.getTime())
        ? String(value)
        : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: options.timeZone ?? "UTC" }).format(date);
    }
    case "enum":
      return optionLabel(def, String(value));
    case "multiselect":
      return Array.isArray(value) && value.length ? value.map((item) => optionLabel(def, String(item))).join(", ") : "—";
    case "string":
      if (def.format === "tel") return formatPhone(String(value));
      if (def.format === "country") return `${flagEmoji(String(value))} ${countryName(String(value), locale.split("-")[0])}`.trim();
      return String(value);
    case "file":
      return String(value).split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "");
    default:
      return String(value);
  }
}
