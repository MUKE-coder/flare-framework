"use client";

import { useEffect, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { RelationMeta } from "./field-widget";

interface Option {
  id: string;
  title: string;
}

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled?: boolean;
  required: boolean;
  relation: RelationMeta & { initialTitle?: string };
}

/**
 * Picker for a `belongsTo` field: searches the related resource through its generated
 * REST API (so the same authorization applies) and stores the chosen record's id.
 */
export function RelationField({ id, value, onChange, invalid, disabled, required, relation }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(relation.initialTitle ?? "");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const search = new URLSearchParams({ perPage: "20", sort: relation.titleField });
        if (query.trim()) search.set("q", query.trim());
        const response = await fetch(`/api/${relation.slug}?${search}`, { signal: controller.signal, credentials: "same-origin" });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { data: Record<string, unknown>[] };
        setOptions(body.data.map((row) => ({ id: String(row.id), title: String(row[relation.titleField] ?? row.id) })));
      } catch (error) {
        if ((error as Error).name !== "AbortError") setOptions([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, query, relation.slug, relation.titleField]);

  return (
    <div className="flex items-center gap-1">
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
            className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}
          >
            {value ? (title || value) : `Choose ${relation.label.toLowerCase()}`}
            <ChevronsUpDownIcon className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={`Search ${relation.pluralLabel.toLowerCase()}…`}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Spinner /> Searching…
                </div>
              ) : (
                <CommandEmpty>No {relation.pluralLabel.toLowerCase()} found.</CommandEmpty>
              )}
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.id}
                    value={option.id}
                    onSelect={() => {
                      onChange(option.id);
                      setTitle(option.title);
                      setOpen(false);
                    }}
                  >
                    {option.title}
                    <CheckIcon className={cn("ml-auto", option.id === value ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && !required && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Clear ${relation.label.toLowerCase()}`}
          disabled={disabled}
          onClick={() => {
            onChange("");
            setTitle("");
          }}
        >
          <XIcon />
        </Button>
      )}
    </div>
  );
}
