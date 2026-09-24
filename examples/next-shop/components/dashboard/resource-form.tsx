"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent, type MouseEvent } from "react";
import { createValidators, formValuesToInput, initialFormValues, issuesByField, storedFields, type ClientResource, type StoredField } from "@flaredev/core";
import { toast } from "sonner";
import { createRecordAction, updateRecordAction } from "@/app/dashboard/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { canSuggest, suggestValue } from "@/lib/suggest";
import { cn } from "@/lib/utils";
import { FieldWidget, type RelationMeta } from "./fields/field-widget";

export interface ResourceFormProps {
  resource: ClientResource;
  mode: "create" | "edit";
  /** Record id (edit mode). */
  id?: string;
  record?: Record<string, unknown> | null;
  /** belongsTo field key → related resource metadata and the current value's title. */
  relations?: Record<string, RelationMeta & { initialTitle?: string }>;
  /** Where Cancel and a successful save go, when the form owns the page. */
  listHref: string;
  /** In a sheet: close it instead of navigating, and drop the card around the fields. */
  onDone?: () => void;
}

const WIDE = new Set(["text", "file"]);

/**
 * More fields than this and the form is split into steps.
 *
 * Six inputs in one column is where a form starts to read as a chore rather than a
 * question, and a step at a time also means the first error appears before everything
 * else has been filled in.
 */
const FIELDS_PER_STEP = 5;

type Entry = [string, StoredField & { label: string }];

/** Fields in declaration order, cut into steps of at most {@link FIELDS_PER_STEP}. */
function toSteps(fields: Entry[]): Entry[][] {
  if (fields.length <= FIELDS_PER_STEP) return [fields];
  const steps: Entry[][] = [];
  for (let index = 0; index < fields.length; index += FIELDS_PER_STEP) {
    steps.push(fields.slice(index, index + FIELDS_PER_STEP));
  }
  return steps;
}

/**
 * Create/edit form rendered from field metadata. Values are validated in the browser
 * with the descriptor's zod schemas, then again on the server by the same store the
 * REST API uses; server errors (e.g. unique conflicts) land on their fields.
 */
export function ResourceForm({ resource, mode, id, record, relations = {}, listHref, onDone }: ResourceFormProps) {
  const router = useRouter();
  const validators = useMemo(() => createValidators(resource), [resource]);
  const fields = useMemo(() => storedFields(resource), [resource]);
  const steps = useMemo(() => toSteps(fields), [fields]);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(() => initialFormValues(resource, record));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const last = step === steps.length - 1;
  const visible = steps[step] ?? [];

  const setValue = (key: string, value: string | boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors(({ [key]: _removed, ...rest }) => rest);
  };

  function focusFirstError(fieldErrors: Record<string, string>, within: Entry[] = fields) {
    const first = within.find(([key]) => fieldErrors[key]);
    if (first) document.getElementById(`field-${first[0]}`)?.focus();
  }

  /** Everything the descriptor objects to, whichever step it is on. */
  function validate(): Record<string, string> {
    const input = formValuesToInput(resource, values, mode);
    const parsed = (mode === "create" ? validators.create : validators.update).safeParse(input);
    return parsed.success ? {} : issuesByField(parsed.error.issues);
  }

  /**
   * Move on only when this step is right; problems further on can wait their turn.
   *
   * The click is cancelled first. This button and the submit button on the last step are
   * the same node to the browser, and React has already turned this one into the submit
   * button by the time the click's default action runs — without this, going to the last
   * step also saves the record.
   */
  function next(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    const found = validate();
    const here = Object.fromEntries(Object.entries(found).filter(([key]) => visible.some(([field]) => field === key)));
    if (Object.keys(here).length > 0) {
      setErrors(here);
      focusFirstError(here, visible);
      return;
    }
    setErrors({});
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const input = formValuesToInput(resource, values, mode);
    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      // Send them to the step that holds the problem, not just to the field.
      const broken = steps.findIndex((entries) => entries.some(([key]) => found[key]));
      if (broken >= 0 && broken !== step) setStep(broken);
      focusFirstError(found, broken >= 0 ? steps[broken]! : fields);
      return;
    }

    startTransition(async () => {
      const result = mode === "create" ? await createRecordAction(resource.name, input) : await updateRecordAction(resource.name, id!, input);
      if (result.ok) {
        toast.success(`${resource.label} ${mode === "create" ? "created" : "saved"}.`);
        if (onDone) onDone();
        else router.push(listHref);
        router.refresh();
        return;
      }
      const fieldErrors = result.issues ? issuesByField(result.issues) : result.field ? { [result.field]: result.error } : { _form: result.error };
      setErrors(fieldErrors);
      const broken = steps.findIndex((entries) => entries.some(([key]) => fieldErrors[key]));
      if (broken >= 0 && broken !== step) setStep(broken);
      focusFirstError(fieldErrors, broken >= 0 ? steps[broken]! : fields);
    });
  }

  const Frame = onDone ? SheetFrame : Card;
  const Body = onDone ? SheetBody : CardContent;
  const Footer = onDone ? SheetFooterRow : CardFooter;

  return (
    <form onSubmit={onSubmit} noValidate className={onDone ? "flex min-h-0 flex-1 flex-col" : undefined}>
      <Frame>
        {steps.length > 1 && <Steps count={steps.length} current={step} onGo={setStep} />}
        <Body>
          {errors._form && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{errors._form}</AlertDescription>
            </Alert>
          )}
          <FieldGroup className="grid gap-6 md:grid-cols-2">
            {visible.map(([key, def]) => {
              const error = errors[key];
              const widgetId = `field-${key}`;
              const horizontal = def.kind === "boolean";
              return (
                <Field key={key} data-invalid={error ? true : undefined} className={WIDE.has(def.kind) ? "md:col-span-2" : undefined}>
                  <FieldLabel htmlFor={widgetId}>
                    {def.label}
                    {def.required && def.kind !== "boolean" && (
                      <span className="ml-0.5 text-muted-foreground" aria-hidden>
                        *
                      </span>
                    )}
                  </FieldLabel>
                  <div className={horizontal ? "flex h-9 items-center" : undefined}>
                    <FieldWidget
                      id={widgetId}
                      name={key}
                      resourceName={resource.name}
                      fieldKey={key}
                      field={def}
                      value={values[key] ?? ""}
                      onChange={(value) => setValue(key, value)}
                      invalid={Boolean(error)}
                      disabled={pending}
                      relation={relations[key]}
                      suggest={canSuggest(def) ? () => suggestValue(key, def, String(values[resource.titleField] ?? "")) : undefined}
                    />
                  </div>
                  {def.helpText && <FieldDescription>{def.helpText}</FieldDescription>}
                  {error && <FieldError>{error}</FieldError>}
                </Field>
              );
            })}
          </FieldGroup>
        </Body>
        <Footer className="flex items-center justify-end gap-2 border-t pt-4">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStep((current) => current - 1)} disabled={pending}>
              Back
            </Button>
          ) : onDone ? (
            <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
              Cancel
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href={listHref}>Cancel</Link>
            </Button>
          )}
          {last ? (
            <Button key="submit" type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {mode === "create" ? `Create ${resource.label.toLowerCase()}` : "Save changes"}
            </Button>
          ) : (
            <Button key="next" type="button" onClick={next} disabled={pending}>
              Next
            </Button>
          )}
        </Footer>
      </Frame>
    </form>
  );
}

/** Where you are in a multi-step form, and a way back to a step already passed. */
function Steps({ count, current, onGo }: { count: number; current: number; onGo: (step: number) => void }) {
  return (
    <div className="flex items-center gap-3 pb-4">
      <div className="flex flex-1 gap-1.5" role="presentation">
        {Array.from({ length: count }, (_, index) => (
          <button
            key={index}
            type="button"
            aria-label={`Step ${index + 1} of ${count}`}
            aria-current={index === current ? "step" : undefined}
            disabled={index > current}
            onClick={() => onGo(index)}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              index <= current ? "bg-primary" : "bg-muted",
              index < current && "cursor-pointer",
            )}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        Step {current + 1} of {count}
      </span>
    </div>
  );
}

/** Plain wrappers so the same form works in a page (a card) and in a sheet (no card). */
function SheetFrame({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 flex-1 flex-col gap-4">{children}</div>;
}

function SheetBody({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 overflow-y-auto px-1">{children}</div>;
}

function SheetFooterRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
