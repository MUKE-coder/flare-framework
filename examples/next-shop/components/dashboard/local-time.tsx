"use client";

import { useEffect, useState } from "react";

/**
 * A timestamp in the reader's own timezone.
 *
 * Pages render on a Worker, where the clock is UTC, so a date formatted on the server is
 * in the wrong timezone for everyone. The server's version is rendered first (so the
 * markup isn't empty and search engines see something), then the browser replaces it
 * with its own once it's running.
 */
export function LocalTime({
  value,
  dateStyle = "medium",
  timeStyle = "short",
  className,
}: {
  /** Milliseconds, an ISO string, or a Date. */
  value: number | string | Date | null | undefined;
  dateStyle?: Intl.DateTimeFormatOptions["dateStyle"];
  timeStyle?: Intl.DateTimeFormatOptions["timeStyle"];
  className?: string;
}) {
  const date = value === null || value === undefined ? null : value instanceof Date ? value : new Date(value);
  const utc = date ? new Intl.DateTimeFormat("en-GB", { dateStyle, timeStyle, timeZone: "UTC" }).format(date) : "—";
  const [text, setText] = useState(utc);

  useEffect(() => {
    if (!date) return;
    setText(new Intl.DateTimeFormat(undefined, { dateStyle, timeStyle }).format(date));
  }, [date?.getTime(), dateStyle, timeStyle]);

  if (!date) return <span className={className}>—</span>;
  return (
    <time dateTime={date.toISOString()} title={date.toISOString()} className={className} suppressHydrationWarning>
      {text}
    </time>
  );
}

/** "3 minutes ago", "yesterday", falling back to a date once it's a week old. */
export function RelativeTime({ value, className }: { value: number | string | Date | null | undefined; className?: string }) {
  const date = value === null || value === undefined ? null : value instanceof Date ? value : new Date(value);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!date) return;
    const format = () => {
      const seconds = Math.round((date.getTime() - Date.now()) / 1000);
      const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
      const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ["second", 60],
        ["minute", 60],
        ["hour", 24],
        ["day", 7],
      ];
      let value = seconds;
      for (const [unit, size] of units) {
        if (Math.abs(value) < size) return relative.format(Math.round(value), unit);
        value /= size;
      }
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
    };
    setText(format());
    // Re-read every half minute, so "just now" doesn't stay "just now" all afternoon.
    const timer = setInterval(() => setText(format()), 30_000);
    return () => clearInterval(timer);
  }, [date?.getTime()]);

  if (!date) return <span className={className}>—</span>;
  return (
    <time dateTime={date.toISOString()} title={date.toISOString()} className={className} suppressHydrationWarning>
      {text ?? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(date)}
    </time>
  );
}
