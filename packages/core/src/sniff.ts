/**
 * Content sniffing for uploads: does a file's leading bytes match the type it claims?
 *
 * A browser (or anyone with a signed URL) chooses the Content-Type it sends, so a
 * `file:[image]` field can't rely on the label alone. These checks look at the
 * signature every real file of the type starts with. Used on the server as the
 * gate, and in the admin's file widget for instant feedback.
 */

/** Bytes needed from the start of a file for every check below. */
export const SNIFF_BYTES = 32;

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));

function startsWith(head: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (head.length < offset + signature.length) return false;
  return signature.every((byte, index) => head[offset + index] === byte);
}

const text = (head: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...head.subarray(offset, offset + length));

/** ISO base media (MP4, MOV, M4A, AVIF, HEIF…): "ftyp" at byte 4, then a 4-byte brand. */
const isoBrand = (head: Uint8Array) => (startsWith(head, ascii("ftyp"), 4) ? text(head, 8, 4) : null);

const riffType = (head: Uint8Array) => (startsWith(head, ascii("RIFF")) ? text(head, 8, 4) : null);

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const EMPTY_ZIP = [0x50, 0x4b, 0x05, 0x06];
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const EBML = [0x1a, 0x45, 0xdf, 0xa3]; // WebM, Matroska

const isZip = (head: Uint8Array) => startsWith(head, ZIP) || startsWith(head, EMPTY_ZIP);

/** Checks by exact MIME type. */
const EXACT: Record<string, (head: Uint8Array) => boolean> = {
  "image/png": (head) => startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/jpeg": (head) => startsWith(head, [0xff, 0xd8, 0xff]),
  "image/gif": (head) => startsWith(head, ascii("GIF87a")) || startsWith(head, ascii("GIF89a")),
  "image/webp": (head) => riffType(head) === "WEBP",
  "image/avif": (head) => ["avif", "avis", "mif1", "msf1"].includes(isoBrand(head) ?? ""),
  "application/pdf": (head) => startsWith(head, ascii("%PDF-")),
  "application/zip": isZip,
  // Office Open XML and OpenDocument files are zip archives.
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": isZip,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": isZip,
  "application/vnd.oasis.opendocument.text": isZip,
  "application/vnd.oasis.opendocument.spreadsheet": isZip,
  // Legacy .doc / .xls are OLE2 compound files.
  "application/msword": (head) => startsWith(head, OLE2),
  "application/vnd.ms-excel": (head) => startsWith(head, OLE2),
};

/** Container formats browsers and devices commonly produce for video/* and audio/*. */
function isMediaContainer(head: Uint8Array): boolean {
  return (
    isoBrand(head) !== null ||
    startsWith(head, EBML) ||
    startsWith(head, ascii("OggS")) ||
    ["AVI ", "WAVE"].includes(riffType(head) ?? "") ||
    startsWith(head, ascii("fLaC")) ||
    startsWith(head, ascii("ID3")) ||
    // MPEG audio frame sync (MP3/AAC without an ID3 tag).
    (head.length >= 2 && head[0] === 0xff && (head[1]! & 0xe0) === 0xe0) ||
    // MPEG program stream.
    startsWith(head, [0x00, 0x00, 0x01, 0xba])
  );
}

/** Text has no signature; what it can't have is control bytes other than tab, LF, FF and CR. */
const isText = (head: Uint8Array) => head.every((byte) => byte >= 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0c || byte === 0x0d);

/**
 * Whether `head` (the first {@link SNIFF_BYTES} bytes, or the whole file when it's
 * shorter) looks like `contentType`.
 *
 * Returns `undefined` for types with no known signature, so custom types passed to
 * `createUploadUrl` keep working; `false` means the bytes contradict the label.
 */
export function sniffMatches(contentType: string, head: Uint8Array): boolean | undefined {
  const type = contentType.split(";")[0]!.trim().toLowerCase();
  const exact = EXACT[type];
  if (exact) return exact(head);
  if (type.startsWith("video/") || type.startsWith("audio/")) return isMediaContainer(head);
  if (type === "text/plain" || type === "text/csv") return isText(head);
  return undefined;
}
