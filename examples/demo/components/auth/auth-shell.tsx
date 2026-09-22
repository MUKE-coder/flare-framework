import Link from "next/link";
import { CheckIcon, XIcon } from "lucide-react";
import { site } from "@/lib/site";
import { authLayout } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Links under the form ("No account? Sign up"). */
  footer?: React.ReactNode;
  /** Sign-up screens get the highlights panel in the default theme. */
  page?: "sign-in" | "sign-up" | "flow";
}

/** The app's mark: its initial on the brand colour. Swap in your logo here. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Link href="/" aria-label={`${site.name} home`} className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="grid size-9 place-items-center rounded-[calc(var(--radius)+2px)] bg-brand text-lg font-bold text-brand-foreground [background-image:var(--brand-gradient,none)]">
        {site.name.charAt(0).toUpperCase()}
      </span>
    </Link>
  );
}

function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("text-xl font-bold tracking-tight text-foreground", className)}>
      {site.name}
    </Link>
  );
}

function Legal({ className }: { className?: string }) {
  return (
    <p className={cn("text-xs leading-5 text-foreground-muted", className)}>
      By continuing, you agree to the{" "}
      <Link href={site.links.terms} className="underline underline-offset-2 hover:text-foreground">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link href={site.links.privacy} className="underline underline-offset-2 hover:text-foreground">
        Privacy Policy
      </Link>
      .
    </p>
  );
}

function Heading({ title, subtitle, align = "center", size = "text-2xl" }: { title: string; subtitle?: string; align?: "center" | "left"; size?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", align === "center" && "items-center text-center")}>
      <h1 className={cn(size, "leading-tight text-foreground text-balance")}>{title}</h1>
      {subtitle && <p className="text-sm text-foreground-muted">{subtitle}</p>}
    </div>
  );
}

function Highlights() {
  return (
    <div className="flex max-w-md flex-col gap-8">
      <h2 className="text-3xl leading-tight text-balance">
        {site.name}, <span className="text-link">{site.tagline.toLowerCase()}</span>.
      </h2>
      <ul className="flex flex-col gap-4">
        {site.highlights.map((item) => (
          <li key={item} className="flex items-start gap-3 text-[15px] text-foreground-muted">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand/15 text-link">
              <CheckIcon className="size-3.5" strokeWidth={3} />
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Testimonial({ large = false }: { large?: boolean }) {
  const initials = site.testimonial.author
    .split(" ")
    .map((part) => part.charAt(0))
    .join("");
  return (
    <figure className="flex max-w-lg flex-col gap-6">
      <blockquote className={cn("leading-snug text-foreground text-balance", large ? "text-3xl" : "text-xl")}>
        <span aria-hidden="true" className="mb-2 block font-serif text-6xl leading-none text-foreground-muted/40">
          &ldquo;
        </span>
        {site.testimonial.quote}
      </blockquote>
      <figcaption className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-brand/15 text-sm font-semibold text-link">{initials}</span>
        <span className="flex flex-col text-sm">
          <span className="font-medium text-foreground">{site.testimonial.author}</span>
          <span className="text-foreground-muted">{site.testimonial.role}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * The frame around every sign-in screen. The active theme (lib/theme.ts) picks one of
 * six layouts; the form inside is the same everywhere.
 */
export function AuthShell({ title, subtitle, children, footer, page = "flow" }: ShellProps) {
  const form = (
    <div className="flex w-full flex-col gap-5">
      {children}
      {footer && <div className="text-center text-sm text-foreground-muted">{footer}</div>}
    </div>
  );

  switch (authLayout) {
    // Coral: a big rounded card floating over a soft, blurred glimpse of the app.
    case "modal":
      return (
        <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-surface-muted p-4">
          <div aria-hidden="true" className="absolute inset-0 grid grid-cols-2 gap-6 p-8 opacity-60 blur-[2px] sm:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="flex flex-col gap-3">
                <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-brand/25 via-brand/10 to-surface" />
                <div className="h-3 w-3/4 rounded bg-border" />
                <div className="h-3 w-1/2 rounded bg-border" />
              </div>
            ))}
          </div>
          <div className="absolute inset-0 bg-foreground/35" aria-hidden="true" />
          <div className="relative w-full max-w-[560px] rounded-[28px] bg-surface px-6 py-10 shadow-2xl sm:px-12">
            <Link href="/" aria-label="Close" className="absolute top-5 right-5 grid size-9 place-items-center rounded-full text-foreground hover:bg-surface-muted">
              <XIcon className="size-5" />
            </Link>
            <div className="mb-7 flex flex-col items-center gap-4">
              <BrandMark />
              <Heading title={title} subtitle={subtitle} size="text-[28px]" />
            </div>
            {form}
          </div>
        </main>
      );

    // Amber: wordmark on top, a plain bordered box, footer links under a rule.
    case "boxed":
      return (
        <main className="flex min-h-dvh flex-col items-center bg-surface">
          <div className="flex w-full flex-col items-center px-4 pt-6">
            <Wordmark className="mb-4" />
            <div className="w-full max-w-[400px] rounded-lg border border-border px-6 py-7 sm:px-8">
              <h1 className="mb-5 text-[28px] leading-tight">{title}</h1>
              {form}
              <Legal className="mt-5" />
            </div>
          </div>
          <footer className="mt-10 flex w-full flex-col items-center gap-2 border-t border-border py-6 text-xs">
            <nav className="flex gap-4">
              <Link className="text-link hover:underline" href={site.links.terms}>Conditions of use</Link>
              <Link className="text-link hover:underline" href={site.links.privacy}>Privacy notice</Link>
              <a className="text-link hover:underline" href={site.links.support}>Help</a>
            </nav>
            <p className="text-foreground-muted">© {new Date().getFullYear()} {site.name}</p>
          </footer>
        </main>
      );

    // Sky: a top bar and a bold, left-aligned heading; social sign-in first.
    case "banner":
      return (
        <main className="min-h-dvh bg-surface">
          <header className="flex items-center justify-between px-6 py-5">
            <BrandMark />
            <a href={site.links.support} className="rounded-[var(--button-radius)] border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted">
              Support
            </a>
          </header>
          <div className="mx-auto flex w-full max-w-[560px] flex-col gap-8 px-6 pt-6 pb-16">
            <Heading title={title} subtitle={subtitle ?? site.tagline} align="left" size="text-4xl" />
            {form}
            <Legal />
          </div>
        </main>
      );

    // Mono: a fine grid with a soft glow behind the form, a showcase panel beside it.
    case "showcase":
      return (
        <main className="grid min-h-dvh lg:grid-cols-[1.25fr_1fr]">
          <section className="relative flex flex-col items-center overflow-hidden px-6 py-8">
            <div
              aria-hidden="true"
              className="absolute inset-0 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]"
            />
            <div aria-hidden="true" className="absolute -top-40 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-[conic-gradient(from_90deg,#fde68a,#f9a8d4,#a5b4fc,#99f6e4,#fde68a)] opacity-25 blur-3xl" />
            <Wordmark className="relative text-2xl" />
            <div className="relative my-auto flex w-full max-w-[420px] flex-col gap-7 py-12">
              <Heading title={title} subtitle={subtitle} size="text-2xl" />
              {form}
            </div>
            <Legal className="relative max-w-[420px] text-center" />
          </section>
          <aside className="hidden flex-col justify-center gap-10 border-l border-border bg-surface-muted p-12 lg:flex">
            <div className="flex flex-col gap-6 rounded-2xl bg-gradient-to-br from-foreground to-foreground/80 p-8 text-background shadow-xl">
              <p className="text-2xl leading-snug font-semibold text-balance">&ldquo;{site.testimonial.quote}&rdquo;</p>
              <p className="text-sm opacity-80">
                {site.testimonial.author}, {site.testimonial.role}
              </p>
            </div>
            <ul className="grid grid-cols-1 gap-3">
              {site.highlights.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-foreground-muted">
                  <CheckIcon className="size-4 text-foreground" />
                  {item}
                </li>
              ))}
            </ul>
          </aside>
        </main>
      );

    // Emerald: the form in a narrow column, a customer quote filling the rest.
    case "quote":
      return (
        <main className="grid min-h-dvh lg:grid-cols-[minmax(0,560px)_1fr]">
          <section className="flex flex-col px-8 py-8 sm:px-16">
            <Link href="/" className="flex items-center gap-2 text-xl font-semibold">
              <span className="grid size-7 place-items-center rounded-md bg-brand text-sm font-bold text-brand-foreground">{site.name.charAt(0).toUpperCase()}</span>
              {site.name}
            </Link>
            <div className="my-auto flex w-full max-w-[400px] flex-col gap-7 py-12">
              <Heading title={title} subtitle={subtitle} align="left" size="text-[32px]" />
              {form}
            </div>
            <Legal className="max-w-[400px] text-center" />
          </section>
          <aside className="hidden items-center justify-center border-l border-border bg-surface-muted p-16 lg:flex">
            <Testimonial large />
          </aside>
        </main>
      );

    // Default: centred and quiet; sign-up adds the highlights panel.
    default:
      if (page === "sign-up") {
        return (
          <main className="grid min-h-dvh lg:grid-cols-2">
            <section className="flex flex-col items-center bg-surface-muted px-6 py-10">
              <div className="my-auto flex w-full max-w-[400px] flex-col gap-8">
                <div className="flex flex-col items-center gap-5">
                  <BrandMark />
                  <Heading title={title} subtitle={subtitle} />
                </div>
                {form}
              </div>
              <Legal className="max-w-[400px] text-center" />
            </section>
            <aside className="hidden items-center justify-center p-16 lg:flex">
              <Highlights />
            </aside>
          </main>
        );
      }
      return (
        <main className="flex min-h-dvh flex-col items-center px-6 py-10">
          <div className="my-auto flex w-full max-w-[400px] flex-col gap-8">
            <div className="flex flex-col items-center gap-5">
              <BrandMark />
              <Heading title={title} subtitle={subtitle} />
            </div>
            {form}
          </div>
          <Legal className="max-w-[400px] text-center" />
        </main>
      );
  }
}
