"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileIcon, UploadIcon } from "lucide-react";
import {
  FILE_CATEGORIES,
  fileMaxBytes,
  matchesContentType,
  mimeTypesFor,
  SNIFF_BYTES,
  sniffMatches,
  type FileField as FileFieldDef,
} from "@flaredev/core";
import { createReadUrlAction, createUploadUrlAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled?: boolean;
  field: FileFieldDef & { label: string };
  resourceName: string;
  fieldKey: string;
}

type Upload = { name: string; loaded: number; total: number; originalSize?: number; abort: () => void };

/** "contacts/avatar/2026/09/<uuid>-me.png" → "me.png" */
const fileName = (key: string) => key.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "");

const IMAGE_TYPES = new Set<string>(FILE_CATEGORIES.image);
const isImageKey = (key: string) => /\.(png|jpe?g|gif|webp|avif)$/i.test(key);

/**
 * How a picked image is re-encoded before it is uploaded.
 *
 * 1600px is larger than any screen shows a photograph at, and 0.82 is the quality
 * where WebP stops being visibly lossy for photographs. `auto` keeps anything with
 * real transparency lossless, so a logo is never flattened onto a black background.
 *
 * Change these and every upload changes with them; they are deliberately one object
 * rather than scattered through the call.
 */
const IMAGE_PROFILE = {
  name: "flare",
  max_width: 1600,
  max_height: 1600,
  crop: false,
  quality: 0.82,
  format: "auto",
  // A crash guard, not a security control: a solid-colour PNG of 144 megapixels is a
  // small file that will kill a mobile browser tab when it is decoded.
  max_pixels: 50_000_000,
} as const;

/**
 * The most we will decode in the browser, whatever the field's own limit is.
 *
 * The size check moves to *after* optimisation for images, because a 6 MB photo that
 * becomes 32 KB should not be refused for being 6 MB. This is the bound that stops
 * that being an invitation to hand the tab a 500 MB file.
 */
const MAX_DECODE_BYTES = 80 * 1024 * 1024;

/** GIF loses every frame but the first on a canvas, so it is passed through untouched. */
const OPTIMISABLE = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);

/** What `prepare` hands to the uploader: the bytes to send, and what to call them. */
interface Prepared {
  blob: Blob;
  name: string;
  type: string;
  /** The size of what the user picked, when that differs from what is being sent. */
  originalSize?: number;
}

/** "me.PNG" + "image/webp" → "me.webp", so the stored key says what the bytes are. */
function renameTo(name: string, mime: string): string {
  const extension = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "bin";
  return `${name.replace(/\.[^./\\]+$/, "") || "image"}.${extension}`;
}

const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** "1.9 MB" — with a non-breaking space so a size never wraps apart. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${whole.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${whole.format(bytes / 1024)} KB`;
  const megabytes = bytes / 1024 / 1024;
  return `${(megabytes < 10 ? oneDecimal : whole).format(megabytes)} MB`;
}

/** ["image", "pdf"] → "image or PDF" (acronyms stay upper case). */
function describeAccept(accept: readonly string[]): string {
  if (accept.includes("any")) return "any file";
  const names = accept.map((category) => (category === "pdf" || category === "csv" ? category.toUpperCase() : category));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0]!;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "image/png" → "PNG", used when a file's contents don't match its type. */
const typeName = (type: string) => (type.split("/")[1] ?? type).replace(/^vnd\..*\./, "").toUpperCase();

/** PUT with progress events, which fetch() can't report for uploads. */
function put(url: string, file: Prepared, onProgress: (loaded: number) => void, signal: { abort?: () => void }) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    signal.abort = () => request.abort();
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve();
      let message = `Upload failed (${request.status}).`;
      try {
        message = (JSON.parse(request.responseText) as { error?: string }).error ?? message;
      } catch {
        // Not JSON: keep the status message.
      }
      reject(new Error(message));
    };
    request.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    request.onabort = () => reject(new DOMException("Upload cancelled.", "AbortError"));
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.send(file.blob);
  });
}

/**
 * Upload widget for a `file:[…]` field. Checks type, size and contents in the browser
 * first (the server repeats every check), uploads straight to storage through a signed
 * URL with progress, and stores the object key in the form.
 */
export function FileField({ id, value, onChange, invalid, disabled, field, resourceName, fieldKey }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const helpId = useId();
  const instructionId = useId();
  const [upload, setUpload] = useState<Upload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const accepted = mimeTypesFor(field.accept);
  const maxBytes = fileMaxBytes(field);
  const help = `${capitalize(describeAccept(field.accept))}, up to ${formatBytes(maxBytes)}`;
  const busy = upload !== null;

  // Thumbnail for a stored image (a local preview replaces it while uploading).
  useEffect(() => {
    if (!value || !isImageKey(value)) return setPreview(null);
    let cancelled = false;
    void createReadUrlAction(resourceName, fieldKey, value).then((result) => {
      if (!cancelled && result.ok) setPreview(result.data.url);
    });
    return () => {
      cancelled = true;
    };
  }, [value, resourceName, fieldKey]);

  async function check(file: File): Promise<string | null> {
    const type = file.type || "application/octet-stream";
    if (!matchesContentType(type, accepted)) return `${field.label} accepts ${describeAccept(field.accept)} files.`;
    // An image is measured after it has been shrunk — a 6 MB photo that becomes 32 KB
    // is not over a 1 MB limit, and refusing it before trying would be a lie. Anything
    // else is measured as it is, because nothing is going to make it smaller.
    const limit = OPTIMISABLE.has(type) ? Math.max(maxBytes, MAX_DECODE_BYTES) : maxBytes;
    if (file.size > limit) return `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(limit)}.`;
    const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer());
    if (sniffMatches(type, head) === false) {
      return `${file.name} isn't a valid ${typeName(type)} file. It may have been renamed; choose the original file.`;
    }
    return null;
  }

  /**
   * The bytes to upload: the picked file, or a smaller version of it.
   *
   * The optimiser is imported here rather than at the top of the file, so a form with
   * no image field never loads a canvas encoder, and a page that only reads records
   * never loads it at all.
   *
   * A file that cannot be decoded is uploaded untouched. Losing somebody's upload
   * because a codec choked is the worse of the two failures.
   */
  async function prepare(file: File): Promise<Prepared> {
    const type = file.type || "application/octet-stream";
    const asIs: Prepared = { blob: file, name: file.name, type };
    if (!OPTIMISABLE.has(type)) return asIs;

    try {
      setStatus(`Optimising ${file.name}…`);
      const { optimizeImage } = await import("@gritframework/upload/web");
      const { primary } = await optimizeImage(file, IMAGE_PROFILE);
      // Only if it actually helped: re-encoding a small, already-optimised image can
      // come out larger, and uploading the bigger one would be a straight loss.
      if (primary.blob.size >= file.size) return asIs;
      return {
        blob: primary.blob,
        name: renameTo(file.name, primary.mime),
        type: primary.mime,
        originalSize: file.size,
      };
    } catch {
      return asIs;
    }
  }

  async function start(file: File) {
    setError(null);
    const problem = await check(file);
    if (problem) return setError(problem);

    const signal: { abort?: () => void } = {};
    const localPreview = IMAGE_TYPES.has(file.type) ? URL.createObjectURL(file) : null;
    if (localPreview) setPreview(localPreview);

    try {
      // Shrink first, then sign: the URL carries the size it is allowed to accept, and
      // that has to be the size of what is actually being sent.
      const sending = await prepare(file);
      if (sending.blob.size > maxBytes) {
        const was = sending.originalSize ? ` (${formatBytes(sending.originalSize)} before optimising)` : "";
        throw new Error(`${file.name} is ${formatBytes(sending.blob.size)}${was}; the limit is ${formatBytes(maxBytes)}.`);
      }

      setUpload({
        name: file.name,
        loaded: 0,
        total: sending.blob.size,
        originalSize: sending.originalSize,
        abort: () => signal.abort?.(),
      });
      setStatus(`Uploading ${file.name}…`);

      const signed = await createUploadUrlAction(resourceName, fieldKey, {
        name: sending.name,
        type: sending.type,
        size: sending.blob.size,
      });
      if (!signed.ok) throw new Error(signed.error);
      await put(signed.data.url, sending, (loaded) => setUpload((current) => current && { ...current, loaded }), signal);
      onChange(signed.data.key);
      setStatus(`${file.name} uploaded`);
    } catch (cause) {
      const cancelled = cause instanceof DOMException && cause.name === "AbortError";
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Upload failed.");
      setStatus(cancelled ? "Upload cancelled" : "Upload failed");
      if (localPreview) setPreview(null);
    } finally {
      if (localPreview) URL.revokeObjectURL(localPreview);
      setUpload(null);
      if (input.current) input.current.value = "";
    }
  }

  async function open() {
    const result = await createReadUrlAction(resourceName, fieldKey, value);
    if (result.ok) window.open(result.data.url, "_blank", "noopener");
    else setError(result.error);
  }

  function remove() {
    setError(null);
    setPreview(null);
    onChange("");
    setStatus("File removed");
  }

  const choose = () => input.current?.click();
  const percent = upload && upload.total > 0 ? Math.round((upload.loaded / upload.total) * 100) : 0;

  const dropHandlers = {
    onDragOver: (event: React.DragEvent) => {
      if (disabled || busy) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      const file = event.dataTransfer.files[0];
      if (file && !disabled && !busy) void start(file);
    },
  };

  const thumbnail = (
    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL
        <img src={preview} alt="" width={64} height={64} className="size-full object-cover" />
      ) : (
        <FileIcon aria-hidden="true" className="size-6 text-muted-foreground" />
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* The native input only opens the file chooser; the visible button is the control
          the field's label points at, so assistive tech sees one control, not two. */}
      <input
        ref={input}
        type="file"
        accept={accepted.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void start(file);
        }}
      />

      {upload ? (
        <div className="flex items-center gap-3 rounded-lg border p-3">
          {thumbnail}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{upload.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {percent}% · {formatBytes(upload.loaded)} of {formatBytes(upload.total)}
                {upload.originalSize !== undefined && (
                  <span className="text-primary"> · from {formatBytes(upload.originalSize)}</span>
                )}
              </span>
            </div>
            <Progress value={percent} aria-label={`Uploading ${upload.name}`} />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={upload.abort}>
            Cancel upload
          </Button>
        </div>
      ) : value ? (
        <div
          {...dropHandlers}
          className={cn("flex items-center gap-3 rounded-lg border p-3", dragging && "border-primary bg-muted")}
          data-invalid={invalid || undefined}
        >
          {thumbnail}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{fileName(value)}</span>
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={open}>
              Open<span className="sr-only"> {fileName(value)}</span>
            </Button>
            {/* The field label points here; aria-label keeps the button named for what it does. */}
            <Button
              id={id}
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={choose}
              aria-label={`Replace ${field.label.toLowerCase()} file`}
            >
              Replace
            </Button>
            {!field.required && (
              <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={remove}>
                Remove<span className="sr-only"> {field.label.toLowerCase()} file</span>
              </Button>
            )}
          </div>
        </div>
      ) : (
        <button
          id={id}
          type="button"
          {...dropHandlers}
          onClick={choose}
          disabled={disabled}
          aria-describedby={`${instructionId} ${helpId}`}
          aria-invalid={invalid || Boolean(error) || undefined}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors outline-none motion-reduce:transition-none",
            "hover:border-primary/50 hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
            dragging ? "border-primary bg-primary/5" : (invalid || error) && "border-destructive",
          )}
        >
          <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <UploadIcon aria-hidden="true" className="size-5" />
          </span>
          <span id={instructionId} className="text-sm font-medium">
            {dragging ? (
              "Drop to upload"
            ) : (
              <>
                Drop a file here <span className="text-muted-foreground">or click to choose</span>
              </>
            )}
          </span>
          <span id={helpId} className="text-xs text-muted-foreground">
            {help}
          </span>
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
    </div>
  );
}
