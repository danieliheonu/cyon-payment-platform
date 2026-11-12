import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic check only: sends visitors without a session cookie to /login.
 * Real authorization happens in pages, server actions and services
 * (see src/server/auth/session.ts and src/domain/actor.ts).
 */
const SESSION_COOKIE = "cyon_session";
const PROTECTED = ["/dashboard", "/pay", "/history", "/payments", "/staff", "/finance", "/admin", "/change-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // The landing page sends signed-out visitors straight to sign-in.
  if (pathname === "/" && !request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isProtected && !request.cookies.has(SESSION_COOKIE)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|p/).*)"],
};
