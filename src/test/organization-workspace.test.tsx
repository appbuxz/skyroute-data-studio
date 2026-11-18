vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
import { StrictMode, useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightOffer, FlightSearchResult, OrganizationId } from "@/lib/flights/types";
import type { OrganizationMembership } from "@/lib/organizations/session.functions";

const mocks = vi.hoisted(() => ({
  memberships: vi.fn(),
  search: vi.fn(),
  confirmPrice: vi.fn(),
  onAuthStateChange: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/organizations/session.functions", () => ({
  getOrganizationMemberships: mocks.memberships,
}));
vi.mock("@/lib/flights/search.functions", () => ({ searchFlightsServer: mocks.search }));
vi.mock("@/lib/flights/test-booking-status.functions", () => ({
  getTestBookingStatusServer: vi.fn(),
}));
vi.mock("@/lib/flights/flight-price.functions", () => ({
  confirmFlightPriceServer: mocks.confirmPrice,
  createFlightTestBookingServer: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange: mocks.onAuthStateChange } },
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

import { OrganizationWorkspaceProvider } from "@/lib/organizations/workspace-provider";
import { useOrganizationWorkspace } from "@/lib/organizations/workspace-context";
import { searchInputsKey, searchSnapshotKey } from "@/lib/flights/search-session";
import { OrganizationSelector } from "@/components/layout/organization-selector";
import { Route as SearchRoute } from "@/routes/_authenticated/_workspace.search";
import { analyticsSnapshot51 } from "./fixtures/agency-analysis";
import { Route as DashboardRoute } from "@/routes/_authenticated/_workspace.dashboard";
import { Route as AnalysisRoute } from "@/routes/_authenticated/_workspace.analysis";

const USER = "f1000000-0000-4000-8000-000000000001";
const A = "f2000000-0000-4000-8000-000000000001" as OrganizationId;
const B = "f2000000-0000-4000-8000-000000000002" as OrganizationId;
const agencies: OrganizationMembership[] = [
  { organizationId: A, organizationName: "Agency A", role: "owner" },
  { organizationId: B, organizationName: "Agency B", role: "member" },
];
const SearchPage = SearchRoute.options.component!;
const DashboardPage = DashboardRoute.options.component!;
const AnalysisPage = AnalysisRoute.options.component!;
const LEGACY_KEY = "flight-analytics:search:v1";

function result(carrier = "A Airways"): FlightSearchResult {
  const offer: FlightOffer = {
    id: carrier,
    carrier,
    flightNumber: "KC100",
    origin: "ALA",
    destination: "IST",
    departureAt: "2099-12-10T10:00:00+05:00",
    arrivalAt: "2099-12-10T14:00:00+03:00",
    stops: 0,
    cabinClass: "economy",
    price: { amount: 100000, currency: "KZT" },
  };
  return { status: "ok", offers: [offer], fetchedAt: "2026-11-10T10:00:00Z" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function Workspace({
  initialPage = "search",
  userId = USER,
}: {
  initialPage?: "search" | "analysis" | "dashboard";
  userId?: string;
}) {
  const [page, setPage] = useState(initialPage);
  return (
    <OrganizationWorkspaceProvider key={userId} userId={userId}>
      <OrganizationSelector />
      <SelectionState />
      <button onClick={() => setPage("search")}>Search tab</button>
      <button onClick={() => setPage("analysis")}>Analysis tab</button>
      <button onClick={() => setPage("dashboard")}>Dashboard tab</button>
      {page === "search" ? (
        <SearchPage />
      ) : page === "analysis" ? (
        <AnalysisPage />
      ) : (
        <DashboardPage />
      )}
    </OrganizationWorkspaceProvider>
  );
}

function SelectionState() {
  const { selectedOrganizationId } = useOrganizationWorkspace();
  return (
    <output aria-label="Selected organization state">{selectedOrganizationId ?? "none"}</output>
  );
}

function select(id: string) {
  fireEvent.change(screen.getByLabelText("Organization"), { target: { value: id } });
}

function submitSearch() {
  fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "ALA" } });
  fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "IST" } });
  fireEvent.change(screen.getByLabelText("Departure date"), { target: { value: "2099-12-10" } });
  fireEvent.click(screen.getByRole("button", { name: "Search flights" }));
}

async function ready() {
  await waitFor(() => expect(screen.getByLabelText("Organization")).not.toBeDisabled());
}

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  mocks.memberships.mockResolvedValue(agencies);
  mocks.search.mockResolvedValue(result());
  mocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mocks.unsubscribe } },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("organization workspace", () => {
  it.each([
    [
      {
        checked: { status: "included", pieces: 1, weight: { value: 23, unit: "kg" } },
        cabin: { status: "included", weight: { value: 8, unit: "kg" } },
      },
      "1 pc · 23 kg",
      "8 kg",
    ],
    [{ checked: { status: "not_included" } }, "Not included", "No data"],
  ])(
    "displays checked and cabin baggage from the confirmed price result",
    async (baggage, checked, cabin) => {
      const response = result();
      if (response.status !== "ok") throw new Error("Expected test offers");
      response.offers[0]!.checkoutToken = "checkout-token";
      mocks.search.mockResolvedValue(response);
      mocks.memberships.mockResolvedValue([agencies[0]]);
      mocks.confirmPrice.mockResolvedValue({
        status: "confirmed",
        price: { amount: 250, currency: "USD" },
        baggage,
      });

      render(<Workspace />);
      await ready();
      submitSearch();
      fireEvent.click(await screen.findByRole("button", { name: "Select flight" }));

      const heading = await screen.findByRole("heading", { name: "Baggage allowances" });
      const section = within(heading.closest("section")!);
      expect(section.getByText("Checked baggage").nextElementSibling).toHaveTextContent(checked);
      expect(section.getByText("Cabin baggage").nextElementSibling).toHaveTextContent(cabin);
    },
  );

  it("shows unknown exchange and refund terms above the passenger form when AirPrice omits rules", async () => {
    const response = result();
    if (response.status !== "ok") throw new Error("Expected test offers");
    response.offers[0]!.checkoutToken = "checkout-token";
    mocks.search.mockResolvedValue(response);
    mocks.memberships.mockResolvedValue([agencies[0]]);
    mocks.confirmPrice.mockResolvedValue({
      status: "confirmed",
      price: { amount: 250, currency: "USD" },
      bookingToken: "booking-token",
    });

    render(<Workspace />);
    await ready();
    submitSearch();
    fireEvent.click(await screen.findByRole("button", { name: "Select flight" }));

    const heading = await screen.findByRole("heading", { name: "Exchange and refund" });
    expect(screen.getAllByText("No data")).toHaveLength(4);
    const passenger = screen.getByLabelText("Test given name");
    expect(
      heading.compareDocumentPosition(passenger) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByText("No penalty")).not.toBeInTheDocument();
  });

  it("opens the selected offer, displays the AirPrice currency and refreshes an expired search", async () => {
    const response = result();
    if (response.status !== "ok") throw new Error("Expected test offers");
    const checkoutToken = "f3000000-0000-4000-8000-000000000001";
    response.offers[0]!.checkoutToken = checkoutToken;
    mocks.search.mockResolvedValue(response);
    mocks.memberships.mockResolvedValue([agencies[0]]);
    mocks.confirmPrice
      .mockResolvedValueOnce({ status: "changed", price: { amount: 250, currency: "USD" } })
      .mockResolvedValueOnce({ status: "expired" });
    render(<Workspace />);
    await ready();
    submitSearch();

    const selectFlight = await screen.findByRole("button", { name: "Select flight" });
    fireEvent.click(selectFlight);
    expect(await screen.findByText("The price changed since the search.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "ALA → IST" })).toHaveTextContent("250 USD");
    expect(screen.getByText("Test price check · Travelport pre-production")).toBeInTheDocument();
    expect(mocks.confirmPrice).toHaveBeenCalledExactlyOnceWith({
      data: { checkoutToken, organizationId: A },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "LHR" } });
    fireEvent.click(selectFlight);
    fireEvent.click(await screen.findByRole("button", { name: "Refresh search" }));
    await waitFor(() => expect(mocks.search).toHaveBeenCalledTimes(2));
    expect(mocks.search.mock.calls[1]).toEqual(mocks.search.mock.calls[0]);
    expect(screen.getByLabelText("Destination")).toHaveValue("IST");
  });

  it("renders complete connecting itineraries in search results without changing the fare", async () => {
    const response = result();
    if (response.status !== "ok") throw new Error("Expected test offers");
    const offer = response.offers[0]!;
    offer.stops = 1;
    offer.outbound = {
      durationMinutes: 360,
      segments: [
        {
          carrier: "KC",
          flightNumber: "100",
          origin: "ALA",
          destination: "NQZ",
          departureAt: "2099-12-10T10:00:00+05:00",
          arrivalAt: "2099-12-10T11:30:00+05:00",
        },
        {
          carrier: "TK",
          flightNumber: "200",
          origin: "NQZ",
          destination: "IST",
          departureAt: "2099-12-10T12:00:00+05:00",
          arrivalAt: "2099-12-10T14:00:00+03:00",
        },
      ],
    };
    mocks.memberships.mockResolvedValue([agencies[0]]);
    mocks.search.mockResolvedValue(response);
    render(<Workspace />);
    await ready();
    submitSearch();
    await screen.findByRole("region", { name: "Outbound itinerary" });
    expect(screen.getByText("1. ALA → NQZ")).toBeInTheDocument();
    expect(screen.getByText("2. NQZ → IST")).toBeInTheDocument();
    expect(screen.getByText("KC · 100")).toBeInTheDocument();
    expect(screen.getByText("TK · 200")).toBeInTheDocument();
    expect(screen.getByText("Connection at NQZ")).toBeInTheDocument();
    expect(screen.getByText("Total journey duration: 6h")).toBeInTheDocument();
    expect(
      screen.getAllByText(`${offer.price.amount.toLocaleString()} KZT`).length,
    ).toBeGreaterThan(0);
    expect(mocks.search).toHaveBeenCalledOnce();
  });

  it("disables search during membership loading", async () => {
    const loading = deferred<OrganizationMembership[]>();
    mocks.memberships.mockReturnValue(loading.promise);
    render(<Workspace />);
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
    expect(screen.getAllByText("Loading organizations…").length).toBeGreaterThan(0);
    expect(mocks.search).not.toHaveBeenCalled();
    await act(async () => loading.resolve([]));
  });

  it("allows a traveler without an organization to search without publishing agency analysis", async () => {
    mocks.memberships.mockResolvedValue([]);
    const first = render(<Workspace />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled(),
    );
    expect(screen.getByLabelText("Organization")).toBeDisabled();
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith({
      data: {
        origin: "ALA",
        destination: "IST",
        departureDate: "2099-12-10",
        returnDate: undefined,
        passengers: 1,
        cabinClass: "economy",
      },
    });
    expect(window.sessionStorage.getItem(searchInputsKey(USER, A))).toBeNull();
    fireEvent.click(screen.getByText("Analysis tab"));
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(searchSnapshotKey(USER, A))).toBeNull();
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
    expect(
      await screen.findByText("Analytics isn’t available for your account"),
    ).toBeInTheDocument();
    first.unmount();
    render(<Workspace />);
    await waitFor(() => expect(screen.getByLabelText("Origin")).toHaveValue("ALA"));
    expect(mocks.search).toHaveBeenCalledOnce();
    expect(screen.getByText(/A Airways · KC100/)).toBeInTheDocument();
    mocks.memberships.mockResolvedValue([agencies[0]]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh organizations" }));
    await ready();
    expect(screen.getByLabelText("Organization")).toHaveValue(A);
    expect(screen.getByLabelText("Origin")).toHaveValue("");
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
  });

  it("discards pending personal results when an agency becomes selected", async () => {
    const pending = deferred<FlightSearchResult>();
    mocks.memberships.mockResolvedValue([]);
    mocks.search.mockReturnValueOnce(pending.promise);
    render(<Workspace />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled(),
    );
    submitSearch();
    mocks.memberships.mockResolvedValue([agencies[0]]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh organizations" }));
    await ready();
    await act(async () => pending.resolve(result("PERSONAL Airways")));
    expect(screen.queryByText(/PERSONAL Airways/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Analysis tab"));
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
  });

  it("clears personal results when the authenticated account changes", async () => {
    mocks.memberships.mockResolvedValue([]);
    render(<Workspace />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled(),
    );
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    const listener = mocks.onAuthStateChange.mock.calls[0]![0];
    act(() => listener("SIGNED_OUT", null));
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
  });

  it("automatically selects one organization and sends it to search", async () => {
    mocks.memberships.mockResolvedValue([agencies[0]]);
    render(<Workspace />);
    await ready();
    expect(screen.getByLabelText("Organization")).toHaveValue(A);
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith({
      data: {
        origin: "ALA",
        destination: "IST",
        departureDate: "2099-12-10",
        returnDate: undefined,
        passengers: 1,
        cabinClass: "economy",
        organizationId: A,
      },
    });
  });

  it("requires explicit selection with multiple memberships", async () => {
    render(<Workspace />);
    await ready();
    expect(screen.getByLabelText("Organization")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
    select(B);
    expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled();
    submitSearch();
    await waitFor(() => expect(mocks.search).toHaveBeenCalled());
    expect(mocks.search.mock.calls[0]?.[0].data.organizationId).toBe(B);
  });

  it("preserves form validation after selecting an organization", async () => {
    render(<Workspace />);
    await ready();
    select(A);
    fireEvent.click(screen.getByRole("button", { name: "Search flights" }));
    expect(mocks.search).not.toHaveBeenCalled();
    expect(screen.getAllByText("Enter a 3-letter airport code")).toHaveLength(2);
  });

  it("only shows results for the currently selected agency", async () => {
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    fireEvent.click(screen.getByText("Analysis tab"));
    expect(await screen.findByText("Carrier comparison")).toBeInTheDocument();
    select(B);
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
    select(A);
    expect(await screen.findByText("Carrier comparison")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Search tab"));
    expect(screen.getByText(/A Airways · KC100/)).toBeInTheDocument();
  });

  it("immediately clears visible offers on a search-page organization switch", async () => {
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    select(B);
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Origin")).toHaveValue("");
  });

  it("ignores an old response without clearing a newer pending search", async () => {
    const old = deferred<FlightSearchResult>();
    const current = deferred<FlightSearchResult>();
    mocks.search.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    select(B);
    submitSearch();
    await act(async () => old.resolve(result("STALE Airways")));
    expect(screen.queryByText(/STALE Airways/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    await act(async () => current.resolve(result("B Airways")));
    expect(screen.getByText(/B Airways · KC100/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Analysis tab"));
    expect(screen.queryByText(/STALE Airways/)).not.toBeInTheDocument();
    expect(await screen.findByText("Carrier comparison")).toBeInTheDocument();
  });

  it("resets pending on switching even if the old request never settles, without unlocking a newer request", async () => {
    const old = deferred<FlightSearchResult>();
    const current = deferred<FlightSearchResult>();
    mocks.search.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();

    select(B);
    // Do not settle A: changing scope alone must release its pending UI.
    expect(screen.queryByRole("button", { name: "Checking…" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled();
    submitSearch();
    expect(mocks.search).toHaveBeenCalledTimes(2);

    // An old rejection runs finally too, but cannot unlock the newer request.
    await act(async () => old.reject(new Error("Old request failed")));
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    await act(async () => current.resolve(result("B Airways")));
    expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled();
    expect(screen.getByText(/B Airways · KC100/)).toBeInTheDocument();
  });

  it("rejects old results even after switching away and back to the same organization", async () => {
    const pending = deferred<FlightSearchResult>();
    mocks.search.mockReturnValue(pending.promise);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    select(B);
    select(A);
    await act(async () => pending.resolve(result("STALE Airways")));
    expect(screen.queryByText(/STALE Airways/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Analysis tab"));
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
  });

  it("ignores an old rejection after switching organizations", async () => {
    const pending = deferred<FlightSearchResult>();
    mocks.search.mockReturnValue(pending.promise);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    select(B);
    await act(async () => pending.reject({ statusCode: 403 }));
    expect(screen.getByLabelText("Organization")).toHaveValue(B);
    expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled();
    expect(screen.queryByText(/no longer have access/)).not.toBeInTheDocument();
  });

  it("does not publish results after the search page unmounts", async () => {
    const pending = deferred<FlightSearchResult>();
    mocks.search.mockReturnValue(pending.promise);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    fireEvent.click(screen.getByText("Analysis tab"));
    await act(async () => pending.resolve(result("STALE Airways")));
    expect(screen.queryByText(/STALE Airways/)).not.toBeInTheDocument();
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
  });

  it("blocks a denied selection, clears prior analysis, and never falls back", async () => {
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    mocks.search.mockRejectedValue({ code: "ORGANIZATION_ACCESS_DENIED", statusCode: 403 });
    submitSearch();
    await screen.findAllByText(/You no longer have access/);
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Organization")).toHaveValue(A);
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
    expect(mocks.search).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText("Analysis tab"));
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(searchSnapshotKey(USER, A))).toBeNull();
  });

  it("does not automatically substitute the only remaining organization after revocation", async () => {
    render(<Workspace />);
    await ready();
    select(A);
    mocks.memberships.mockResolvedValue([agencies[1]]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh organizations" }));
    await ready();
    expect(screen.getByLabelText("Organization")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
    select(B);
    expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled();
  });

  it("shows sanitized listing failures and permits explicit retry", async () => {
    mocks.memberships.mockRejectedValueOnce(new Error("private database details"));
    render(<Workspace />);
    await screen.findAllByText("Unable to load organizations. Please try again.");
    expect(screen.queryByText(/private database details/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh organizations" }));
    await ready();
    expect(screen.getByLabelText("Organization")).toHaveValue("");
  });

  it.each(["automatic", "explicit"])(
    "clears an %s selection on reload failure and requires selection after retry",
    async (selection) => {
      mocks.memberships.mockResolvedValue(selection === "automatic" ? [agencies[0]] : agencies);
      render(<Workspace />);
      await ready();
      if (selection === "explicit") select(A);
      expect(screen.getByLabelText("Selected organization state")).toHaveTextContent(A);
      submitSearch();
      await screen.findByText(/A Airways · KC100/);

      mocks.memberships.mockRejectedValueOnce(new Error("Membership reload failed"));
      fireEvent.click(screen.getByRole("button", { name: "Refresh organizations" }));
      await screen.findAllByText("Unable to load organizations. Please try again.");
      // Check React context itself: a select with no options can look empty even
      // when its controlled selection state incorrectly retains an old ID.
      expect(screen.getByLabelText("Selected organization state")).toHaveTextContent("none");
      expect(screen.getByLabelText("Organization")).toHaveValue("");
      expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
      expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();

      mocks.memberships.mockResolvedValue([agencies[1]]);
      fireEvent.click(screen.getByRole("button", { name: "Refresh organizations" }));
      await ready();
      expect(screen.getByLabelText("Selected organization state")).toHaveTextContent("none");
      expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
      select(B);
      expect(screen.getByLabelText("Selected organization state")).toHaveTextContent(B);
      expect(screen.getByRole("button", { name: "Search flights" })).toBeEnabled();
    },
  );

  it.each([
    [{ statusCode: 401 }, /Your session has expired/],
    [{ message: "Organization selection required" }, /Select an organization before searching/],
    [{ statusCode: 503 }, /Unable to verify organization access/],
  ])("shows clear authorization errors %j", async (error, message) => {
    mocks.search.mockRejectedValue(error);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    await screen.findAllByText(message as RegExp);
    expect(screen.queryByText("Flight offers (1)")).not.toBeInTheDocument();
  });

  it("never loads legacy snapshots, including snapshots added after mount", async () => {
    window.sessionStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ userId: USER, offers: (result() as { offers: FlightOffer[] }).offers }),
    );
    render(<Workspace initialPage="analysis" />);
    await ready();
    expect(window.sessionStorage.getItem(LEGACY_KEY)).toBeNull();
    select(A);
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
    window.sessionStorage.setItem(
      LEGACY_KEY,
      JSON.stringify({ userId: USER, offers: [{ carrier: "LEGACY Airways" }] }),
    );
    select(B);
    expect(screen.queryByText(/LEGACY Airways/)).not.toBeInTheDocument();
    expect(screen.queryByText("Carrier comparison")).not.toBeInTheDocument();
  });

  it("restores only successful searches after remount and isolates them by agency and account", async () => {
    const first = render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    expect(JSON.parse(window.sessionStorage.getItem(searchInputsKey(USER, A))!)).toEqual({
      origin: "ALA",
      destination: "IST",
      departureDate: "2099-12-10",
      passengers: 1,
      cabinClass: "economy",
    });

    const failureMessage = "Flight search is temporarily unavailable.";
    mocks.search.mockResolvedValueOnce({ status: "error", message: failureMessage });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "NQZ" } });
    fireEvent.click(screen.getByRole("button", { name: "Search flights" }));
    await screen.findByText(failureMessage);

    first.unmount();
    const second = render(<Workspace />);
    await ready();
    expect(screen.getByLabelText("Organization")).toHaveValue(A);
    expect(screen.getByLabelText("Origin")).toHaveValue("ALA");
    expect(screen.getByLabelText("Destination")).toHaveValue("IST");
    expect(screen.getByLabelText("Departure date")).toHaveValue("10/12/2099");
    expect(screen.getByLabelText("Passengers")).toHaveValue(1);
    expect(screen.getByLabelText("Cabin class")).toHaveTextContent("Economy");
    expect(screen.getByText(/A Airways · KC100/)).toBeInTheDocument();
    select(B);
    expect(screen.getByLabelText("Origin")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "NQZ" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "LHR" } });
    fireEvent.change(screen.getByLabelText("Departure date"), { target: { value: "2099-12-11" } });
    fireEvent.change(screen.getByLabelText("Return date (optional)"), {
      target: { value: "2099-12-18" },
    });
    fireEvent.change(screen.getByLabelText("Passengers"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Search flights" }));
    await screen.findByText(/A Airways · KC100/);
    select(A);
    expect(screen.getByLabelText("Origin")).toHaveValue("ALA");
    expect(screen.getByLabelText("Return date (optional)")).toHaveValue("");
    select(B);
    expect(screen.getByLabelText("Origin")).toHaveValue("NQZ");
    expect(screen.getByLabelText("Return date (optional)")).toHaveValue("18/12/2099");
    expect(screen.getByLabelText("Passengers")).toHaveValue(3);
    second.rerender(<Workspace userId="another-user" />);
    await ready();
    select(A);
    expect(screen.getByLabelText("Origin")).toHaveValue("");
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
    expect(mocks.search).toHaveBeenCalledTimes(3);
  });

  it("keeps saved inputs editable when a stored offer is corrupted", async () => {
    mocks.memberships.mockResolvedValue([agencies[0]]);
    const first = render(<Workspace />);
    await ready();
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    first.unmount();
    const key = searchSnapshotKey(USER, A);
    const saved = JSON.parse(window.sessionStorage.getItem(key)!);
    saved.offers[0].price = null;
    window.sessionStorage.setItem(key, JSON.stringify(saved));

    render(<Workspace />);
    await ready();
    expect(screen.getByLabelText("Origin")).toHaveValue("ALA");
    expect(screen.queryByText(/A Airways/)).not.toBeInTheDocument();
    expect(mocks.search).toHaveBeenCalledOnce();
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
    expect(JSON.parse(window.sessionStorage.getItem(key)!).offers[0].price.currency).toBe("KZT");
  });

  it("links from the displayed search snapshot before and after reload", async () => {
    vi.setSystemTime(new Date("2026-11-18T08:00:00Z"));
    mocks.memberships.mockResolvedValue([agencies[0]]);
    const first = render(<Workspace />);
    await ready();
    const label = "Search on Aviasales";
    expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Origin"), { target: { value: "ALA" } });
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "IST" } });
    fireEvent.change(screen.getByLabelText("Departure date"), { target: { value: "2026-12-12" } });
    fireEvent.change(screen.getByLabelText("Passengers"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Search flights" }));

    const oneWay = "https://www.aviasales.kz/search/ALA1212IST2";
    expect(await screen.findByRole("link", { name: label })).toHaveAttribute("href", oneWay);
    fireEvent.change(screen.getByLabelText("Return date (optional)"), {
      target: { value: "2026-12-19" },
    });
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", oneWay);
    expect(mocks.search).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Search flights" }));
    const roundTrip = "https://www.aviasales.kz/search/ALA1212IST19122";
    expect(await screen.findByRole("link", { name: label })).toHaveAttribute("href", roundTrip);

    first.unmount();
    render(<Workspace />);
    expect(await screen.findByRole("link", { name: label })).toHaveAttribute("href", roundTrip);
    expect(mocks.search).toHaveBeenCalledTimes(2);
  });

  it.each([
    "{",
    JSON.stringify({
      origin: "ALA",
      destination: "IST",
      departureDate: "2000-01-01",
      passengers: 1,
      cabinClass: "economy",
    }),
  ])("opens an editable default form when saved inputs are invalid or expired", async (stored) => {
    window.sessionStorage.setItem(searchInputsKey(USER, A), stored);
    mocks.memberships.mockResolvedValue([agencies[0]]);
    render(<Workspace />);
    await ready();
    expect(screen.getByLabelText("Origin")).toHaveValue("");
    expect(screen.getByLabelText("Departure date")).toHaveValue("");
    expect(mocks.search).not.toHaveBeenCalled();
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
  });

  it("invalidates outstanding results when the authenticated account changes", async () => {
    const pending = deferred<FlightSearchResult>();
    mocks.search.mockReturnValue(pending.promise);
    render(<Workspace />);
    await ready();
    select(A);
    submitSearch();
    const listener = mocks.onAuthStateChange.mock.calls[0]?.[0] as (
      event: string,
      session: { user: { id: string } } | null,
    ) => void;
    act(() => listener("SIGNED_IN", { user: { id: "different-user" } }));
    await act(async () => pending.resolve(result("STALE Airways")));
    expect(screen.queryByText(/STALE Airways/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search flights" })).toBeDisabled();
    expect(screen.getAllByText("Your session has changed. Sign in again.").length).toBeGreaterThan(
      0,
    );
  });

  it("works with React StrictMode effect cleanup and replay", async () => {
    mocks.memberships.mockResolvedValue([agencies[0]]);
    render(
      <StrictMode>
        <Workspace />
      </StrictMode>,
    );
    await ready();
    expect(screen.getByLabelText("Organization")).toHaveValue(A);
    submitSearch();
    await screen.findByText(/A Airways · KC100/);
  });
});

it("restores the same agency snapshot across search, dashboard and analytics after membership verification", async () => {
  const snapshot = analyticsSnapshot51();
  snapshot.offers.forEach((offer, i) => {
    if (i % 3 === 1) offer.price = { amount: 500.25 + Math.floor(i / 3) * 5, currency: "GBP" };
  });
  mocks.search.mockResolvedValueOnce({
    status: "ok",
    offers: snapshot.offers,
    fetchedAt: snapshot.fetchedAt,
  });
  const first = render(<Workspace />);
  await ready();
  select(A);
  submitSearch();
  await screen.findByText("Flight offers (51)");
  expect(screen.getAllByText("500.25 GBP").length).toBeGreaterThan(0);
  const originalTime = screen.getByText(/^Retrieved:/).textContent;
  first.unmount();

  const membershipCheck = deferred<OrganizationMembership[]>();
  mocks.memberships.mockReturnValueOnce(membershipCheck.promise);
  const second = render(<Workspace />);
  expect(screen.queryByText("Flight offers (51)")).not.toBeInTheDocument();
  await act(async () => membershipCheck.resolve(agencies));
  await screen.findByText("Flight offers (51)");
  expect(screen.getByText(/^Retrieved:/)).toHaveTextContent(originalTime!);
  expect(screen.getAllByText("500.25 GBP").length).toBeGreaterThan(0);
  expect(screen.getAllByText("180,000 KZT").length).toBeGreaterThan(0);
  expect(mocks.search).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText("Dashboard tab"));
  await screen.findByRole("link", { name: "Open analytics" });
  expect(screen.getByText("180,000 KZT")).toBeInTheDocument();
  expect(screen.getByText("500.25 GBP")).toBeInTheDocument();
  expect(screen.getByText(/UTC\+00:00/, { selector: "time" })).toHaveAttribute(
    "datetime",
    snapshot.fetchedAt,
  );
  fireEvent.click(screen.getByText("Analysis tab"));
  await screen.findByText("Carrier comparison");
  expect(screen.getByText("51 offers", { selector: "dd" })).toBeInTheDocument();
  expect(screen.getByText("From 500.25 GBP")).toBeInTheDocument();
  expect(screen.getByText(/UTC\+00:00/, { selector: "time" })).toHaveAttribute(
    "datetime",
    snapshot.fetchedAt,
  );
  fireEvent.click(screen.getByText("Dashboard tab"));
  await screen.findByRole("link", { name: "Open analytics" });
  select(B);
  expect(screen.queryByText("180,000 KZT")).not.toBeInTheDocument();
  await screen.findByText("No search results in this session");
  fireEvent.click(screen.getByText("Search tab"));
  mocks.search.mockResolvedValueOnce({ status: "ok", offers: [], fetchedAt: snapshot.fetchedAt });
  submitSearch();
  await screen.findByText("No flights found for the selected route and date.");
  fireEvent.click(screen.getByText("Dashboard tab"));
  await screen.findByText("The latest search returned no offers");
  expect(screen.queryByRole("link", { name: "Open analytics" })).not.toBeInTheDocument();
  select(A);
  expect(await screen.findByText("180,000 KZT")).toBeInTheDocument();

  fireEvent.click(screen.getByText("Search tab"));
  mocks.search.mockResolvedValueOnce({ status: "ok", offers: [], fetchedAt: snapshot.fetchedAt });
  submitSearch();
  await screen.findByText("No flights found for the selected route and date.");
  second.unmount();
  render(<Workspace initialPage="dashboard" />);
  await screen.findByText("The latest search returned no offers");
  expect(screen.queryByText("180,000 KZT")).not.toBeInTheDocument();
  expect(mocks.search).toHaveBeenCalledTimes(3);
});
