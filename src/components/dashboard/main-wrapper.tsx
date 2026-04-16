"use client";

import { usePathname } from "next/navigation";

export function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFullWidth = pathname?.startsWith("/conversations");

  if (isFullWidth) {
    return <div className="h-full">{children}</div>;
  }

  return <div className="max-w-7xl mx-auto p-8">{children}</div>;
}
