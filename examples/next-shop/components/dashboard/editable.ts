import type { StoredField } from "@flaredev/core";

/**
 * Kinds worth editing in place: one control, one value, no picker or upload.
 *
 * Kept out of inline-cell.tsx because that file is a client component, and a server
 * component can't call a function exported from one.
 */
export function isInlineEditable(def: StoredField): boolean {
  if (def.kind === "string") return !def.format;
  return ["int", "float", "boolean", "enum"].includes(def.kind);
}
