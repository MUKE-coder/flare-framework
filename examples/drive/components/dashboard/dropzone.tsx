"use client";

import { useRef, useState, type DragEvent } from "react";
import { UploadCloudIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Called with the files that were dropped or picked. */
  onFiles: (files: File[]) => void;
  /** `accept` for the hidden input, e.g. ".csv,text/csv" or "image/*". */
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** The line under the heading: what this one takes. */
  hint?: string;
  label?: string;
  className?: string;
  /** Shown inside the zone instead of the prompt, e.g. a preview or a progress bar. */
  children?: React.ReactNode;
}

/**
 * Drop a file, or click to pick one.
 *
 * The input stays in the markup and keeps doing the work — it's what makes the keyboard,
 * screen readers and the file picker behave — while the drop target is the label around
 * it. Dragging over the page doesn't open the browser's own download of the file because
 * both dragover and drop are cancelled here.
 */
export function Dropzone({ onFiles, accept, multiple = false, disabled, hint, label = "Drop a file here", className, children }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  };

  const stop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <label
      onDragOver={(event) => {
        stop(event);
        if (!disabled) setOver(true);
      }}
      onDragLeave={(event) => {
        stop(event);
        setOver(false);
      }}
      onDrop={(event) => {
        stop(event);
        setOver(false);
        if (!disabled) take(event.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors",
        over ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50",
        disabled && "pointer-events-none opacity-60",
        className,
      )}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          take(event.target.files);
          // Picking the same file twice in a row should still fire a change.
          event.target.value = "";
        }}
      />
      {children ?? (
        <>
          <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
            <UploadCloudIcon className="size-5" />
          </span>
          <span className="text-sm font-medium">
            {label} <span className="text-muted-foreground">or click to choose</span>
          </span>
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </>
      )}
    </label>
  );
}
