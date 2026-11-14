import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => "/analysis",
  useNavigate: () => vi.fn(),
  Link: ({ to, ...props }: ComponentProps<"a"> & { to: string }) => <a href={to} {...props} />,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {} } }));
import { AppShell } from "./app-shell";
import { SIDEBAR_PREFERENCE_KEY } from "@/lib/workspace/sidebar-preference";
import { LanguageContext } from "@/lib/i18n/language-context";
import { createTranslator, type Language } from "@/lib/i18n/language";
import {
  OrganizationWorkspaceContext,
  type OrganizationWorkspace,
} from "@/lib/organizations/workspace-context";
import type { OrganizationId } from "@/lib/flights/types";

function page(language: Language = "en") {
  const workspace: OrganizationWorkspace = {
    memberships: [
      {
        organizationId: "agency-a" as OrganizationId,
        organizationName: "Agency A",
        role: "member",
      },
    ],
    selectedOrganizationId: "agency-a" as OrganizationId,
    status: "ready",
    error: null,
    authorizationError: null,
    canSearch: true,
    version: 1,
    search: null,
    selectOrganization: mocks.select,
    reloadMemberships: vi.fn(),
    isCurrentScope: () => true,
    publishSearch: vi.fn(),
    clearSearch: vi.fn(),
    rejectSelection: vi.fn(),
  };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LanguageContext.Provider value={{ ...createTranslator(language), setLanguage: vi.fn() }}>
        <OrganizationWorkspaceContext.Provider value={workspace}>
          <AppShell>
            <p>Workspace content</p>
          </AppShell>
        </OrganizationWorkspaceContext.Provider>
      </LanguageContext.Provider>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("localStorage", window.sessionStorage);
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("workspace sidebar", () => {
  it("saves both states, restores a collapsed sidebar and retains the active link", () => {
    const first = page();
    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
    expect(screen.getByRole("button", { name: "Expand navigation" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY)).toBe("collapsed");
    expect(screen.getByRole("link", { name: "Analytics" })).toHaveAttribute("aria-current", "page");
    first.unmount();
    page();
    expect(screen.getByRole("complementary")).toHaveAttribute("data-collapsed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Expand navigation" }));
    expect(window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY)).toBe("expanded");
    expect(screen.getByRole("complementary")).toHaveAttribute("data-collapsed", "false");
  });

  it.each([
    ["en", "Expand navigation", "Analytics", "Organization"],
    ["ru", "Развернуть меню", "Аналитика", "Организация"],
    ["kk", "Мәзірді ашу", "Талдау", "Ұйым"],
  ] as const)(
    "provides translated names, tooltips and an organization picker in %s",
    async (language, expand, analytics, organization) => {
      window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, "collapsed");
      page(language);
      expect(
        within(screen.getByRole("complementary")).getByRole("button", { name: expand }),
      ).toHaveAttribute("aria-expanded", "false");
      const link = screen.getByRole("link", { name: analytics });
      expect(link).toHaveAttribute("aria-current", "page");
      act(() => link.focus());
      expect(await screen.findByRole("tooltip", { name: analytics })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: organization }));
      const picker = screen.getByLabelText(organization, {
        selector: "#compact-workspace-organization",
      });
      fireEvent.change(picker, { target: { value: "agency-a" } });
      expect(mocks.select).toHaveBeenCalledWith("agency-a");
      const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
      expect(new Set(ids).size).toBe(ids.length);
    },
  );

  it("still toggles when preference storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    page();
    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));
    expect(screen.getByRole("button", { name: "Expand navigation" })).toBeInTheDocument();
  });
});

it.each([
  ["en", "Open menu", "Close menu", "Workspace navigation", "Organization"],
  ["ru", "Открыть меню", "Закрыть меню", "Навигация рабочего пространства", "Организация"],
  ["kk", "Мәзірді ашу", "Мәзірді жабу", "Жұмыс кеңістігінің мәзірі", "Ұйым"],
] as const)(
  "provides every destination and organization selection in the mobile sheet in %s",
  async (language, open, close, title, organization) => {
    vi.stubGlobal("innerWidth", 390);
    page(language);
    const trigger = screen.getByRole("button", { name: open });
    fireEvent.click(trigger);
    const drawer = await screen.findByRole("dialog", { name: title });
    expect(
      within(drawer)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/search", "/check-my-flight", "/dashboard", "/analysis", "/reports", "/settings"]);
    const picker = within(drawer).getByRole("combobox", { name: organization });
    fireEvent.change(picker, { target: { value: "agency-a" } });
    expect(mocks.select).toHaveBeenCalledWith("agency-a");
    expect(within(drawer).getByRole("button", { name: close })).toBeInTheDocument();
    fireEvent.click(within(drawer).getAllByRole("link")[0]!);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  },
);
