"use client";

import { optionLabel, type StoredField } from "@flare/core";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export interface RelationMeta {
  name: string;
  label: string;
  pluralLabel: string;
  slug: string;
  titleField: string;
}

export interface WidgetProps {
  id: string;
  name: string;
  field: StoredField & { label: string };
  value: string | boolean;
  onChange: (value: string | boolean) => void;
  invalid: boolean;
  disabled?: boolean;
  /** belongsTo: the related resource and the current value's title. */
  relation?: RelationMeta & { initialTitle?: string };
}

const NONE = "__none__";

/** The input for a field, chosen from its kind in the descriptor. */
export function FieldWidget(props: WidgetProps) {
  const { id, name, field, value, onChange, invalid, disabled } = props;
  const text = typeof value === "string" ? value : "";
  const common = { id, name, disabled, "aria-invalid": invalid || undefined, placeholder: field.placeholder };

  switch (field.kind) {
    case "text":
      return <Textarea {...common} value={text} rows={4} onChange={(event) => onChange(event.target.value)} />;

    case "int":
    case "float":
      return (
        <Input
          {...common}
          type="text"
          inputMode={field.kind === "int" ? "numeric" : "decimal"}
          className="tabular-nums"
          value={text}
          onChange={(event) => onChange(event.target.value)}
        />
      );

    case "boolean":
      return (
        <Switch
          id={id}
          name={name}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
        />
      );

    case "enum":
      return (
        // No selection is `undefined`, so the placeholder shows; "None" clears an optional value.
        <Select value={text || undefined} onValueChange={(next) => onChange(next === NONE ? "" : next)} disabled={disabled} name={name}>
          <SelectTrigger id={id} aria-invalid={invalid || undefined} className="w-full">
            <SelectValue placeholder={field.placeholder ?? `Choose ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {!field.required && <SelectItem value={NONE}>None</SelectItem>}
              {field.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {optionLabel(field, option)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      );

    case "date":
      return <Input {...common} type="date" value={text} onChange={(event) => onChange(event.target.value)} />;

    case "datetime":
      return <Input {...common} type="text" value={text} onChange={(event) => onChange(event.target.value)} />;

    default: {
      const type = field.kind === "string" && field.format === "email" ? "email" : field.kind === "string" && field.format === "url" ? "url" : "text";
      return <Input {...common} type={type} value={text} onChange={(event) => onChange(event.target.value)} />;
    }
  }
}
