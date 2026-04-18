"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

// Mock session used only when NEXT_PUBLIC_DEV_BYPASS_AUTH=1 (local dev).
// Server-side, requireTenant() returns a matching mock context.
const mockSession: Session = {
  user: {
    id: "dev-user",
    email: "roy.cheung@doaisystems.co.uk",
    name: "Roy Cheung",
    organizationId: null,
    role: "superAdmin",
  },
  expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const bypass = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "1";

  if (bypass) {
    return (
      <NextAuthSessionProvider session={mockSession}>
        {children}
      </NextAuthSessionProvider>
    );
  }

  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
