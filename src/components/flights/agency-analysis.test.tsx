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
import {
  ANALYTICS_ORG,
  analyticsSnapshot,
  analyticsSnapshot51,
} from "@/test/fixtures/agency-analysis";

function workspace(): OrganizationWorkspace {
  return {
    userId: "test-user",
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
  mocks.memberships.mockResolvedValue(workspace().memberships);
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
    await act(async () => resolve(workspace().memberships));
    expect(screen.getByText("Carrier comparison")).toBeInTheDocument();
    expect(screen.getByText("Agency A")).toBeInTheDocument();
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
  it("highlights the cheapest and fastest offers with their price and time differences", () => {
    const search = analyticsSnapshot();
    search.offers[0]!.outbound!.durationMinutes = 480;
    const fastest = search.offers[1]!;
    fastest.outbound!.durationMinutes = 360;
    fastest.baggage = { checked: { weightKg: 20 }, cabin: { weightKg: 8 } };
    fastest.comparisonEvidence = { baggageScopes: { checked: "all_passengers_all_segments" } };
    render(<AnalyticsResults search={search} />);
    const cheapestHeading = screen.getByRole("heading", { name: "Cheapest" });
    const fastestCard = within(screen.getByRole("heading", { name: "Fastest" }).parentElement!);
    expect(fastestCard.getByText(`${(215000).toLocaleString()} KZT`)).toBeInTheDocument();
    expect(fastestCard.getByText("6h")).toBeInTheDocument();
    expect(fastestCard.getByText("1 stop")).toBeInTheDocument();
    expect(fastestCard.getByText("Connection at NQZ · 1h 30m")).toBeInTheDocument();
    expect(fastestCard.getByText("Checked baggage · 20 kg")).toBeInTheDocument();
    expect(fastestCard.queryByText(/Cabin baggage/)).not.toBeInTheDocument();
    expect(screen.getByText("Fastest option saves 2h")).toBeInTheDocument();
    expect(screen.getByText(`Fastest option costs ${(35000).toLocaleString()} KZT more`)).toBeInTheDocument();
    expect(cheapestHeading.compareDocumentPosition(screen.getByText("Offer comparison")) &
      Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("uses one card when a single offer wins both criteria and omits picks for an empty search", () => {
    const search = analyticsSnapshot();
    search.offers = search.offers.slice(0, 1);
    const view = render(<AnalyticsResults search={search} />);
    expect(screen.getByRole("heading", { name: "Cheapest and fastest" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^(Cheapest|Fastest)$/ })).not.toBeInTheDocument();
    view.rerender(<AnalyticsResults search={{ ...search, offers: [] }} />);
    expect(screen.queryByRole("heading", { name: /Cheapest|Fastest/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Price analysis is unavailable/)).toBeInTheDocument();
  });

  it("excludes incomplete round trips from the duration comparison and omits unknown fare details", () => {
    const search = analyticsSnapshot();
    search.params.returnDate = "2099-12-15";
    const fastest = search.offers[1]!;
    fastest.outbound!.durationMinutes = 420;
    fastest.inbound = { segments: [], durationMinutes: 360 };
    fastest.price.amount = -1;
    render(<AnalyticsResults search={search} />);
    const cheapestCard = within(screen.getByRole("heading", { name: "Cheapest" }).parentElement!);
    const fastestCard = within(screen.getByRole("heading", { name: "Fastest" }).parentElement!);
    expect(cheapestCard.queryByText(/^\d+h(?: \d+m)?$/)).not.toBeInTheDocument();
    expect(cheapestCard.getByText("Connection at NQZ · 1h 30m")).toBeInTheDocument();
    expect(fastestCard.getByText("13h")).toBeInTheDocument();
    expect(fastestCard.queryByText(/KZT|baggage/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Fastest option (costs|saves)/)).not.toBeInTheDocument();
  });

  it("shows summary then metrics and one desktop row/mobile item per complete itinerary", () => {
    const search = analyticsSnapshot();
    const offer = search.offers[0]!;
    offer.outbound!.durationMinutes = 480;
    offer.baggage = { checked: { weightKg: 20 }, cabin: { weightKg: 8 } };
    offer.comparisonEvidence = { baggageScopes: { checked: "all_passengers_all_segments" } };
    render(<AnalyticsResults search={search} />);
    expect(screen.getByText("3 offers", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByText("10 Dec 2099")).toHaveAttribute("datetime", "2099-12-10");
    const table = screen.getByRole("table", { name: "Flight schedules" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(within(table).getByText("2")).toBeInTheDocument();
    expect(within(table).getByText("Outbound · 1 stop · 8h")).toBeInTheDocument();
    expect(within(table).getByText("Connection at NQZ · 1h 30m")).toBeInTheDocument();
    expect(within(table).getByText("Checked baggage · 20 kg")).toBeInTheDocument();
    expect(within(table).queryByText("Cabin baggage · 8 kg")).not.toBeInTheDocument();
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
  it("puts schedules before compact histograms and keeps all 51 offers represented", () => {
    render(<AnalyticsResults search={analyticsSnapshot51()} />);
    expect(screen.getByText("51 offers", { selector: "dd" })).toBeInTheDocument();
    const schedules = screen.getByText("Offer comparison");
    const histogram = screen.getByText("Price distribution");
    expect(
      schedules.compareDocumentPosition(histogram) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const chart = screen.getByRole("img", { name: /Price distribution in KZT: 51 offers/ });
    expect(chart.querySelectorAll("rect")).toHaveLength(6);
    expect(
      within(screen.getByRole("table", { name: "Flight schedules" })).getAllByRole("row"),
    ).toHaveLength(4);
  });

  it("retains original currencies and avoids comparing mixed-currency carrier minima", () => {
    const search = analyticsSnapshot();
    search.offers[1]!.price = { amount: 500, currency: "USD" };
    render(<AnalyticsResults search={search} />);
    expect(screen.queryByText("Lowest price")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Cheapest/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fastest" })).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Price distribution in KZT: 2 offers/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Price distribution in USD: 1 offers/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("From 500 USD")).toBeInTheDocument();
    expect(screen.getByText(`From ${(180000).toLocaleString()} KZT`)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Flight schedules" });
    expect(within(table).getByText("500 USD", { selector: "li" })).toBeInTheDocument();
    expect(
      within(table).getByText(`${(180000).toLocaleString()} KZT`, { selector: "li" }),
    ).toBeInTheDocument();
  });
});
