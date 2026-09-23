"use client";

import { useMemo, useState } from "react";
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { countries, type Country } from "@flaredev/core";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Countries named in the viewer's language (falls back to English). */
function useCountries(): Country[] {
  return useMemo(() => countries(typeof navigator === "undefined" ? "en" : navigator.language.split("-")[0]), []);
}

interface ListProps {
  value: string;
  onSelect: (country: Country) => void;
  /** Show dialling codes next to names (for the phone input). */
  withDialCode?: boolean;
}

/** The searchable list itself: type a name, an ISO code or a dialling code. */
function CountryList({ value, onSelect, withDialCode }: ListProps) {
  const list = useCountries();
  return (
    <Command>
      <CommandInput placeholder={withDialCode ? "Search country or code…" : "Search countries…"} />
      <CommandList>
        <CommandEmpty>No country found.</CommandEmpty>
        <CommandGroup>
          {list.map((country) => (
            <CommandItem
              key={country.code}
              // cmdk filters on this: name, ISO code and dialling code all match.
              value={`${country.name} ${country.code} +${country.dialCode}`}
              onSelect={() => onSelect(country)}
            >
              <span aria-hidden="true" className="text-base leading-none">{country.flag}</span>
              <span className="truncate">{country.name}</span>
              {withDialCode && <span className="ml-auto text-xs text-muted-foreground tabular-nums">+{country.dialCode}</span>}
              <CheckIcon className={cn(withDialCode ? "" : "ml-auto", country.code === value ? "opacity-100" : "opacity-0")} />
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

interface FieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled?: boolean;
  required: boolean;
  placeholder?: string;
}

/** A `country` field: one ISO 3166-1 alpha-2 code, chosen from a searchable list. */
export function CountryField({ id, value, onChange, invalid, disabled, required, placeholder }: FieldProps) {
  const [open, setOpen] = useState(false);
  const list = useCountries();
  const selected = list.find((country) => country.code === value.toUpperCase());

  return (
    <div className="flex min-w-0 items-center gap-1">
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
            className={cn("min-w-0 flex-1 justify-between font-normal", !selected && "text-muted-foreground")}
          >
            <span className="flex min-w-0 items-center gap-2">
              {selected && <span aria-hidden="true" className="text-base leading-none">{selected.flag}</span>}
              <span className="truncate">{selected ? selected.name : (placeholder ?? "Choose a country")}</span>
            </span>
            <ChevronsUpDownIcon className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
          <CountryList
            value={selected?.code ?? ""}
            onSelect={(country) => {
              onChange(country.code);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {selected && !required && (
        <Button type="button" variant="ghost" size="icon" aria-label="Clear country" onClick={() => onChange("")} disabled={disabled}>
          <XIcon />
        </Button>
      )}
    </div>
  );
}

interface CodeProps {
  value: string;
  onChange: (country: Country) => void;
  disabled?: boolean;
  invalid: boolean;
  /** Accessible name, e.g. "Country code for Phone". */
  label: string;
}

/** The compact country-code button at the start of a phone input. */
export function DialCodePicker({ value, onChange, disabled, invalid, label }: CodeProps) {
  const [open, setOpen] = useState(false);
  const list = useCountries();
  const selected = list.find((country) => country.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={selected ? `${label}: ${selected.name} +${selected.dialCode}` : label}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className="shrink-0 gap-1.5 rounded-r-none border-r-0 px-2.5 font-normal tabular-nums"
        >
          <span aria-hidden="true" className="text-base leading-none">{selected?.flag ?? "🌐"}</span>
          <span>+{selected?.dialCode ?? ""}</span>
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <CountryList
          value={value}
          withDialCode
          onSelect={(country) => {
            onChange(country);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
