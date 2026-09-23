import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** The current session, or null. Validates against the database: use in server components, actions and route handlers. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** The current session; redirects to /sign-in (returning to `returnTo` afterwards) when signed out. */
export async function requireSession(returnTo?: string) {
  const session = await getSession();
  if (!session) {
    redirect(returnTo ? `/sign-in?next=${encodeURIComponent(returnTo)}` : "/sign-in");
  }
  return session;
}

/** Only allow same-site relative redirect targets, to avoid open redirects via `?next=`. */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
    ? value
    : fallback;
}
