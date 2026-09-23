"use client";

import { useEffect, useState } from "react";
import { splitPhone, toE164 } from "@flaredev/core";
import { Input } from "@/components/ui/input";
import { DialCodePicker } from "./country-field";

interface Props {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled?: boolean;
  placeholder?: string;
}

/** The viewer's region from their browser language ("en-UG" → "UG"), else US. */
function localRegion(): string {
  try {
    return new Intl.Locale(navigator.language).maximize().region ?? "US";
  } catch {
    return "US";
  }
}

/**
 * A `tel` field: a searchable country-code picker and the number. Stores E.164
 * ("+256772123456"); a number pasted with its own "+code" switches the country.
 */
export function PhoneField({ id, name, label, value, onChange, invalid, disabled, placeholder }: Props) {
  const initial = splitPhone(value);
  const [country, setCountry] = useState(initial.country ?? "US");
  const [national, setNational] = useState(initial.national);

  // On a new record, start from the viewer's own country (after hydration, so server and client agree).
  useEffect(() => {
    if (!value && !initial.country) setCountry(localRegion());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = (nextCountry: string, nextNational: string) => onChange(nextNational.trim() ? toE164(nextCountry, nextNational) : "");

  return (
    <div className="flex">
      <DialCodePicker
        value={country}
        disabled={disabled}
        invalid={invalid}
        label={`Country code for ${label}`}
        onChange={(next) => {
          setCountry(next.code);
          emit(next.code, national);
        }}
      />
      <Input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        className="rounded-l-none tabular-nums"
        placeholder={placeholder ?? "772 123456"}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        value={national}
        onChange={(event) => {
          const text = event.target.value;
          if (text.trim().startsWith("+")) {
            // A full international number: take its country and keep the rest.
            const parsed = splitPhone(toE164(country, text));
            if (parsed.country) {
              setCountry(parsed.country);
              setNational(parsed.national);
              onChange(toE164(parsed.country, parsed.national));
              return;
            }
          }
          setNational(text);
          emit(country, text);
        }}
      />
    </div>
  );
}
