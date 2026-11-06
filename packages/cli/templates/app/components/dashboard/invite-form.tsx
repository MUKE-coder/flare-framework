"use client";

import { useState, useTransition } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { IssuedInvitation } from "@/app/dashboard/invitations/actions";

/**
 * Issue an invitation and show the link once.
 *
 * Once, because only the hash of the token is stored: there is no second chance to read
 * it. So the link stays on screen until the next one is issued, with a copy button — a
 * link you have to retype from a toast that has already gone is not a feature.
 */
export function InviteForm({ issue }: { issue: (formData: FormData) => Promise<IssuedInvitation> }) {
  const [pending, startTransition] = useTransition();
  const [issued, setIssued] = useState<IssuedInvitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      try {
        setIssued(await issue(formData));
        setCopied(false);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not create the invitation.");
      }
    });
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.link);
      setCopied(true);
    } catch {
      // A browser that refuses the clipboard still shows the link to select by hand.
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form action={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="invite-email">Email address</FieldLabel>
            <Input id="invite-email" name="email" type="email" placeholder="ada@example.com" autoComplete="off" />
            <FieldDescription>Leave it empty for a link anybody may use.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-days">Valid for</FieldLabel>
            <Input id="invite-days" name="days" type="number" min={1} max={90} defaultValue={7} />
            <FieldDescription>Days until the link stops working.</FieldDescription>
          </Field>
          <Button type="submit" disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            Create invitation
          </Button>
        </FieldGroup>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {issued && (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
          <p className="text-sm font-medium">
            {issued.email ? `Invitation for ${issued.email}` : "Invitation for anybody with the link"}
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">{issued.link}</code>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Copy it now — it is not stored and cannot be shown again.</p>
        </div>
      )}
    </div>
  );
}
