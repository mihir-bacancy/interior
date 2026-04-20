import { NextRequest, NextResponse } from "next/server";

/**
 * Auth gate for UI pages. API routes handle their own auth (CRON_SECRET
 * header, INGEST_SECRET header, or session cookie). This middleware only
 * redirects browser requests to /login when no session cookie is present.
 *
 * We intentionally don't decrypt the cookie here — middleware runs on Edge
 * runtime where iron-session isn't fully compatible. Presence-check is good
 * enough for UX; the server components / server actions enforce real auth.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths
  if (
    pathname === "/login" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const hasSession = req.cookies.has("interior_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
