"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { XIcon } from "lucide-react";
import { parseMultiValue, type TagsField as TagsDef } from "@flaredev/core";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Props {
  id: string;
  field: TagsDef & { label: string };
  /** Form state: a JSON array of the tags. */
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled?: boolean;
}

/**
 * A `tags` field: type a label, press Enter.
 *
 * Unlike a multiselect there is no list to pick from, so the input has to carry the whole
 * interaction: Enter and comma commit, Backspace on an empty box removes the last tag, and
 * a duplicate is refused rather than added twice — case-insensitively, because "Urgent"
 * and "urgent" as two tags is a mistake every time.
 */
export function TagsField({ id, field, value, onChange, invalid, disabled }: Props) {
  const tags = parseMultiValue(value);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const maxLength = field.maxLength ?? 32;
  const full = field.maxItems !== undefined && tags.length >= field.maxItems;

  const commit = (raw: string) => {
    const tag = raw.trim().slice(0, maxLength);
    setDraft("");
    if (!tag || full) return;
    if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
    onChange(JSON.stringify([...tags, tag]));
  };

  const remove = (tag: string) => onChange(JSON.stringify(tags.filter((existing) => existing !== tag)));

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // Enter in a text input submits the form; this is a tag, not a save.
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      event.preventDefault();
      remove(tags[tags.length - 1]!);
    }
  }

  return (
    <div
      id={id}
      role="group"
      aria-label={field.label}
      aria-invalid={invalid || undefined}
      className="border-input focus-within:border-ring focus-within:ring-ring/50 aria-invalid:border-destructive flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5 focus-within:ring-[3px]"
      // The box looks like one input, so clicking the empty part of it focuses the input.
      onClick={() => input.current?.focus()}
    >
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          {tag}
          {!disabled && (
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="hover:text-foreground text-muted-foreground rounded-sm"
              onClick={(event) => {
                event.stopPropagation();
                remove(tag);
              }}
            >
              <XIcon className="size-3" />
            </button>
          )}
        </Badge>
      ))}
      <Input
        ref={input}
        value={draft}
        disabled={disabled || full}
        maxLength={maxLength}
        // Committing on blur too: typing a tag and clicking Save should not lose it.
        onBlur={() => commit(draft)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={full ? `${field.maxItems} is the most` : (field.placeholder ?? (tags.length === 0 ? "Type and press Enter" : ""))}
        className="h-6 min-w-32 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        aria-label={`Add a ${field.label.toLowerCase()} tag`}
      />
    </div>
  );
}
