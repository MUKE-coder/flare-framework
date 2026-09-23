"use client";

import { optionLabel, parseMultiValue, type MultiSelectField as MultiSelectDef } from "@flaredev/core";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface Props {
  id: string;
  field: MultiSelectDef & { label: string };
  /** Form state: a JSON array of the picked values. */
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled?: boolean;
}

/** A `multiselect` field: one checkbox per option, in the descriptor's order. */
export function MultiSelectField({ id, field, value, onChange, invalid, disabled }: Props) {
  const picked = parseMultiValue(value);
  const toggle = (option: string, on: boolean) => {
    const next = field.options.filter((item) => (item === option ? on : picked.includes(item)));
    onChange(JSON.stringify(next));
  };

  return (
    <div id={id} role="group" aria-label={field.label} aria-invalid={invalid || undefined} className="grid gap-2.5 sm:grid-cols-2">
      {field.options.map((option) => {
        const optionId = `${id}-${option}`;
        return (
          <div key={option} className="flex items-center gap-2">
            <Checkbox
              id={optionId}
              checked={picked.includes(option)}
              onCheckedChange={(checked) => toggle(option, checked === true)}
              disabled={disabled}
              aria-invalid={invalid || undefined}
            />
            <Label htmlFor={optionId} className="font-normal">
              {optionLabel(field, option)}
            </Label>
          </div>
        );
      })}
    </div>
  );
}
