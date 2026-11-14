import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import { AgencyAnalysisPage, AnalyticsResults } from "./agency-analysis";
import {
  OrganizationWorkspaceContext,
  type OrganizationWorkspace,
} from "@/lib/organizations/workspace-context";
import { ANALYTICS_ORG, analyticsSnapshot } from "@/test/fixtures/agency-analysis";

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
function page(value: OrganizationWorkspace) {
  return (
    <OrganizationWorkspaceContext.Provider value={value}>
      <AgencyAnalysisPage />
    </OrganizationWorkspaceContext.Provider>
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.memberships.mockResolvedValue([{ organizationId: ANALYTICS_ORG }]);
});
afterEach(cleanup);

describe("analytics access states", () => {
  it("shows a personal account its access state and search link without displaying a stale agency snapshot", async () => {
    mocks.memberships.mockResolvedValue([]);
    render(page(workspace()));
    await screen.findByText("Analytics isn’t available for your account");
    expect(screen.getByRole("link", { name: "Back to flight search" })).toHaveAttribute(
      "href",
      "/search",
    );
    expect(screen.queryByText("Air Astana")).not.toBeInTheDocument();
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
    expect(mocks.memberships).toHaveBeenCalledOnce();
  });
  it("separates a failed membership check from confirmed missing membership and offers retry", async () => {
    mocks.memberships.mockRejectedValue(new Error("private database details"));
    const state = workspace();
    render(page(state));
    await screen.findByText("Unable to verify analytics access");
    expect(
      screen.queryByText("Analytics isn’t available for your account"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/private database/)).not.toBeInTheDocument();
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry membership check" }));
    expect(state.reloadMemberships).toHaveBeenCalledOnce();
  });
  it("does not show agency data until the server confirms access", async () => {
    let resolve!: (value: unknown[]) => void;
    mocks.memberships.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    render(page(workspace()));
    expect(screen.getByText("Checking analytics access…")).toBeInTheDocument();
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
    await act(async () => resolve([{ organizationId: ANALYTICS_ORG }]));
    expect(screen.getByText("Carrier comparison")).toBeInTheDocument();
  });
  it("hides a snapshot when the server only confirms membership in a different agency", async () => {
    mocks.memberships.mockResolvedValue([{ organizationId: "different-agency" }]);
    render(page(workspace()));
    await screen.findByText("Analytics isn’t available for your account");
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
  });
  it("shows an empty state after a successful check with no search", async () => {
    render(page({ ...workspace(), search: null }));
    await screen.findByText("No flight results yet");
  });
  it("rechecks membership and hides results immediately after a scope change", async () => {
    const state = workspace();
    const view = render(page(state));
    await screen.findByText("Carrier comparison");
    mocks.memberships.mockReturnValue(new Promise(() => {}));
    view.rerender(page({ ...state, version: 2 }));
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.memberships).toHaveBeenCalledTimes(2));
  });
});

describe("analytics presentation", () => {
  it("shows summary then metrics and one desktop row/mobile item per complete itinerary", () => {
    render(<AnalyticsResults search={analyticsSnapshot()} />);
    expect(screen.getByText("3 offers", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("2099-12-10")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Flight schedules" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("2")).toBeInTheDocument();
    expect(within(table).getByText(/ALA → NQZ/)).toBeInTheDocument();
    expect(within(table).getByText(/NQZ → IST/)).toBeInTheDocument();
    expect(within(table).getByText(/ALA → DXB/)).toBeInTheDocument();
    expect(
      within(screen.getByRole("list", { name: "Flight schedules mobile" }))
        .getAllByRole("listitem")
        .filter(
          (item) => item.parentElement?.getAttribute("aria-label") === "Flight schedules mobile",
        ),
    ).toHaveLength(2);
    expect(screen.getByText(/Price spread is not guaranteed savings/)).toBeInTheDocument();
  });
  it("retains original currencies and avoids comparing mixed-currency carrier minima", () => {
    const search = analyticsSnapshot();
    search.offers[1]!.price = { amount: 500, currency: "USD" };
    render(<AnalyticsResults search={search} />);
    expect(screen.queryByText("Lowest price")).not.toBeInTheDocument();
    expect(screen.getByText("From 500 USD")).toBeInTheDocument();
    expect(screen.getByText(`From ${(180000).toLocaleString()} KZT`)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Flight schedules" });
    expect(within(table).getByText("500 USD")).toBeInTheDocument();
    expect(within(table).getByText(`${(180000).toLocaleString()} KZT`)).toBeInTheDocument();
  });
});
