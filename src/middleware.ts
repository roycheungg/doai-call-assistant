import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge-runtime middleware.
 *
 * Cannot import the full NextAuth config here because the Prisma adapter
 * uses Node-only modules. Instead we check for the session cookie and defer
 * the actual session validation to route handlers via requireTenant().
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes - no auth required
  const publicPrefixes = [
    "/api/website-chat",
    "/api/whatsapp",
    "/api/vapi",
    "/api/auth",
    "/embed",
    "/login",
    "/widget.js",
    "/test-widget.html",
    "/favicon",
  ];
  if (publicPrefixes.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for a session cookie (NextAuth v5 default names)
  const cookie =
    req.cookies.get("authjs.session-token")?.value ||
    req.cookies.get("__Secure-authjs.session-token")?.value;

  if (!cookie) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:js|css|png|jpg|jpeg|svg|ico|html)$).*)",
  ],
};
