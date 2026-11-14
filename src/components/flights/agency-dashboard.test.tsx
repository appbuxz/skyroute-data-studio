import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ memberships: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/organizations/session.functions", () => ({
  getOrganizationMemberships: mocks.memberships,
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
import { AgencyDashboard } from "./agency-dashboard";
import {
  OrganizationWorkspaceContext,
  type OrganizationWorkspace,
} from "@/lib/organizations/workspace-context";
import { LanguageContext } from "@/lib/i18n/language-context";
import { createTranslator, type Language } from "@/lib/i18n/language";
import { ANALYTICS_ORG, analyticsSnapshot } from "@/test/fixtures/agency-analysis";
import type { OrganizationId } from "@/lib/flights/types";

function workspace(): OrganizationWorkspace {
  return {
    memberships: [{ organizationId: ANALYTICS_ORG, organizationName: "Agency A", role: "member" }],
    selectedOrganizationId: ANALYTICS_ORG,
    status: "ready",
    error: null,
    authorizationError: null,
    canSearch: true,
    version: 1,
    search: analyticsSnapshot(),
    selectOrganization: vi.fn(),
    reloadMemberships: vi.fn(),
    isCurrentScope: () => true,
    publishSearch: vi.fn(),
    clearSearch: vi.fn(),
    rejectSelection: vi.fn(),
  };
}
function page(value: OrganizationWorkspace, language: Language = "en") {
  return (
    <LanguageContext.Provider value={{ ...createTranslator(language), setLanguage: vi.fn() }}>
      <OrganizationWorkspaceContext.Provider value={value}>
        <AgencyDashboard />
      </OrganizationWorkspaceContext.Provider>
    </LanguageContext.Provider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.memberships.mockResolvedValue(workspace().memberships);
});
afterEach(cleanup);

describe("agency dashboard", () => {
  it("shows a search with route counts, dates and original currency minima", async () => {
    const state = workspace();
    state.search!.offers[1]!.price = { amount: 500, currency: "USD" };
    render(page(state));
    await screen.findByRole("link", { name: "Open analytics" });
    expect(
      within(screen.getByRole("region", { name: "Offers" })).getByText("3"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Unique itineraries" })).getByText("2"),
    ).toBeInTheDocument();
    expect(screen.getByText("180,000 KZT")).toBeInTheDocument();
    expect(screen.getByText("500 USD")).toBeInTheDocument();
    expect(screen.getByText("10 Dec 2099")).toHaveAttribute("datetime", "2099-12-10");
    expect(document.querySelector('time[datetime="2026-11-14T10:35:00Z"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open analytics" })).toHaveAttribute(
      "href",
      "/analysis",
    );
    expect(screen.getByText(/Only this session’s latest search/)).toBeInTheDocument();
  });
  it("distinguishes no snapshot from a successful search with no offers", async () => {
    const state = workspace();
    const view = render(page({ ...state, search: null }));
    await screen.findByText("No search results in this session");
    expect(screen.queryByRole("region", { name: "Offers" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to flight search" })).toHaveAttribute(
      "href",
      "/search",
    );
    view.rerender(page({ ...state, search: { ...state.search!, offers: [] } }));
    expect(screen.getByText("The latest search returned no offers")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Offers" })).getByText("0"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Unique itineraries" })).getByText("0"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open analytics" })).not.toBeInTheDocument();
    expect(screen.queryByText("No search results in this session")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to flight search" })).toHaveAttribute(
      "href",
      "/search",
    );
  });
  it("waits for a current server membership check before displaying any snapshot", async () => {
    let resolve!: (value: unknown) => void;
    mocks.memberships.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(page(workspace()));
    expect(screen.getByText("Loading search summary…")).toBeInTheDocument();
    expect(screen.queryByText("180,000 KZT")).not.toBeInTheDocument();
    await act(async () => resolve(workspace().memberships));
    expect(screen.getByText("180,000 KZT")).toBeInTheDocument();
  });
  it("separates verification failure from an organization without searches", async () => {
    const state = workspace();
    mocks.memberships.mockRejectedValue(new Error("private database detail"));
    render(page(state));
    await screen.findByText("Unable to verify organization access");
    expect(screen.queryByText("No search results in this session")).not.toBeInTheDocument();
    expect(screen.queryByText("180,000 KZT")).not.toBeInTheDocument();
    expect(screen.queryByText(/private database/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry membership check" }));
    expect(state.reloadMemberships).toHaveBeenCalledOnce();
  });
  it("denies a revoked selected organization even if another membership still exists", async () => {
    mocks.memberships.mockResolvedValue([
      { organizationId: "other-agency", organizationName: "Other agency", role: "member" },
    ]);
    render(page(workspace()));
    await screen.findByText("Organization access required");
    expect(screen.queryByText("180,000 KZT")).not.toBeInTheDocument();
  });
  it("never substitutes a different organization's snapshot or any personal snapshot", async () => {
    const state = workspace();
    state.search!.organizationId = "another-agency" as OrganizationId;
    render(page(state));
    await screen.findByText("No search results in this session");
    expect(screen.queryByText("180,000 KZT")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open analytics" })).not.toBeInTheDocument();
  });
  it("invalidates the visible snapshot immediately while checking a different selection", async () => {
    const state = workspace();
    const view = render(page(state));
    await screen.findByText("180,000 KZT");
    let resolve!: (value: unknown) => void;
    mocks.memberships.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    view.rerender(
      page({ ...state, version: 2, selectedOrganizationId: "other-agency" as OrganizationId }),
    );
    expect(screen.queryByText("180,000 KZT")).not.toBeInTheDocument();
    await act(async () =>
      resolve([
        { organizationId: "other-agency", organizationName: "Other agency", role: "member" },
      ]),
    );
    expect(screen.getByText("No search results in this session")).toBeInTheDocument();
  });
  it.each([
    ["ru", "Открыть аналитику", "Минимальные цены по валютам"],
    ["kk", "Талдауды ашу", "Валюталар бойынша ең төмен бағалар"],
  ] as const)(
    "translates the summary and formats prices in %s",
    async (language, analytics, minima) => {
      render(page(workspace(), language));
      await screen.findByRole("link", { name: analytics });
      expect(screen.getByRole("heading", { name: minima })).toBeInTheDocument();
      expect(screen.getByText("180 000 KZT")).toBeInTheDocument();
    },
  );
});
