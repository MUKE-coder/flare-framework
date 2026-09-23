"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronDownIcon, PencilIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { optionLabel, type StoredField } from "@flaredev/core";
import { updateRecordAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface Props {
  resourceName: string;
  id: string;
  fieldKey: string;
  def: StoredField & { label: string };
  value: unknown;
  /** What the cell shows when it isn't being edited. */
  children: React.ReactNode;
}

const NONE = "__none__";

/**
 * Edit one value without leaving the table.
 *
 * For the small changes — a status, a flag, a number — opening a form to change one
 * field and closing it again is most of the work. Anything with a picker, an upload or
 * a relation still goes through the form, where there's room to explain itself.
 */
export function InlineCell({ resourceName, id, fieldKey, def, value, children }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const save = (next: unknown) => {
    setEditing(false);
    if (next === value || (next === null && value === null)) return;
    startTransition(async () => {
      const result = await updateRecordAction(resourceName, id, { [fieldKey]: next });
      if (!result.ok) {
        toast.error(result.issues?.[0]?.message ?? result.error);
        return;
      }
      toast.success(`${def.label} saved.`);
      router.refresh();
    });
  };

  if (pending) {
    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Spinner className="size-3.5" />
        {children}
      </span>
    );
  }

  // A switch and a select are one click either way, so they're always live.
  if (def.kind === "boolean") {
    return (
      <Switch
        checked={value === true}
        onCheckedChange={(checked) => save(checked)}
        aria-label={`${def.label} for this record`}
        className="data-[state=unchecked]:bg-muted-foreground/30"
      />
    );
  }

  if (def.kind === "enum") {
    // The badge stays until it's clicked: a row of grey dropdowns loses the colour that
    // makes a status column readable at a glance.
    if (!editing) {
      return (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group/cell inline-flex items-center gap-1 rounded px-0.5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          aria-label={`Change ${def.label.toLowerCase()}`}
        >
          {children}
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100" aria-hidden="true" />
        </button>
      );
    }
    return (
      <Select
        defaultOpen
        value={typeof value === "string" ? value : NONE}
        onValueChange={(next) => save(next === NONE ? null : next)}
        onOpenChange={(open) => {
          if (!open) setEditing(false);
        }}
      >
        <SelectTrigger size="sm" className="h-7 w-auto px-1.5" aria-label={def.label}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {!def.required && <SelectItem value={NONE}>—</SelectItem>}
            {def.options.map((option) => (
              <SelectItem key={option} value={option}>
                {optionLabel(def, option)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }

  if (editing) {
    const numeric = def.kind === "int" || def.kind === "float";
    return (
      <span className="flex items-center gap-1">
        <Input
          ref={input}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          type={numeric ? "number" : "text"}
          step={def.kind === "float" ? "any" : undefined}
          className="h-7 w-full min-w-24 px-1.5"
          aria-label={def.label}
          onKeyDown={(event) => {
            if (event.key === "Enter") save(numeric ? (draft === "" ? null : Number(draft)) : draft);
            if (event.key === "Escape") setEditing(false);
          }}
          onBlur={() => save(numeric ? (draft === "" ? null : Number(draft)) : draft)}
        />
        <Button variant="ghost" size="icon" className="size-6" aria-label="Save" onMouseDown={(event) => event.preventDefault()}>
          <CheckIcon />
        </Button>
        <Button variant="ghost" size="icon" className="size-6" aria-label="Cancel" onMouseDown={(event) => { event.preventDefault(); setEditing(false); }}>
          <XIcon />
        </Button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value === null || value === undefined ? "" : String(value));
        setEditing(true);
      }}
      className={cn("group/cell inline-flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-muted", "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary")}
      aria-label={`Edit ${def.label.toLowerCase()}`}
    >
      <span className="truncate">{children}</span>
      <PencilIcon className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100" aria-hidden="true" />
    </button>
  );
}
