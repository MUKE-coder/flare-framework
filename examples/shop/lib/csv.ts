/**
 * CSV, the way spreadsheets expect it (RFC 4180): fields holding a comma, a quote or a
 * line break are quoted, and quotes inside them are doubled.
 *
 * Shared by the table's "export selected" (in the browser) and the export action (on
 * the server), so both produce the same file.
 */

export interface CsvColumn {
  key: string;
  label: string;
}

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = Array.isArray(value) ? value.join("; ") : value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[], columns: CsvColumn[]): string {
  const header = columns.map((column) => csvCell(column.label)).join(",");
  const body = rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(","));
  return [header, ...body].join("\r\n");
}
