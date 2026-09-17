"use client";

import { useState } from "react";
import { CalendarIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** "2026-01-05" ⇄ Date, treated as UTC so the calendar never shifts a day across time zones. */
const toDate = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const toISODate = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
const display = (value: string, options: Intl.DateTimeFormatOptions) => {
  const date = toDate(value);
  return date ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(date) : value;
};

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled?: boolean;
  required: boolean;
  placeholder?: string;
}

/** Date picker for `date` fields. Stores "YYYY-MM-DD". */
export function DateField({ id, value, onChange, invalid, disabled, required, placeholder }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid || undefined}
            className={cn("w-full justify-start font-normal", !value && "text-muted-foreground")}
          >
            <CalendarIcon data-icon="inline-start" />
            {value ? display(value, { dateStyle: "medium" }) : (placeholder ?? "Pick a date")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            autoFocus
            selected={toDate(value)}
            defaultMonth={toDate(value)}
            onSelect={(date) => {
              if (date) onChange(toISODate(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {value && !required && (
        <Button type="button" variant="ghost" size="icon" aria-label="Clear date" disabled={disabled} onClick={() => onChange("")}>
          <XIcon />
        </Button>
      )}
    </div>
  );
}

/** Date + time picker for `datetime` fields. Stores an ISO string with offset (UTC). */
export function DateTimeField({ id, value, onChange, invalid, disabled, required }: Props) {
  const date = value ? new Date(value) : undefined;
  const valid = date && !Number.isNaN(date.getTime());
  const datePart = valid ? toISODate(date) : "";
  const timePart = valid ? date.toISOString().slice(11, 16) : "";

  const update = (nextDate: string, nextTime: string) => {
    if (!nextDate) return onChange("");
    const time = nextTime || "00:00";
    const iso = new Date(`${nextDate}T${time}:00Z`);
    onChange(Number.isNaN(iso.getTime()) ? "" : iso.toISOString());
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <DateField
          id={id}
          value={datePart}
          onChange={(next) => update(next, timePart)}
          invalid={invalid}
          disabled={disabled}
          required={required}
          placeholder="Pick a date"
        />
      </div>
      <Input
        type="time"
        aria-label="Time (UTC)"
        className="w-32 tabular-nums"
        value={timePart}
        disabled={disabled || !datePart}
        aria-invalid={invalid || undefined}
        onChange={(event) => update(datePart, event.target.value)}
      />
    </div>
  );
}
