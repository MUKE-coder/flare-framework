import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/*
 * The auth screens' controls. They read the theme tokens (--brand, --button-radius,
 * --radius, --font-theme), so the same markup takes each theme's shape and colour.
 */

export const AuthInput = forwardRef<HTMLInputElement, React.ComponentProps<"input">>(function AuthInput({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-[calc(var(--radius)-2px)] border border-border bg-surface px-3.5 text-[15px] text-foreground outline-none transition-[border-color,box-shadow]",
        "placeholder:text-foreground-muted/80 focus-visible:border-brand focus-visible:ring-[3px] focus-visible:ring-brand/20",
        "aria-invalid:border-danger aria-invalid:ring-danger/15 disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
});

export function AuthLabel({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-foreground", className)} {...props} />;
}

export function PrimaryButton({ className, pending, children, ...props }: React.ComponentProps<"button"> & { pending?: boolean }) {
  return (
    <button
      className={cn(
        "relative inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--button-radius)] bg-brand px-4 text-[15px] font-medium text-brand-foreground",
        "[background-image:var(--brand-gradient,none)] transition-[filter,opacity] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        className,
      )}
      disabled={pending || props.disabled}
      {...props}
    >
      {pending && <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function SecondaryButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-[var(--button-radius)] border border-border bg-surface px-4 text-[15px] font-medium text-foreground",
        "transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        className,
      )}
      type="button"
      {...props}
    />
  );
}

export function TextButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn("text-sm font-medium text-link underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none disabled:opacity-60", className)}
      {...props}
    />
  );
}

export function Divider({ children = "or" }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-foreground-muted uppercase" role="separator">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function FormMessage({ tone = "error", children }: { tone?: "error" | "info" | "success"; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-[calc(var(--radius)-2px)] px-3 py-2.5 text-sm",
        tone === "error" && "bg-danger/10 text-danger",
        tone === "info" && "bg-surface-muted text-foreground",
        tone === "success" && "bg-success/10 text-success",
      )}
    >
      {children}
    </p>
  );
}
