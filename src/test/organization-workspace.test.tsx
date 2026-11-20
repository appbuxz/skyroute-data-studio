vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
import { StrictMode, useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  FlightOffer,
  FlightPriceConfirmation,
  FlightSearchResult,
  OrganizationId,
} from "@/lib/flights/types";
import type { OrganizationMembership } from "@/lib/organizations/session.functions";

const mocks = vi.hoisted(() => ({
  memberships: vi.fn(),
  search: vi.fn(),
  confirmPrice: vi.fn(),
  acceptPrice: vi.fn(),
  createBooking: vi.fn(),
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
  acceptFlightPriceServer: mocks.acceptPrice,
  createFlightTestBookingServer: mocks.createBooking,
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
  window.localStorage.clear();
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

  it("keeps every selected segment and the next-day arrival above the price when AirPrice updates", async () => {
    const response = result();
    if (response.status !== "ok") throw new Error("Expected test offers");
    const offer = response.offers[0]!;
    offer.checkoutToken = "connection-token";
    offer.stops = 1;
    offer.departureAt = "2099-12-10T20:40:00+05:00";
    offer.arrivalAt = "2099-12-11T00:35:00+03:00";
    offer.outbound = {
      segments: [
        {
          carrier: "KC",
          flightNumber: "641",
          origin: "ALA",
          destination: "NQZ",
          departureAt: offer.departureAt,
          arrivalAt: "2099-12-10T22:15:00+05:00",
        },
        {
          carrier: "KC",
          flightNumber: "917",
          origin: "NQZ",
          destination: "IST",
          departureAt: "2099-12-10T23:50:00+05:00",
          arrivalAt: offer.arrivalAt,
        },
      ],
    };
    const airPrice = deferred<FlightPriceConfirmation>();
    mocks.search.mockResolvedValue(response);
    mocks.memberships.mockResolvedValue([agencies[0]]);
    mocks.confirmPrice.mockReturnValue(airPrice.promise);

    render(<Workspace />);
    await ready();
    submitSearch();
    fireEvent.click(await screen.findByRole("button", { name: "Select flight" }));

    const dialog = within(screen.getByRole("dialog", { name: "ALA → IST" }));
    function checkSegments() {
      const list = dialog.getByRole("list", { name: "Outbound itinerary segments" });
      const [first, second] = within(list).getAllByRole("listitem");
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
      expect(first).toHaveTextContent("ALA → NQZ");
      expect(first).toHaveTextContent("KC · 641");
      expect(first).toHaveTextContent("10 Dec 2099 · 20:40 (UTC+05:00)");
      expect(first).toHaveTextContent("10 Dec 2099 · 22:15 (UTC+05:00)");
      expect(second).toHaveTextContent("NQZ → IST");
      expect(second).toHaveTextContent("KC · 917");
      expect(second).toHaveTextContent("10 Dec 2099 · 23:50 (UTC+05:00)");
      expect(second).toHaveTextContent("11 Dec 2099 · 00:35 (UTC+03:00)");
      expect(
        list.compareDocumentPosition(dialog.getByText(/^(Search|Previous) price$/)) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }

    checkSegments();
    await act(async () => {
      airPrice.resolve({
        status: "changed",
        previousPrice: offer.price,
        price: { amount: 123456, currency: "KZT" },
        acceptanceToken: "updated-quote",
      });
    });
    expect(dialog.getByText("123,456 KZT")).toBeVisible();
    checkSegments();
    expect(mocks.search).toHaveBeenCalledOnce();
    expect(mocks.confirmPrice).toHaveBeenCalledOnce();
  });

  it("reviews and edits passenger details without booking and submits only once on final confirmation", async () => {
    const response = result();
    if (response.status !== "ok") throw new Error("Expected test offers");
    const offer = response.offers[0]!;
    offer.checkoutToken = "checkout-token";
    mocks.search.mockResolvedValue(response);
    mocks.memberships.mockResolvedValue([agencies[0]]);
    mocks.confirmPrice.mockResolvedValue({
      status: "confirmed",
      price: offer.price,
      bookingToken: "accepted",
      bookingClass: "E",
    });
    const booking = deferred<{ status: "booked"; pnr: string }>();
    mocks.createBooking.mockReturnValue(booking.promise);

    render(<Workspace />);
    await ready();
    submitSearch();
    fireEvent.click(await screen.findByRole("button", { name: "Select flight" }));

    fireEvent.change(await screen.findByLabelText("Test given name"), {
      target: { value: "TEST" },
    });
    fireEvent.change(screen.getByLabelText("Test surname"), { target: { value: "SKYROUTE" } });
    expect(screen.queryByRole("button", { name: "Create test booking" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review details" }));
    const heading = screen.getByRole("heading", { name: "Review your details" });
    const review = within(heading.parentElement!);
    expect(review.getByText("TEST SKYROUTE")).toBeVisible();
    expect(review.getByText("A Airways · KC100 · ALA → IST")).toBeVisible();
    expect(review.getByText("10 Dec 2099 · 10:00 (UTC+05:00)")).toBeVisible();
    expect(review.getByText("100,000 KZT")).toBeVisible();
    expect(review.getByText("No payment or ticket issuance")).toBeVisible();
    expect(mocks.createBooking).not.toHaveBeenCalled();

    fireEvent.click(review.getByRole("button", { name: "Edit details" }));
    expect(screen.getByLabelText("Test given name")).toHaveValue("TEST");
    expect(screen.getByLabelText("Test surname")).toHaveValue("SKYROUTE");
    expect(mocks.createBooking).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Test given name"), { target: { value: "DEMO" } });
    fireEvent.click(screen.getByRole("button", { name: "Review details" }));
    expect(screen.getByText("DEMO SKYROUTE")).toBeVisible();
    expect(mocks.createBooking).not.toHaveBeenCalled();

    const confirm = screen.getByRole("button", { name: "Create test booking" });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(mocks.createBooking).toHaveBeenCalledExactlyOnceWith({
      data: {
        bookingToken: "accepted",
        organizationId: agencies[0]!.organizationId,
        passenger: { given: "DEMO", surname: "SKYROUTE" },
      },
    });
    await act(async () => {
      booking.resolve({ status: "booked", pnr: "ABC123" });
    });
    expect(screen.getByText("ABC123")).toBeVisible();
  });

  it("gates the passenger form on explicit acceptance and asks again if the accepted price changes", async () => {
    const response = result();
    if (response.status !== "ok") throw new Error("Expected test offers");
    response.offers[0]!.checkoutToken = "checkout-token";
    mocks.search.mockResolvedValue(response);
    mocks.memberships.mockResolvedValue([agencies[0]]);
    const previousPrice = response.offers[0]!.price;
    const price = { ...previousPrice, amount: 123456 };
    mocks.confirmPrice.mockResolvedValue({
      status: "changed",
      previousPrice,
      price,
      acceptanceToken: "quote",
    });
    mocks.acceptPrice
      .mockResolvedValueOnce({
        status: "confirmed",
        price,
        bookingToken: "accepted",
        bookingClass: "E",
      })
      .mockResolvedValueOnce({
        status: "confirmed",
        price: { ...price, amount: 234567 },
        bookingToken: "accepted-next",
        bookingClass: "E",
      });
    mocks.createBooking.mockResolvedValue({
      status: "price_review",
      confirmation: {
        status: "changed",
        previousPrice: price,
        price: { ...price, amount: 234567 },
        acceptanceToken: "next-quote",
      },
    });

    render(<Workspace />);
    await ready();
    submitSearch();
    fireEvent.click(await screen.findByRole("button", { name: "Select flight" }));
    const accept = await screen.findByRole("button", { name: "Accept new price" });
    expect(screen.getByText("Previous price")).toBeVisible();
    expect(screen.getByText("New price")).toBeVisible();
    expect(screen.queryByLabelText("Test given name")).not.toBeInTheDocument();
    expect(mocks.createBooking).not.toHaveBeenCalled();
    fireEvent.click(accept);
    const given = await screen.findByLabelText("Test given name");
    expect(mocks.acceptPrice).toHaveBeenCalledWith({
      data: {
        acceptanceToken: "quote",
        organizationId: agencies[0]!.organizationId,
      },
    });
    fireEvent.change(given, { target: { value: "TEST" } });
    fireEvent.change(screen.getByLabelText("Test surname"), { target: { value: "SKYROUTE" } });
    fireEvent.click(screen.getByRole("button", { name: "Review details" }));
    fireEvent.click(screen.getByRole("button", { name: "Create test booking" }));
    expect(await screen.findByRole("button", { name: "Accept new price" })).toBeVisible();
    expect(screen.getByText(/234,567/)).toBeVisible();
    expect(screen.getByText(/123,456/)).toBeVisible();
    expect(screen.queryByLabelText("Test given name")).not.toBeInTheDocument();
    expect(mocks.createBooking).toHaveBeenCalledExactlyOnceWith({
      data: {
        bookingToken: "accepted",
        organizationId: agencies[0]!.organizationId,
        passenger: { given: "TEST", surname: "SKYROUTE" },
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept new price" }));
    const heading = await screen.findByRole("heading", { name: "Review your details" });
    const review = within(heading.parentElement!);
    expect(review.getByText("TEST SKYROUTE")).toBeVisible();
    expect(review.getByText("234,567 KZT")).toBeVisible();
    expect(mocks.createBooking).toHaveBeenCalledOnce();
    fireEvent.click(review.getByRole("button", { name: "Edit details" }));
    expect(screen.getByLabelText("Test given name")).toHaveValue("TEST");
    expect(screen.getByLabelText("Test surname")).toHaveValue("SKYROUTE");
  });

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

it("prints only selected agency offers and includes a photo after it loads", async () => {
  const response = result();
  if (response.status !== "ok") throw new Error("Expected test offers");
  const [offer] = response.offers;
  mocks.search.mockResolvedValue({
    ...response,
    environment: "test",
    offers: ["KC100", "KC101", "KC102", "KC103"].map((flightNumber) => ({
      ...offer,
      id: flightNumber,
      flightNumber,
    })),
  });
  const create = vi.fn(() => "blob:cover");
  const revoke = vi.fn();
  const browserURL = class extends URL {
    static override createObjectURL = create;
    static override revokeObjectURL = revoke;
  };
  vi.stubGlobal("URL", browserURL);
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  const view = render(<Workspace />);
  try {
    await ready();
    select(A);
    submitSearch();
    const options = await screen.findAllByRole("checkbox", { name: /in the shortlist/ });
    const preview = screen.getByRole("button", { name: "Preview flight shortlist" });
    expect(preview).toBeDisabled();
    options.slice(0, 3).forEach((option) => fireEvent.click(option));
    expect(options[3]).toBeDisabled();
    fireEvent.click(preview);

    const dialog = within(await screen.findByRole("dialog"));
    const printButton = dialog.getByRole("button", { name: "Save as PDF" });
    const documentPreview = dialog.getByRole("region", { name: "PDF preview" });
    expect(documentPreview).toHaveTextContent("Test data · Travelport Preproduction");
    expect(documentPreview).toHaveTextContent("100,000 KZT");
    expect(documentPreview).not.toHaveTextContent("KC103");
    const input = dialog.getByLabelText("Cover photo (optional)");
    const photo = new File(["sample"], "cover.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [photo] } });
    const image = await dialog.findByRole("img", { name: "Cover photo" });
    expect(printButton).toBeDisabled();
    fireEvent.load(image);
    fireEvent.click(printButton);
    expect(print).toHaveBeenCalledOnce();
    const printable = document.querySelector(".flight-shortlist-print");
    expect(printable?.querySelector("img")).toHaveAttribute("src", "blob:cover");
    expect(printable).toHaveTextContent("KC100");
    expect(printable).not.toHaveTextContent("KC103");

    fireEvent.click(dialog.getByRole("button", { name: "Close" }));
    select(B);
    expect(document.querySelector(".flight-shortlist-print")).toBeNull();
    expect(screen.queryByRole("button", { name: "Preview flight shortlist" })).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:cover");
  } finally {
    view.unmount();
    vi.unstubAllGlobals();
  }
});

it("restores and prints saved shortlist snapshots without searching and isolates them by scope", async () => {
  const response = result();
  if (response.status !== "ok") throw new Error("Expected test offers");
  const [offer] = response.offers;
  mocks.search.mockResolvedValueOnce({
    ...response,
    environment: "test",
    offers: ["KC100", "KC101", "KC102"].map((flightNumber) => ({
      ...offer,
      id: flightNumber,
      flightNumber,
      checkoutToken: "temporary-token",
      price: flightNumber === "KC101" ? { amount: 500.25, currency: "GBP" } : offer.price,
      baggage: { checked: { pieces: 1, weightKg: 23 } },
      comparisonEvidence: { baggageScope: "all_passengers_all_segments" },
    })),
  });
  const first = render(<Workspace />);
  await ready();
  select(A);
  submitSearch();
  const options = await screen.findAllByRole("checkbox", { name: /in the shortlist/ });
  const savedAt = screen.getByText(/^Retrieved:/).textContent!;
  const save = screen.getByRole("button", { name: "Save shortlist", exact: true });
  expect(save).toBeDisabled();
  options.slice(0, 2).forEach((option) => fireEvent.click(option));
  fireEvent.click(save);
  expect(screen.getByText("Shortlist saved.")).toBeInTheDocument();
  const key = Object.keys(window.localStorage).find((name) => name.includes(":saved-shortlists:"))!;
  expect(window.localStorage.getItem(key)).not.toContain("temporary-token");
  expect(JSON.parse(window.localStorage.getItem(key)!)).not.toHaveProperty("hotel");
  first.unmount();
  window.sessionStorage.clear();

  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  const reopened = render(<Workspace />);
  await ready();
  select(A);
  expect(screen.getByText("Options: 2")).toBeInTheDocument();
  function openSavedShortlist() {
    fireEvent.click(screen.getByRole("button", { name: /^Open shortlist for ALA → IST/ }));
  }
  openSavedShortlist();
  const dialog = within(await screen.findByRole("dialog"));
  const preview = dialog.getByRole("region", { name: "PDF preview" });
  expect(within(preview).queryByRole("heading", { name: "Hotel" })).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "Save as PDF" }));
  expect(print).toHaveBeenCalledOnce();
  const printable = document.querySelector(".flight-shortlist-print");
  for (const content of [preview, printable]) {
    expect(content).toHaveTextContent("KC100");
    expect(content).toHaveTextContent("KC101");
    expect(content).not.toHaveTextContent("KC102");
    expect(content).toHaveTextContent("100,000 KZT");
    expect(content).toHaveTextContent("500.25 GBP");
    expect(content).toHaveTextContent("Checked baggage · 1 pc · 23 kg");
    expect(content).toHaveTextContent(savedAt);
    expect(content).toHaveTextContent("Test data · Travelport Preproduction");
    expect(content).toHaveTextContent("Prices were saved at the time of the search.");
  }
  expect(mocks.search).toHaveBeenCalledOnce();

  select(B);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.querySelector(".flight-shortlist-print")).toBeNull();
  expect(screen.getByText("No saved shortlists yet.")).toBeInTheDocument();

  select(A);
  openSavedShortlist();
  const listener = mocks.onAuthStateChange.mock.lastCall?.[0] as (
    event: string,
    session: null,
  ) => void;
  act(() => listener("SIGNED_OUT", null));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByText("Saved shortlists")).not.toBeInTheDocument();

  reopened.rerender(<Workspace userId="other-user" />);
  await ready();
  select(A);
  expect(screen.getByText("No saved shortlists yet.")).toBeInTheDocument();

  reopened.rerender(<Workspace />);
  await ready();
  select(A);
  fireEvent.click(screen.getByRole("button", { name: /^Delete shortlist for ALA → IST/ }));
  expect(screen.getByText("No saved shortlists yet.")).toBeInTheDocument();
  expect(window.localStorage.getItem(key)).toBeNull();
  expect(mocks.search).toHaveBeenCalledOnce();
});

it("saves, restores, prints, edits and removes a shortlist hotel", async () => {
  const first = render(<Workspace />);
  await ready();
  select(A);
  submitSearch();
  fireEvent.click(await screen.findByRole("checkbox", { name: /in the shortlist/ }));
  fireEvent.click(screen.getByRole("button", { name: "Preview flight shortlist" }));
  let dialog = within(await screen.findByRole("dialog"));
  fireEvent.click(dialog.getByRole("button", { name: "Add hotel" }));

  function enter(label: string, value: string) {
    fireEvent.change(dialog.getByLabelText(label), { target: { value } });
  }
  enter("Hotel name", "Bosphorus Hotel");
  enter("Check-in", "2099-12-10");
  enter("Check-out", "2099-12-09");
  enter("Total stay price", "650,50");
  enter("Currency code", "eur");
  enter("Comment (optional)", "Breakfast included");
  fireEvent.click(dialog.getByRole("button", { name: "Save hotel" }));
  expect(dialog.getByRole("alert")).toHaveTextContent("Hotel check-out must be after check-in.");
  expect(dialog.getByRole("button", { name: "Save shortlist" })).toBeDisabled();
  enter("Check-out", "2099-12-14");
  fireEvent.click(dialog.getByRole("button", { name: "Save hotel" }));
  fireEvent.click(dialog.getByRole("button", { name: "Save shortlist" }));
  expect(screen.getByText("Shortlist saved.")).toBeInTheDocument();
  first.unmount();
  window.sessionStorage.clear();

  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  const reopened = render(<Workspace />);
  await ready();
  select(A);

  async function openSaved() {
    fireEvent.click(screen.getByRole("button", { name: /^Open shortlist for ALA → IST/ }));
    dialog = within(await screen.findByRole("dialog"));
    return dialog.getByRole("region", { name: "PDF preview" });
  }

  const preview = await openSaved();
  fireEvent.click(dialog.getByRole("button", { name: "Save as PDF" }));
  expect(print).toHaveBeenCalledOnce();
  const printable = document.querySelector<HTMLElement>(".flight-shortlist-print")!;
  for (const content of [preview, printable]) {
    const hotelHeading = within(content).getByRole("heading", { name: "Hotel", hidden: true });
    expect(content.textContent!.indexOf("KC100")).toBeLessThan(
      content.textContent!.indexOf("Bosphorus Hotel"),
    );
    expect(hotelHeading.parentElement).toHaveTextContent("Check-in · 10 Dec 2099");
    expect(hotelHeading.parentElement).toHaveTextContent("Check-out · 14 Dec 2099");
    expect(content).toHaveTextContent("Flight price · 100,000 KZT");
    expect(content).toHaveTextContent("Total stay price · 650.5 EUR");
    expect(content).toHaveTextContent("Breakfast included");
  }
  const key = Object.keys(window.localStorage).find((name) => name.includes(":saved-shortlists:"))!;
  expect(JSON.parse(window.localStorage.getItem(key)!).hotel).toMatchObject({
    checkIn: "2099-12-10",
    checkOut: "2099-12-14",
  });
  fireEvent.click(dialog.getByRole("button", { name: "Edit hotel" }));
  expect(dialog.getByLabelText("Hotel name")).toHaveValue("Bosphorus Hotel");
  enter("Total stay price", "700");
  enter("Comment (optional)", "");
  fireEvent.click(dialog.getByRole("button", { name: "Save hotel" }));
  fireEvent.click(dialog.getByRole("button", { name: "Close" }));
  expect(await openSaved()).toHaveTextContent("Total stay price · 700 EUR");

  fireEvent.click(dialog.getByRole("button", { name: "Remove hotel" }));
  reopened.unmount();
  render(<Workspace />);
  await ready();
  select(A);
  const flightOnly = await openSaved();
  expect(within(flightOnly).queryByRole("heading", { name: "Hotel" })).not.toBeInTheDocument();
  expect(flightOnly).toHaveTextContent("100,000 KZT");
  expect(mocks.search).toHaveBeenCalledOnce();
});

it("keeps agency search working with corrupt or unwritable shortlist storage", async () => {
  window.localStorage.setItem(
    `flight-analytics:saved-shortlists:v1:${JSON.stringify([USER, A])}:corrupt`,
    "{",
  );
  render(<Workspace />);
  await ready();
  select(A);
  expect(screen.getByText("No saved shortlists yet.")).toBeInTheDocument();
  submitSearch();
  fireEvent.click(await screen.findByRole("checkbox", { name: /in the shortlist/ }));
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage is full", "QuotaExceededError");
  });
  fireEvent.click(screen.getByRole("button", { name: "Save shortlist", exact: true }));
  expect(screen.getByText("Could not save the shortlist.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Preview flight shortlist" })).toBeEnabled();
  write.mockRestore();
  fireEvent.click(screen.getByRole("button", { name: "Save shortlist", exact: true }));
  expect(screen.getByText("Options: 1")).toBeInTheDocument();
});

it("reuses recent search parameters after reopening the browser and scopes them to the user and agency", async () => {
  const first = render(<Workspace />);
  await ready();
  select(A);
  submitSearch();
  await screen.findByRole("button", { name: /^ALA → IST/ });

  fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "NQZ" } });
  fireEvent.change(screen.getByLabelText("Passengers"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Search flights" }));
  await screen.findByRole("button", { name: /^ALA → NQZ/ });
  first.unmount();
  window.sessionStorage.clear();

  const reopened = render(<Workspace />);
  await ready();
  select(B);
  expect(screen.queryByText("Recent searches on this browser")).not.toBeInTheDocument();
  select(A);
  expect(screen.getByLabelText("Origin")).toHaveValue("");
  expect(
    screen.getAllByRole("button", { name: /^ALA →/ }).map((button) => button.textContent),
  ).toEqual([expect.stringMatching(/^ALA → NQZ/), expect.stringMatching(/^ALA → IST/)]);
  fireEvent.click(screen.getByRole("button", { name: /^ALA → NQZ/ }));
  expect(screen.getByLabelText("Origin")).toHaveValue("ALA");
  expect(screen.getByLabelText("Destination")).toHaveValue("NQZ");
  expect(screen.getByLabelText("Passengers")).toHaveValue(2);
  expect(mocks.search).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole("button", { name: "Search flights" }));
  await screen.findByText(/A Airways · KC100/);
  expect(screen.getAllByRole("button", { name: /^ALA → NQZ/ })).toHaveLength(1);
  expect(mocks.search).toHaveBeenLastCalledWith({
    data: expect.objectContaining({ organizationId: A, destination: "NQZ", passengers: 2 }),
  });

  reopened.rerender(<Workspace userId="other-user" />);
  await ready();
  select(A);
  expect(screen.queryByText("Recent searches on this browser")).not.toBeInTheDocument();
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
