"use client";

import { useEffect, useState } from "react";
import { FileIcon } from "lucide-react";
import { createReadUrlAction } from "@/app/dashboard/actions";

/** Keys that are worth showing rather than naming. */
const isImageKey = (key: string) => /\.(png|jpe?g|gif|webp|avif)$/i.test(key);

/** "products/2026/09/kettle-a1b2c3.png" → "kettle-a1b2c3.png" */
const basename = (key: string) => key.slice(key.lastIndexOf("/") + 1);

/**
 * A stored file in a table cell or a record's detail.
 *
 * Objects in the bucket are private, so there is no URL to put in `src` — one has to
 * be signed, which is a server action, which makes this a client component. The same
 * round trip the form field does, for the same reason.
 *
 * An image becomes a thumbnail; anything else is its filename, which is the useful
 * part of a key nobody wants to read in full.
 */
export function FileCell({
  resourceName,
  fieldKey,
  value,
  size = 36,
}: {
  resourceName: string;
  fieldKey: string;
  value: string;
  size?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const image = isImageKey(value);

  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    void createReadUrlAction(resourceName, fieldKey, value).then((result) => {
      if (!cancelled && result.ok) setUrl(result.data.url);
    });
    return () => {
      cancelled = true;
    };
  }, [image, value, resourceName, fieldKey]);

  if (!image) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <FileIcon aria-hidden="true" className="size-3.5" />
        <span className="max-w-[16ch] truncate">{basename(value)}</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden rounded-md border bg-muted align-middle"
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL
        <img src={url} alt="" width={size} height={size} className="size-full object-cover" />
      ) : null}
    </span>
  );
}
