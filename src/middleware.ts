import { NextResponse } from "next/server";
import { auth } from "@/auth";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default auth((req) => {
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
  ];
  if (publicPrefixes.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // If not authenticated, redirect to login
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  // Run middleware on everything except Next.js internals, static files, and test assets
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|test-widget.html|widget.js|.*\\.(?:js|css|png|jpg|jpeg|svg|ico)$).*)",
  ],
};
