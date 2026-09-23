import Link from "next/link";
import { ArrowRightIcon, CreditCardIcon, LayoutDashboardIcon, PlugIcon, ShieldCheckIcon, SparklesIcon, UsersIcon, ZapIcon } from "lucide-react";
import { ProductPreview } from "@/components/marketing/product-preview";
import { SiteHeader } from "@/components/marketing/site-header";
import { site } from "@/lib/site";

const ICONS = { zap: ZapIcon, "shield-check": ShieldCheckIcon, "layout-dashboard": LayoutDashboardIcon, users: UsersIcon, plug: PlugIcon, "credit-card": CreditCardIcon };

/** The public home page. Every word comes from lib/site.ts; the look from the theme. */
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent_75%)] opacity-70"
          />
          <div aria-hidden="true" className="absolute top-[-12rem] left-1/2 -z-10 h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-[conic-gradient(from_120deg,var(--brand),#f9a8d4,#a5b4fc,#99f6e4,var(--brand))] opacity-20 blur-3xl" />
          <div className="mx-auto flex max-w-4xl flex-col items-center px-6 pt-20 pb-16 text-center md:pt-28">
            {site.announcement && (
              <Link
                href={site.announcement.href}
                className="mb-8 inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 py-1 pr-3 pl-1 text-sm text-foreground-muted shadow-sm backdrop-blur hover:text-foreground"
              >
                <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-link">{site.announcement.label}</span>
                {site.announcement.text}
                <ArrowRightIcon className="size-3.5" />
              </Link>
            )}
            <h1 className="text-5xl leading-[1.05] text-balance md:text-7xl">{site.tagline}</h1>
            <p className="mt-6 max-w-2xl text-lg text-foreground-muted text-pretty md:text-xl">{site.description}</p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link
                href="/sign-up"
                className="inline-flex h-12 items-center gap-2 rounded-[var(--button-radius)] bg-brand px-6 font-medium text-brand-foreground [background-image:var(--brand-gradient,none)] hover:brightness-95"
              >
                Start for free
              </Link>
              <a href="#features" className="inline-flex h-12 items-center rounded-[var(--button-radius)] border border-border bg-surface px-6 font-medium hover:bg-surface-muted">
                See how it works
              </a>
            </div>
          </div>
          <div className="px-6 pb-24">
            <ProductPreview />
          </div>
        </section>

        {/* Logos */}
        {site.customers.length > 0 && (
          <section id="customers" aria-label="Customers" className="border-y border-border bg-surface-muted/50 py-12">
            <p className="text-center text-sm text-foreground-muted">Trusted by teams at</p>
            <ul className="mx-auto mt-6 flex max-w-5xl flex-wrap items-center justify-center gap-x-12 gap-y-4 px-6">
              {site.customers.map((name) => (
                <li key={name} className="text-2xl font-semibold tracking-tight text-foreground/35">
                  {name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-4xl text-balance">Everything your team needs, in one place</h2>
            <p className="mt-4 text-lg text-foreground-muted">{site.name} takes care of the busywork so you can focus on your customers.</p>
          </div>
          <ul className="mt-16 grid gap-px overflow-hidden rounded-[calc(var(--radius)+8px)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {site.features.map((feature) => {
              const Icon = ICONS[feature.icon as keyof typeof ICONS] ?? SparklesIcon;
              return (
                <li key={feature.title} className="flex flex-col gap-3 bg-surface p-8">
                  <span className="grid size-10 place-items-center rounded-[var(--radius)] bg-brand/10 text-link">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="text-lg">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-foreground-muted">{feature.description}</p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Testimonial */}
        <section className="border-t border-border bg-surface-muted/50 px-6 py-24">
          <figure className="mx-auto flex max-w-3xl flex-col items-center gap-8 text-center">
            <blockquote className="text-3xl leading-snug text-balance">&ldquo;{site.testimonial.quote}&rdquo;</blockquote>
            <figcaption className="text-sm">
              <span className="font-semibold">{site.testimonial.author}</span>
              <span className="text-foreground-muted">, {site.testimonial.role}</span>
            </figcaption>
          </figure>
        </section>

        {/* Closing call to action */}
        <section className="px-6 py-24">
          <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 overflow-hidden rounded-[calc(var(--radius)+12px)] bg-foreground px-8 py-16 text-center text-background">
            <div aria-hidden="true" className="absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-brand opacity-40 blur-3xl" />
            <h2 className="relative text-4xl text-balance">Get started with {site.name} today</h2>
            <p className="relative max-w-xl text-background/70">Create an account in seconds. No credit card, nothing to install.</p>
            <Link href="/sign-up" className="relative inline-flex h-12 items-center gap-2 rounded-[var(--button-radius)] bg-background px-6 font-medium text-foreground hover:bg-background/90">
              Create your account <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 text-sm text-foreground-muted md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {site.name}
          </p>
          <nav aria-label="Footer" className="flex gap-6">
            <Link href={site.links.terms} className="hover:text-foreground">
              Terms
            </Link>
            <Link href={site.links.privacy} className="hover:text-foreground">
              Privacy
            </Link>
            <a href={site.links.support} className="hover:text-foreground">
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </>
  );
}
