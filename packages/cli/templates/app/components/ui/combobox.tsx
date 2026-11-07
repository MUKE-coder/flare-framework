"use client";

import { useMemo, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  /** A second line, for options whose label is not enough on its own. */
  hint?: string;
}

/**
 * A select you can type into.
 *
 * A plain `<select>` is fine for three options and miserable for thirty: you cannot
 * search it, and on a touch device it becomes a native wheel. This is the pattern the
 * relation field already used — a popover over a command list — made general, so every
 * place in the app that chooses one thing from a list behaves the same way.
 *
 * `allowCustom` lets the typed text be the answer. That is for values which are not a
 * fixed set — a role is just a string your policies name, so the list is a convenience
 * rather than a constraint, and the field must not stop you inventing one.
 */
export function Combobox({
  options,
  value,
  onChange,
  id,
  name,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "Nothing found.",
  allowCustom = false,
  customLabel = (typed: string) => `Use "${typed}"`,
  disabled,
  invalid,
  className,
}: {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** Mirrors the value into a hidden input, so plain `<form>` submission sees it. */
  name?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  allowCustom?: boolean;
  customLabel?: (typed: string) => string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((option) => option.value === value);
  // A custom value is shown as itself rather than falling back to the placeholder,
  // which would make a perfectly good answer look like no answer.
  const display = selected?.label ?? (value || null);

  const typed = query.trim();
  const canCreate = allowCustom && typed.length > 0 && !options.some((option) => option.value.toLowerCase() === typed.toLowerCase());

  const choose = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  const filtered = useMemo(() => {
    if (!typed) return options;
    const needle = typed.toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle));
  }, [options, typed]);

  return (
    <>
      {name && <input type="hidden" name={name} value={value} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            className={cn("w-full justify-between font-normal", !display && "text-muted-foreground", className)}
          >
            <span className="truncate">{display ?? placeholder}</span>
            <ChevronsUpDownIcon className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
            <CommandList>
              {filtered.length === 0 && !canCreate && <CommandEmpty>{emptyMessage}</CommandEmpty>}
              {filtered.length > 0 && (
                <CommandGroup>
                  {filtered.map((option) => (
                    <CommandItem key={option.value} value={option.value} onSelect={() => choose(option.value)}>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{option.label}</span>
                        {option.hint && <span className="truncate text-xs text-muted-foreground">{option.hint}</span>}
                      </span>
                      <CheckIcon className={cn("ml-auto", option.value === value ? "opacity-100" : "opacity-0")} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {canCreate && (
                <CommandGroup>
                  <CommandItem value={`__create__${typed}`} onSelect={() => choose(typed)}>
                    <PlusIcon />
                    {customLabel(typed)}
                  </CommandItem>
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
