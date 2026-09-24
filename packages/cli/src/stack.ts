/**
 * Which stack an app targets.
 *
 * A descriptor says what a resource is; the stack says where it runs. Cloudflare means
 * Workers, D1 and Drizzle; next means Vercel, Postgres and Prisma. Everything above the
 * database — validators, policies, hooks, the dashboard — is the same either way, which
 * is what makes having two targets tractable at all.
 *
 * The choice is made once by `flare create` and recorded in package.json, because every
 * later command needs it and nobody should have to pass it twice.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const STACKS = ["cloudflare", "next"] as const;
export type Stack = (typeof STACKS)[number];

export const isStack = (value: unknown): value is Stack => STACKS.includes(value as Stack);

/** What each one is, for `--help` and for the choice at create time. */
export const STACK_LABELS: Record<Stack, string> = {
  cloudflare: "Cloudflare Workers, D1 and Drizzle — cheapest to run, deploys everywhere",
  next: "Next.js on Vercel, Neon Postgres and Prisma — real Postgres, Node runtime",
};

/**
 * The stack an app was created with. Cloudflare when unmarked, so an app made before
 * there was a choice keeps working without being touched.
 */
export function readStack(appRoot: string): Stack {
  const file = join(appRoot, "package.json");
  if (!existsSync(file)) return "cloudflare";
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { flare?: { stack?: unknown } };
    return isStack(parsed.flare?.stack) ? parsed.flare.stack : "cloudflare";
  } catch {
    // A package.json we can't read is a problem for whatever needs it, not for this.
    return "cloudflare";
  }
}

/** Record the choice, so `flare gen` and the rest don't have to be told again. */
export function writeStack(appRoot: string, stack: Stack): void {
  const file = join(appRoot, "package.json");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown> & { flare?: Record<string, unknown> };
  parsed.flare = { ...parsed.flare, stack };
  writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
}
