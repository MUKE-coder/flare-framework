"use client";

import { useId, useMemo, useState } from "react";
import { CheckIcon, EyeIcon, EyeOffIcon } from "lucide-react";
import { checkPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-rules";
import { cn } from "@/lib/utils";
import { AuthInput, AuthLabel } from "./ui";

interface Props {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  name?: string;
  autoComplete?: "new-password" | "current-password";
  autoFocus?: boolean;
  required?: boolean;
  placeholder?: string;
  /** Show the rules and strength as they type. Off for "your current password". */
  showRules?: boolean;
  /** Their name and email: a password shouldn't contain either. */
  avoid?: (string | null | undefined)[];
}

const BAR_COLOURS = ["bg-danger", "bg-danger", "bg-warning", "bg-success/70", "bg-success"];

/**
 * A password input that says what it wants before you get it wrong: the rules and a
 * strength reading update as you type, and the eye shows what you've typed.
 *
 * Only the length is enforced; everything else reads as advice (see lib/password-rules.ts).
 */
export function PasswordField({
  value,
  onChange,
  label = "Password",
  id,
  name = "password",
  autoComplete = "new-password",
  autoFocus,
  required = true,
  placeholder,
  showRules = autoComplete === "new-password",
  avoid = [],
}: Props) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;
  const [visible, setVisible] = useState(false);
  const check = useMemo(() => checkPassword(value, avoid), [value, avoid.join("\u0000")]);
  const started = value.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <AuthLabel htmlFor={fieldId}>{label}</AuthLabel>
      <div className="relative">
        <AuthInput
          id={fieldId}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          minLength={autoComplete === "new-password" ? PASSWORD_MIN_LENGTH : undefined}
          maxLength={PASSWORD_MAX_LENGTH}
          aria-describedby={showRules ? hintId : undefined}
          // A styling hook, so the field can go green without any state plumbing.
          data-has-passed-validation={showRules && check.valid ? "" : undefined}
          className={cn("pr-11", showRules && check.valid && "border-success/60")}
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-pressed={visible}
          aria-controls={fieldId}
          aria-label={visible ? "Hide password" : "Show password"}
          title={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {visible ? <EyeOffIcon className="size-4.5" /> : <EyeIcon className="size-4.5" />}
        </button>
      </div>

      {showRules && (
        <div id={hintId} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-1 flex-1 gap-1" aria-hidden="true">
              {[0, 1, 2, 3].map((step) => (
                <span key={step} className={cn("h-full flex-1 rounded-full transition-colors", started && check.score > step ? BAR_COLOURS[check.score] : "bg-border")} />
              ))}
            </div>
            <span className={cn("text-xs tabular-nums", started ? "text-foreground-muted" : "text-transparent")}>{check.label}</span>
          </div>

          {/* Announced politely: it changes on every keystroke, so it mustn't interrupt. */}
          <ul className="flex flex-col gap-1" aria-live="polite">
            {check.rules.map((rule) => (
              <li key={rule.id} className={cn("flex items-center gap-2 text-xs", rule.met ? "text-success" : "text-foreground-muted")}>
                <span className={cn("grid size-3.5 shrink-0 place-items-center rounded-full border", rule.met ? "border-success bg-success/15" : "border-border")}>
                  {rule.met && <CheckIcon className="size-2.5" />}
                </span>
                {rule.label}
                {rule.required && !rule.met && <span className="text-foreground-muted">(required)</span>}
              </li>
            ))}
          </ul>

          {started && check.advice && <p className="text-xs text-foreground-muted">{check.advice}</p>}
        </div>
      )}
    </div>
  );
}
