import { Link, useRouterState } from "@tanstack/react-router";
import { BarChart3, FileText, LayoutDashboard, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "./brand";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/search", label: "Flight search", icon: Search },
  { to: "/analysis", label: "Analysis", icon: BarChart3 },
  { to: "/reports", label: "Reports", icon: FileText },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex min-h-screen w-full flex-col bg-background md:flex-row">
      <aside className="flex shrink-0 flex-col bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-60">
        <Link to="/" className="flex h-14 items-center px-5 text-sidebar-accent-foreground">
          <Brand />
        </Link>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = path === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4", active && "text-sidebar-primary")} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto hidden border-t border-sidebar-border px-5 py-4 text-xs md:block">
          <p className="font-medium text-sidebar-accent-foreground">Workspace</p>
          <p className="mt-0.5 opacity-70">No organization connected</p>
        </div>
      </aside>
      <main className="flex-1 px-4 py-8 md:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
