/**
 * "2.4 MB". Bytes are what the API returns; this is what a person reads.
 *
 * It lives on its own rather than in lib/drive.ts because both the server and the browser
 * need it, and everything in lib/drive.ts talks to the database — importing that from a
 * client component drags `cloudflare:workers` into the browser bundle, where it can't go.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
