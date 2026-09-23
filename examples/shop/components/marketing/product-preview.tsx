import { site } from "@/lib/site";

/**
 * A drawing of the app in CSS, not a screenshot, so it takes the theme's colours and
 * type. Replace it with a real screenshot of your product when you have one.
 */
export function ProductPreview() {
  const rows = [
    ["Northwind", "Active", "$4,200"],
    ["Brightline", "Trial", "$1,150"],
    ["Vandelay", "Active", "$9,800"],
    ["Globex", "Paused", "$640"],
  ];
  const bars = [38, 52, 44, 68, 57, 76, 71, 88, 80, 94, 86, 100];
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-5xl">
      <div className="absolute -inset-x-10 -top-10 -bottom-20 -z-10 rounded-[3rem] bg-gradient-to-b from-brand/15 via-brand/5 to-transparent blur-2xl" />
      <div className="overflow-hidden rounded-[calc(var(--radius)+10px)] border border-border bg-surface shadow-2xl shadow-foreground/10">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="size-3 rounded-full bg-border" />
          <span className="size-3 rounded-full bg-border" />
          <span className="size-3 rounded-full bg-border" />
          <span className="ml-3 h-6 flex-1 rounded-md bg-surface-muted" />
        </div>
        <div className="grid grid-cols-[180px_1fr] max-sm:grid-cols-1">
          <div className="flex flex-col gap-1.5 border-r border-border bg-surface-muted/60 p-4 max-sm:hidden">
            <span className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span className="size-5 rounded-md bg-brand [background-image:var(--brand-gradient,none)]" />
              {site.name}
            </span>
            {["Overview", "Customers", "Invoices", "Reports", "Settings"].map((item, index) => (
              <span key={item} className={`rounded-md px-2.5 py-1.5 text-xs ${index === 0 ? "bg-surface font-medium text-foreground shadow-sm" : "text-foreground-muted"}`}>
                {item}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-5 p-6">
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Revenue", "$48,290", "+12%"],
                ["Customers", "1,284", "+8%"],
                ["Churn", "1.9%", "-0.4%"],
              ].map(([label, value, change]) => (
                <div key={label} className="rounded-[var(--radius)] border border-border p-3">
                  <p className="text-[11px] text-foreground-muted">{label}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
                  <p className="text-[11px] text-success">{change}</p>
                </div>
              ))}
            </div>
            <div className="flex h-28 items-end gap-1.5 rounded-[var(--radius)] border border-border p-3">
              {bars.map((height, index) => (
                <span key={index} className="flex-1 rounded-t-sm bg-brand/80 [background-image:var(--brand-gradient,none)]" style={{ height: `${height}%`, opacity: 0.35 + index * 0.055 }} />
              ))}
            </div>
            <div className="rounded-[var(--radius)] border border-border">
              {rows.map(([name, status, amount]) => (
                <div key={name} className="flex items-center justify-between border-b border-border px-3 py-2 text-xs last:border-b-0">
                  <span className="font-medium">{name}</span>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-foreground-muted">{status}</span>
                  <span className="tabular-nums">{amount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
