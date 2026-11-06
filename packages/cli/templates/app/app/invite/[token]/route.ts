import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE } from "@/lib/invitations";

/**
 * Where an invitation link lands.
 *
 * It does one thing: put the token in a short-lived cookie and send the person to the
 * sign-up page. The token stays out of the sign-up URL, so it is not in a bookmark, a
 * referrer header or a screenshot of the address bar — and the sign-up form needs no
 * hidden field, which means every way of signing up is covered by the same check in
 * lib/auth.ts.
 *
 * The invitation is not validated here. A bad token simply fails at sign-up, which is
 * one place to get right rather than two; validating twice is how the two drift apart.
 */
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }): Promise<never> {
  const { token } = await context.params;
  const jar = await cookies();
  jar.set(INVITE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INVITE_COOKIE_MAX_AGE,
  });
  redirect("/sign-up?invited=1");
}
