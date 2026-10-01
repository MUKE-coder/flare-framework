"use client";

import { useState } from "react";
import { BracesIcon, CheckIcon } from "lucide-react";
import type { JsonField as JsonDef } from "@flaredev/core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  id: string;
  field: JsonDef & { label: string };
  /** Form state: the JSON source as typed. */
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled?: boolean;
}

/** Parse, and say what is wrong if it will not. */
function problem(source: string, mustBeObject: boolean): string | null {
  const text = source.trim();
  if (text === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    // The browser's message names the position, which is the useful part.
    return error instanceof Error ? error.message.replace(/^JSON\.parse:\s*/, "") : "Not valid JSON";
  }
  if (mustBeObject && (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))) {
    return "This field holds a JSON object, like { }";
  }
  return null;
}

/**
 * A `json` field: a textarea that says what is wrong with the JSON as you type.
 *
 * The form state is the source text, not a parsed value, so what you typed is what you
 * see — including while it is half-written. The save is blocked by the form's own
 * validation, which rejects text that does not parse, so nothing malformed can be stored;
 * this is here to tell you *why* before you get there.
 */
export function JsonField({ id, field, value, onChange, invalid, disabled }: Props) {
  const [touched, setTouched] = useState(false);
  const message = problem(value, field.object === true);
  const lines = Math.min(16, Math.max(4, value.split("\n").length + 1));

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id={id}
        value={value}
        rows={lines}
        spellCheck={false}
        disabled={disabled}
        aria-invalid={invalid || (touched && message !== null) || undefined}
        aria-describedby={message ? `${id}-json-error` : undefined}
        onBlur={() => setTouched(true)}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.object ? '{\n  "key": "value"\n}' : "null"}
        className="font-mono text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        {message ? (
          <p id={`${id}-json-error`} className="text-destructive text-sm">
            {message}
          </p>
        ) : value.trim() === "" ? (
          <p className="text-muted-foreground text-sm">Empty</p>
        ) : (
          <p className="text-muted-foreground flex items-center gap-1 text-sm">
            <CheckIcon className="size-3.5" />
            Valid JSON
          </p>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled || message !== null || value.trim() === ""}
          onClick={() => onChange(JSON.stringify(JSON.parse(value), null, 2))}
        >
          <BracesIcon data-icon="inline-start" />
          Format
        </Button>
      </div>
    </div>
  );
}
