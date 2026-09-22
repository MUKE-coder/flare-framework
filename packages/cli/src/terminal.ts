/**
 * Shared terminal output: durations, counts and a progress line that rewrites itself.
 *
 * The box-drawing characters clack uses come from its own terminal sniffing; see
 * bin/flare.js for why Windows needs a hand there.
 */

export const isTTY = (): boolean => Boolean(process.stdout.isTTY);

/** "8s", "1m 20s", "1h 04m". */
export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}m`;
}

/** Thousands separators, in the terminal's own locale. */
export const formatCount = (value: number): string => value.toLocaleString();

/** "48,000 rows/s" from a count and how long it took. */
export function formatRate(count: number, ms: number, unit = "rows"): string {
  if (ms <= 0) return `${formatCount(count)} ${unit}/s`;
  return `${formatCount(Math.round((count / ms) * 1000))} ${unit}/s`;
}

export interface ProgressLine {
  update: (message: string) => void;
  /** Clear the line (a spinner or a final message takes it from here). */
  done: () => void;
}

/**
 * A single line that rewrites itself, at most every `everyMs` so a fast loop doesn't
 * spend its time drawing. Off a terminal (CI, a pipe) it prints nothing: the caller's
 * final message is the record.
 */
export function progressLine(everyMs = 120): ProgressLine {
  if (!isTTY()) return { update: () => {}, done: () => {} };
  let last = 0;
  let width = 0;
  const write = (message: string) => {
    process.stdout.write(`\r${message.padEnd(width)}`);
    width = Math.max(width, message.length);
  };
  return {
    update(message) {
      const now = Date.now();
      if (now - last < everyMs) return;
      last = now;
      write(message);
    },
    done() {
      if (width > 0) process.stdout.write(`\r${" ".repeat(width)}\r`);
      width = 0;
    },
  };
}
