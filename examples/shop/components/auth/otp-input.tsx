"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Called once the last character is typed or pasted, so nobody taps "Continue". */
  onComplete?: (value: string) => void;
  length?: number;
  label?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Backup codes are letters and digits; emailed codes are digits. */
  mode?: "numeric" | "alphanumeric";
  id?: string;
}

/**
 * A code box that is really one input with the cells drawn behind it.
 *
 * The obvious build — one input per digit — breaks paste, iOS and Android code
 * autofill, backspace across cells and screen readers, all of which a single input
 * gets for free from `autocomplete="one-time-code"`.
 */
export function OtpInput({ value, onChange, onComplete, length = 6, label = "Verification code", autoFocus, disabled, mode = "numeric", id }: Props) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  const clean = (raw: string) => (mode === "numeric" ? raw.replace(/\D/g, "") : raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()).slice(0, length);

  const handle = (raw: string) => {
    const next = clean(raw);
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  const characters = [...value];
  // The cursor sits on the first empty cell, or the last one when it's full.
  const cursor = Math.min(value.length, length - 1);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="sr-only">
        {label}
      </label>
      <div className="relative" onClick={() => input.current?.focus()}>
        <input
          ref={input}
          id={fieldId}
          value={value}
          onChange={(event) => handle(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onPaste={(event) => {
            event.preventDefault();
            handle(event.clipboardData.getData("text"));
          }}
          inputMode={mode === "numeric" ? "numeric" : "text"}
          autoComplete="one-time-code"
          autoCorrect="off"
          spellCheck={false}
          maxLength={length}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={label}
          // Invisible but really there, so autofill, paste and the caret all work.
          // The right padding keeps a password manager's icon off the last cell.
          className="absolute inset-0 h-full w-full cursor-text pr-10 text-transparent caret-transparent opacity-0 outline-none"
        />
        <div className="flex gap-2" aria-hidden="true">
          {Array.from({ length }, (_, index) => {
            const active = focused && index === cursor;
            return (
              <div
                key={index}
                className={cn(
                  "relative grid h-13 flex-1 place-items-center rounded-[calc(var(--radius)-2px)] border border-border bg-surface text-lg font-medium tabular-nums transition-[border-color,box-shadow]",
                  active && "border-brand ring-[3px] ring-brand/20",
                  disabled && "opacity-60",
                )}
              >
                {characters[index] ?? ""}
                {active && !characters[index] && <span className="absolute h-5 w-px animate-pulse bg-foreground" />}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
