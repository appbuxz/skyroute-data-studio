import { useLanguage } from "@/lib/i18n/language-context";
import { useQueryClient } from "@tanstack/react-query";
import { terminateSession } from "@/lib/auth/session";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Menu,
  Plane,
  Search,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "./brand";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clearLegacyFlightSearch } from "@/lib/flights/search-session";
import { OrganizationSelector } from "./organization-selector";

import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { readSidebarCollapsed, SIDEBAR_PREFERENCE_KEY } from "@/lib/workspace/sidebar-preference";

const NAV = [
  {
    label: "Search",
    items: [
      { to: "/search", label: "Flight Search", icon: Search },
      { to: "/check-my-flight", label: "Check My Flight", icon: Plane },
    ],
  },
  {
    label: "Agency Tools",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/analysis", label: "Analytics", icon: BarChart3 },
      { to: "/reports", label: "Reports", icon: FileText },
    ],
  },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const isMobile = useIsMobile();
  const compact = collapsed && !isMobile;
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentLabel =
    path === "/settings"
      ? "Settings"
      : (NAV.map((group) => group.items.find((item) => item.to === path)).find(
          (item) => item !== undefined,
        )?.label ?? "Workspace navigation");
  useEffect(() => {
    setMobileOpen(false);
  }, [path, isMobile]);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);
    setSignOutError("");

    try {
      await terminateSession(supabase, queryClient);

      // Clear flight data only after successful sign-out.
      clearLegacyFlightSearch();

      await navigate({ to: "/login", replace: true });
    } catch {
      setSignOutError("Unable to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }
  function toggleNavigation() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, next ? "collapsed" : "expanded");
    } catch {
      /* Keep this session usable without storage. */
    }
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background text-foreground md:flex-row">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <header className="sticky top-0 z-40 flex min-h-14 items-center gap-3 border-b bg-background px-4 py-2 md:hidden">
          <SheetTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label={t("Open menu")}
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <p className="min-w-0 break-words text-base font-semibold leading-snug">
            {t(currentLabel)}
          </p>
        </header>
        <SheetContent
          side="left"
          closeLabel={t("Close menu")}
          className="flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-4 overflow-y-auto bg-sidebar px-4 text-sidebar-foreground md:hidden"
        >
          <SheetTitle className="pr-8 text-left">{t("Workspace navigation")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("Choose a section or switch organization.")}
          </SheetDescription>
          <nav aria-label={t("Workspace navigation")} className="space-y-3">
            {NAV.map((group) => (
              <section key={group.label} aria-label={t(group.label)}>
                <h2 className="px-3 py-2 text-xs font-medium uppercase tracking-wide opacity-70">
                  {t(group.label)}
                </h2>
                {group.items.map(({ to, label, icon: Icon }) => (
                  <SheetClose asChild key={to}>
                    <Link
                      to={to}
                      aria-current={path === to ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                        path === to
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "hover:bg-sidebar-accent",
                      )}
                    >
                      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                      <span>{t(label)}</span>
                    </Link>
                  </SheetClose>
                ))}
              </section>
            ))}
            <SheetClose asChild>
              <Link
                to="/settings"
                aria-current={path === "/settings" ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
                  path === "/settings"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent",
                )}
              >
                <Settings aria-hidden="true" className="h-4 w-4 shrink-0" />
                {t("Settings")}
              </Link>
            </SheetClose>
          </nav>
          <div className="mt-auto space-y-3 border-t border-sidebar-border pt-4">
            <OrganizationSelector idPrefix="mobile-workspace" />
            <Button
              type="button"
              variant="ghost"
              disabled={signingOut}
              onClick={handleSignOut}
              className="w-full justify-start gap-3"
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              {t(signingOut ? "Signing out..." : "Sign out")}
            </Button>
            {signOutError && (
              <p role="alert" className="text-xs text-destructive">
                {t(signOutError)}
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <TooltipProvider delayDuration={200}>
        <aside
          id="workspace-sidebar"
          aria-label={t("Workspace navigation")}
          data-collapsed={collapsed}
          className={cn(
            "hidden shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex md:sticky md:top-0 md:h-screen",
            collapsed ? "md:w-16" : "md:w-60",
          )}
        >
          <div
            className={cn(
              "flex h-14 items-center justify-between",
              collapsed && "md:h-auto md:flex-col md:gap-2 md:py-3",
            )}
          >
            <Link
              to="/"
              aria-label="Flight Analytics"
              className={cn(
                "flex min-w-0 items-center px-5 text-sidebar-accent-foreground",
                collapsed && "md:px-0",
              )}
            >
              <Brand compact={collapsed} />
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("mr-2 hidden h-8 w-8 shrink-0 md:inline-flex", collapsed && "md:mr-0")}
              aria-label={t(collapsed ? "Expand navigation" : "Collapse navigation")}
              title={t(collapsed ? "Expand navigation" : "Collapse navigation")}
              aria-expanded={!collapsed}
              aria-controls="workspace-sidebar"
              onClick={toggleNavigation}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          </div>
          <nav
            aria-label={t("Workspace navigation")}
            className="flex gap-4 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0"
          >
            {NAV.map((group) => (
              <section key={group.label} aria-label={t(group.label)} className="shrink-0">
                <h2
                  className={cn(
                    "px-3 py-2 text-xs font-medium uppercase tracking-wide text-sidebar-foreground/70",
                    collapsed && "md:sr-only",
                  )}
                >
                  {t(group.label)}
                </h2>
                <div className="flex gap-1 md:flex-col">
                  {group.items.map(({ to, label, icon: Icon }) => {
                    const active = path === to;
                    return (
                      <SidebarHint key={to} label={t(label)} active={compact}>
                        <Link
                          to={to}
                          aria-label={t(label)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                            collapsed && "md:justify-center md:px-2",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <Icon
                            aria-hidden="true"
                            className={cn("h-4 w-4 shrink-0", active && "text-sidebar-primary")}
                          />
                          <span className={collapsed ? "md:sr-only" : undefined}>{t(label)}</span>
                        </Link>
                      </SidebarHint>
                    );
                  })}
                </div>
              </section>
            ))}
            <SidebarHint label={t("Settings")} active={compact}>
              <Link
                to="/settings"
                aria-label={t("Settings")}
                aria-current={path === "/settings" ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-3 self-start rounded-md px-3 py-2 text-sm transition-colors md:self-auto",
                  collapsed && "md:justify-center md:px-2",
                  path === "/settings"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <Settings aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className={collapsed ? "md:sr-only" : undefined}>{t("Settings")}</span>
              </Link>
            </SidebarHint>
          </nav>
          <div
            className={cn(
              "relative mt-auto border-t border-sidebar-border px-5 py-4",
              collapsed && "md:px-3",
            )}
          >
            <div className={collapsed ? "md:hidden" : undefined}>
              <OrganizationSelector />
            </div>
            {collapsed && (
              <div className="hidden md:block">
                <Popover>
                  <SidebarHint label={t("Organization")} active={compact}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-full"
                        aria-label={t("Organization")}
                      >
                        <Building2 aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                  </SidebarHint>
                  <PopoverContent
                    side="right"
                    align="end"
                    className="w-72 bg-sidebar text-sidebar-foreground"
                  >
                    <OrganizationSelector idPrefix="compact-workspace" />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <SidebarHint label={t(signingOut ? "Signing out..." : "Sign out")} active={compact}>
              <button
                type="button"
                aria-label={t(signingOut ? "Signing out..." : "Sign out")}
                onClick={handleSignOut}
                disabled={signingOut}
                className={cn(
                  "mt-4 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent disabled:opacity-50",
                  collapsed && "md:justify-center md:px-2",
                )}
              >
                <LogOut aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className={collapsed ? "md:sr-only" : undefined}>
                  {t(signingOut ? "Signing out..." : "Sign out")}
                </span>
              </button>
            </SidebarHint>
            {signOutError && (
              <p
                role="alert"
                className={cn(
                  "mt-2 text-xs text-destructive",
                  collapsed &&
                    "md:absolute md:bottom-4 md:left-full md:z-50 md:ml-2 md:w-56 md:rounded-md md:border md:bg-background md:p-3 md:shadow",
                )}
              >
                {t(signOutError)}
              </p>
            )}
          </div>
        </aside>
      </TooltipProvider>
      <main className="min-w-0 flex-1 px-4 py-8 md:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

function SidebarHint({
  label,
  active,
  children,
}: {
  label: string;
  active: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={active && open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {active && (
        <TooltipContent side="right" className="hidden md:block">
          {label}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
