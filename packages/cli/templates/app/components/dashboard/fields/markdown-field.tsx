"use client";

import { useState } from "react";
import { EyeIcon, PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "./markdown";

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
}

/**
 * A `markdown` field: write on one pane, see it on the other.
 *
 * Not a WYSIWYG editor, and that is a choice rather than a shortcut. A rich-text editor is
 * a large dependency that stores HTML you then have to sanitise everywhere it is shown;
 * Markdown is text, it diffs, it survives being edited by a script, and the preview uses
 * the same renderer as the record page.
 *
 * Two buttons rather than a Tabs component, because this is two states and Tabs would mean
 * adding another Radix package to every app for one field.
 */
export function MarkdownField({ id, value, onChange, invalid, disabled, required, placeholder, maxLength }: Props) {
  const [previewing, setPreviewing] = useState(false);
  const lines = Math.min(24, Math.max(6, value.split("\n").length + 1));
  const empty = value.trim() === "";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1" role="group" aria-label="Markdown editor view">
        <Button
          type="button"
          size="sm"
          variant={previewing ? "ghost" : "secondary"}
          aria-pressed={!previewing}
          onClick={() => setPreviewing(false)}
        >
          <PencilIcon data-icon="inline-start" />
          Write
        </Button>
        <Button
          type="button"
          size="sm"
          variant={previewing ? "secondary" : "ghost"}
          aria-pressed={previewing}
          disabled={empty}
          onClick={() => setPreviewing(true)}
        >
          <EyeIcon data-icon="inline-start" />
          Preview
        </Button>
      </div>
      {previewing ? (
        // Same minimum height as the editor, so switching does not move the page about.
        <div className="min-h-32 rounded-md border px-3 py-2">
          <Markdown source={value} />
        </div>
      ) : (
        <Textarea
          id={id}
          value={value}
          rows={lines}
          disabled={disabled}
          required={required}
          maxLength={maxLength}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder ?? "Markdown: **bold**, [links](https://example.com), - lists"}
          className="font-mono text-sm"
        />
      )}
    </div>
  );
}
