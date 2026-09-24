import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Session middleware: an optimistic, cookie-only check that sends signed-out
 * visitors to /sign-in before rendering. It does not hit the database, so it
 * is NOT an authorization check: protected pages and routes must still call
 * `requireSession()` / `getSession()` from `lib/session.ts`.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
