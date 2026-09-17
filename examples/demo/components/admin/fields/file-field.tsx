"use client";

import { useRef, useState } from "react";
import { DownloadIcon, PaperclipIcon, UploadIcon, XIcon } from "lucide-react";
import { mimeTypesFor, type FileField as FileFieldDef } from "@flare/core";
import { toast } from "sonner";
import { createReadUrlAction, createUploadUrlAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

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

const fileName = (key: string) => key.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, "");

/**
 * Upload widget for a `file:[…]` field: asks the server for a signed URL (which checks
 * the type and size against the descriptor), uploads to it, and stores the object key.
 */
export function FileField({ id, value, onChange, invalid, disabled, field, resourceName, fieldKey }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const accept = mimeTypesFor(field.accept).join(",");

  async function upload(file: File) {
    setUploading(true);
    try {
      const signed = await createUploadUrlAction(resourceName, fieldKey, { name: file.name, type: file.type, size: file.size });
      if (!signed.ok) {
        toast.error(signed.error);
        return;
      }
      const response = await fetch(signed.data.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(body?.error ?? `Upload failed (${response.status}).`);
        return;
      }
      onChange(signed.data.key);
      toast.success(`${field.label} uploaded.`);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  async function download() {
    const result = await createReadUrlAction(value);
    if (result.ok) window.open(result.data.url, "_blank", "noopener");
    else toast.error(result.error);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled || uploading}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <Button type="button" variant="outline" disabled={disabled || uploading} onClick={() => input.current?.click()}>
        {uploading ? <Spinner data-icon="inline-start" /> : <UploadIcon data-icon="inline-start" />}
        {value ? "Replace file" : "Upload file"}
      </Button>
      {value && (
        <>
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <PaperclipIcon className="size-3.5" />
            {fileName(value)}
          </span>
          <Button type="button" variant="ghost" size="icon" aria-label="Download file" onClick={download}>
            <DownloadIcon />
          </Button>
          {!field.required && (
            <Button type="button" variant="ghost" size="icon" aria-label="Remove file" disabled={disabled} onClick={() => onChange("")}>
              <XIcon />
            </Button>
          )}
        </>
      )}
      {!value && <span className="text-xs text-muted-foreground">Accepts {field.accept.join(", ")}</span>}
    </div>
  );
}
