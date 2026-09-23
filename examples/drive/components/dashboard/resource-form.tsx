"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";
import { createValidators, formValuesToInput, initialFormValues, issuesByField, storedFields, type ClientResource } from "@flaredev/core";
import { toast } from "sonner";
import { createRecordAction, updateRecordAction } from "@/app/dashboard/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
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
  /** In a dialog: close it instead of navigating, and drop the card around the fields. */
  onDone?: () => void;
}

const WIDE = new Set(["text", "file"]);

/**
 * Create/edit form rendered from field metadata. Values are validated in the browser
 * with the descriptor's zod schemas, then again on the server by the same store the
 * REST API uses; server errors (e.g. unique conflicts) land on their fields.
 */
export function ResourceForm({ resource, mode, id, record, relations = {}, listHref, onDone }: ResourceFormProps) {
  const router = useRouter();
  const validators = useMemo(() => createValidators(resource), [resource]);
  const fields = useMemo(() => storedFields(resource), [resource]);
  const [values, setValues] = useState(() => initialFormValues(resource, record));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const setValue = (key: string, value: string | boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors(({ [key]: _removed, ...rest }) => rest);
  };

  function focusFirstError(fieldErrors: Record<string, string>) {
    const first = fields.find(([key]) => fieldErrors[key]);
    if (first) document.getElementById(`field-${first[0]}`)?.focus();
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const input = formValuesToInput(resource, values, mode);
    const parsed = (mode === "create" ? validators.create : validators.update).safeParse(input);
    if (!parsed.success) {
      const fieldErrors = issuesByField(parsed.error.issues);
      setErrors(fieldErrors);
      focusFirstError(fieldErrors);
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
      focusFirstError(fieldErrors);
    });
  }

  const Frame = onDone ? DialogFrame : Card;
  const Body = onDone ? DialogBody : CardContent;
  const Footer = onDone ? DialogFooterRow : CardFooter;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Frame>
        <Body>
          {errors._form && (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>{errors._form}</AlertDescription>
            </Alert>
          )}
          <FieldGroup className="grid gap-6 md:grid-cols-2">
            {fields.map(([key, def]) => {
              const error = errors[key];
              const widgetId = `field-${key}`;
              const horizontal = def.kind === "boolean";
              return (
                <Field
                  key={key}
                  data-invalid={error ? true : undefined}
                  className={WIDE.has(def.kind) ? "md:col-span-2" : undefined}
                >
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
                    />
                  </div>
                  {def.helpText && <FieldDescription>{def.helpText}</FieldDescription>}
                  {error && <FieldError>{error}</FieldError>}
                </Field>
              );
            })}
          </FieldGroup>
        </Body>
        <Footer className="flex justify-end gap-2 border-t pt-4">
          {onDone ? (
            <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
              Cancel
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href={listHref}>Cancel</Link>
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            {mode === "create" ? `Create ${resource.label.toLowerCase()}` : "Save changes"}
          </Button>
        </Footer>
      </Frame>
    </form>
  );
}

/** Plain wrappers so the same form works in a page (a card) and in a dialog (no card). */
function DialogFrame({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

function DialogBody({ children }: { children: React.ReactNode }) {
  return <div className="max-h-[60vh] overflow-y-auto px-1">{children}</div>;
}

function DialogFooterRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
