"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Phone,
  MessageCircle,
  Globe,
  Users,
  CalendarClock,
  Settings,
  Bot,
  LogOut,
  Building2,
  Shield,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calls", label: "Call History", icon: Phone },
  { href: "/conversations", label: "Conversations", icon: MessageCircle },
  { href: "/websites", label: "Websites", icon: Globe },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/callbacks", label: "Callbacks", icon: CalendarClock },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface OrgSummary {
  id: string;
  name: string;
  slug: string;
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const asOrg = searchParams.get("asOrg");
  const { data: session } = useSession();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);

  const isSuperAdmin = session?.user?.role === "superAdmin";
  const user = session?.user;

  // Super-admins: load all orgs for the switcher
  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch("/api/admin/organizations")
      .then((r) => r.json())
      .then((d) =>
        setOrgs(
          (d.organizations || []).map((o: OrgSummary) => ({
            id: o.id,
            name: o.name,
            slug: o.slug,
          }))
        )
      )
      .catch(() => {});
  }, [isSuperAdmin]);

  const activeOrgId = asOrg || session?.user?.organizationId || null;
  const activeOrg = orgs.find((o) => o.id === activeOrgId);

  function switchOrg(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (id && id !== session?.user?.organizationId) {
      params.set("asOrg", id);
    } else {
      params.delete("asOrg");
    }
    window.location.href = `${pathname}?${params.toString()}`;
  }

  // Preserve asOrg query param in all nav links
  const navSuffix = asOrg ? `?asOrg=${asOrg}` : "";

  return (
    <aside className="w-64 bg-[#161b22] text-white flex flex-col min-h-screen border-r border-white/10">
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Bot className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-sm tracking-tight truncate">
              {activeOrg?.name || "Call Assistant"}
            </h1>
            <p className="text-xs text-slate-500">
              {isSuperAdmin && asOrg ? "viewing as super-admin" : "AI CRM"}
            </p>
          </div>
        </div>

        {/* Super-admin org switcher */}
        {isSuperAdmin && orgs.length > 0 && (
          <div className="mt-3">
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3 h-3" />
                  Switch org
                </span>
                <span className="text-slate-500 truncate">
                  {activeOrg?.slug || "—"}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {orgs.map((o) => (
                  <DropdownMenuItem
                    key={o.id}
                    onClick={() => switchOrg(o.id)}
                    className="flex flex-col items-start"
                  >
                    <span className="text-sm">{o.name}</span>
                    <span className="text-[10px] text-slate-500">{o.slug}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href + navSuffix}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-blue-600/15 text-blue-400 border border-blue-500/20"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <item.icon className={cn("w-4 h-4", isActive && "text-blue-400")} />
              {item.label}
            </Link>
          );
        })}

        {isSuperAdmin && (
          <Link
            href="/admin/organizations"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mt-4 border-t border-white/10 pt-4",
              pathname?.startsWith("/admin")
                ? "text-amber-400"
                : "text-slate-500 hover:text-amber-400 hover:bg-white/5"
            )}
          >
            <Shield className="w-4 h-4" />
            Admin
          </Link>
        )}
      </nav>

      {/* User menu */}
      <div className="p-3 border-t border-white/10">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-semibold">
                {(user.name || user.email || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm truncate">{user.name || user.email}</p>
                <p className="text-[10px] text-slate-500 truncate">
                  {user.email}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel className="text-xs">
                {user.name || user.email}
                <p className="text-[10px] text-slate-500 font-normal">
                  {user.role}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="w-2 h-2 bg-slate-600 rounded-full" />
            <span className="text-xs text-slate-500">Not signed in</span>
          </div>
        )}
      </div>
    </aside>
  );
}
