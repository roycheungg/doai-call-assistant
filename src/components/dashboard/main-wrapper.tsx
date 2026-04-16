"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/dashboard/sidebar";

export function MainWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Embed page and login pages: no sidebar, no padding, no chrome
  if (pathname?.startsWith("/embed") || pathname?.startsWith("/login")) {
    return <>{children}</>;
  }

  const isFullWidth = pathname?.startsWith("/conversations");

  return (
    <div className="h-full flex w-full">
      <Suspense fallback={<SidebarFallback />}>
        <Sidebar />
      </Suspense>
      <main className="flex-1 overflow-auto">
        {isFullWidth ? (
          <div className="h-full">{children}</div>
        ) : (
          <div className="max-w-7xl mx-auto p-8">{children}</div>
        )}
      </main>
    </div>
  );
}

function SidebarFallback() {
  return (
    <aside className="w-64 bg-[#161b22] border-r border-white/10" aria-hidden />
  );
}
