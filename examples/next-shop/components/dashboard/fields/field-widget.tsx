"use client";

import { normalizeDomain, optionLabel, slugify, type FileField as FileFieldDef, type MultiSelectField as MultiSelectDef, type StoredField } from "@flaredev/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { groupDigits, ungroup } from "@/lib/number";
import { DateField, DateTimeField } from "./date-field";
import { CountryField } from "./country-field";
import { FileField } from "./file-field";
import { MultiSelectField } from "./multi-select-field";
import { PhoneField } from "./phone-field";
import { RelationField } from "./relation-field";

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
  /** Resource name and field key, for upload actions. */
  resourceName: string;
  fieldKey: string;
  field: StoredField & { label: string };
  value: string | boolean;
  onChange: (value: string | boolean) => void;
  invalid: boolean;
  disabled?: boolean;
  /** belongsTo: the related resource and the current value's title. */
  relation?: RelationMeta & { initialTitle?: string };
  /**
   * A value this field can make up for itself — a SKU, a slug, a reference. Given for
   * unique codes, where typing one by hand is busywork, and shown as a button beside
   * the input so whatever it suggests can still be typed over.
   */
  suggest?: () => string;
}

const NONE = "__none__";

/** The input for a field, chosen from its kind in the descriptor. */
export function FieldWidget(props: WidgetProps) {
  const { id, name, field, value, onChange, invalid, disabled, relation, resourceName, fieldKey, suggest } = props;
  const text = typeof value === "string" ? value : "";
  const common = { id, name, disabled, "aria-invalid": invalid || undefined, placeholder: field.placeholder };

  switch (field.kind) {
    case "text":
      return <Textarea {...common} value={text} rows={4} onChange={(event) => onChange(event.target.value)} />;

    case "int":
    case "float":
      // Shown grouped (2,000) and stored plain (2000), so a price can be read at a glance
      // and nothing downstream has to strip a comma back out.
      return (
        <Input
          {...common}
          type="text"
          inputMode={field.kind === "int" ? "numeric" : "decimal"}
          className="tabular-nums"
          value={groupDigits(text)}
          onChange={(event) => onChange(ungroup(event.target.value, field.kind === "float"))}
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
      if (field.widget === "radio") {
        return (
          <RadioGroup id={id} name={name} value={text} onValueChange={onChange} disabled={disabled} aria-invalid={invalid || undefined} className="flex flex-wrap gap-x-5 gap-y-2.5">
            {field.options.map((option) => (
              <div key={option} className="flex items-center gap-2">
                <RadioGroupItem id={`${id}-${option}`} value={option} aria-invalid={invalid || undefined} />
                <Label htmlFor={`${id}-${option}`} className="font-normal">
                  {optionLabel(field, option)}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );
      }
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

    case "multiselect":
      return (
        <MultiSelectField id={id} field={field as MultiSelectDef & { label: string }} value={text} onChange={onChange} invalid={invalid} disabled={disabled} />
      );

    case "date":
      return (
        <DateField id={id} value={text} onChange={onChange} invalid={invalid} disabled={disabled} required={field.required} placeholder={field.placeholder} />
      );

    case "datetime":
      return (
        <DateTimeField id={id} value={text} onChange={onChange} invalid={invalid} disabled={disabled} required={field.required} placeholder={field.placeholder} />
      );

    case "belongsTo":
      return relation ? (
        <RelationField id={id} value={text} onChange={onChange} invalid={invalid} disabled={disabled} required={field.required} relation={relation} />
      ) : (
        <Input {...common} value={text} onChange={(event) => onChange(event.target.value)} />
      );

    case "file":
      return (
        <FileField
          id={id}
          value={text}
          onChange={onChange}
          invalid={invalid}
          disabled={disabled}
          field={field as FileFieldDef & { label: string }}
          resourceName={resourceName}
          fieldKey={fieldKey}
        />
      );

    case "string":
      switch (field.format) {
        case "tel":
          return <PhoneField id={id} name={name} label={field.label} value={text} onChange={onChange} invalid={invalid} disabled={disabled} placeholder={field.placeholder} />;
        case "country":
          return <CountryField id={id} value={text} onChange={onChange} invalid={invalid} disabled={disabled} required={field.required} placeholder={field.placeholder} />;
        case "color":
          return (
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`${field.label} picker`}
                value={/^#[0-9a-f]{6}$/i.test(text) ? text : "#000000"}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
              />
              <Input {...common} className="font-mono" placeholder={field.placeholder ?? "#f2541d"} value={text} onChange={(event) => onChange(event.target.value)} />
            </div>
          );
        case "slug":
          return (
            <WithSuggestion suggest={suggest} disabled={disabled} onChange={onChange}>
              <InputGroupInput {...common} className="font-mono" placeholder={field.placeholder ?? "my-first-post"} value={text} onChange={(event) => onChange(event.target.value)} onBlur={() => text && onChange(slugify(text))} />
            </WithSuggestion>
          );
        case "domain":
          return (
            <Input {...common} inputMode="url" autoCapitalize="none" spellCheck={false} placeholder={field.placeholder ?? "example.com"} value={text} onChange={(event) => onChange(event.target.value)} onBlur={() => text && onChange(normalizeDomain(text))} />
          );
        case "email":
          return <Input {...common} type="email" autoComplete="email" value={text} onChange={(event) => onChange(event.target.value)} />;
        case "url":
          return <Input {...common} type="url" placeholder={field.placeholder ?? "https://"} value={text} onChange={(event) => onChange(event.target.value)} />;
        default:
          return (
            <WithSuggestion suggest={suggest} disabled={disabled} onChange={onChange}>
              <InputGroupInput {...common} value={text} onChange={(event) => onChange(event.target.value)} />
            </WithSuggestion>
          );
      }

    default:
      return <Input {...common} value={text} onChange={(event) => onChange(event.target.value)} />;
  }
}

/**
 * An input with a "Generate" button, when the form offered one for this field.
 *
 * Without a suggestion it stays an ordinary input, so the same branch serves a field
 * that can make up its own value and one that can't.
 */
function WithSuggestion({
  suggest,
  disabled,
  onChange,
  children,
}: {
  suggest?: () => string;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: React.ReactElement;
}) {
  if (!suggest) {
    // InputGroupInput outside an InputGroup would lose its border; hand back a plain one.
    const { className, ...rest } = children.props as { className?: string } & Record<string, unknown>;
    return <Input {...rest} className={className} />;
  }
  return (
    <InputGroup>
      {children}
      <InputGroupAddon align="inline-end">
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(suggest())}>
          Generate
        </Button>
      </InputGroupAddon>
    </InputGroup>
  );
}
