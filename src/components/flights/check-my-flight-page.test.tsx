import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckMyFlightPage } from "./check-my-flight-page";
import {
  compareFlightCheck,
  type FlightCheckInput,
  type FlightCheckResult,
  type FlightCheckOffer,
} from "@/lib/flights/flight-check";
import type { FlightOffer, OrganizationId } from "@/lib/flights/types";
import {
  OrganizationWorkspaceContext,
  type OrganizationWorkspace,
} from "@/lib/organizations/workspace-context";

const mocks = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/flights/flight-check.functions", () => ({ checkFlightServer: mocks.check }));

// Entirely synthetic automated-test data. No provider requests or captured verification prices.
const organizationId = "f2000000-0000-4000-8000-000000000001" as OrganizationId;
const input: FlightCheckInput = {
  origin: "JFK",
  destination: "LAX",
  departureDate: "2099-12-10",
  passengers: 1,
  cabinClass: "economy",
  tripType: "one_way",
  mode: "requirements_match",
  originalPrice: 600,
  originalCurrency: "GBP",
  baggageRequirements: { checked: { status: "not_required" }, cabin: { status: "not_required" } },
};
const offer: FlightOffer = {
  id: "synthetic-test-offer",
  provider: "travelport",
  carrier: "ZZ",
  flightNumber: "101",
  origin: "JFK",
  destination: "LAX",
  cabinClass: "economy",
  stops: 1,
  departureAt: "2099-12-10T08:00:00-05:00",
  arrivalAt: "2099-12-10T13:00:00-08:00",
  price: { amount: 200, currency: "GBP" },
  outbound: {
    durationMinutes: 480,
    segments: [
      {
        carrier: "ZZ",
        flightNumber: "101",
        origin: "JFK",
        destination: "DFW",
        departureAt: "2099-12-10T08:00:00-05:00",
        arrivalAt: "2099-12-10T10:00:00-06:00",
        durationMinutes: 180,
      },
      {
        carrier: "ZZ",
        flightNumber: "202",
        origin: "DFW",
        destination: "LAX",
        departureAt: "2099-12-10T12:00:00-06:00",
        arrivalAt: "2099-12-10T13:00:00-08:00",
        durationMinutes: 180,
      },
    ],
  },
};
const entry: FlightCheckOffer = {
  offer,
  passengers: 1,
  priceScope: "all_passengers_total",
  mandatoryChargesIncluded: true,
};
function result(entries = [entry], overrides: Partial<FlightCheckInput> = {}) {
  return compareFlightCheck({ ...input, ...overrides } as FlightCheckInput, entries, {
    environment: "test",
    searchedAt: "2099-12-01T00:00:00Z",
  });
}
function workspace(overrides: Partial<OrganizationWorkspace> = {}): OrganizationWorkspace {
  return {
    memberships: [{ organizationId, organizationName: "Test organization", role: "member" }],
    selectedOrganizationId: organizationId,
    status: "ready",
    error: null,
    authorizationError: null,
    canSearch: true,
    version: 1,
    search: null,
    isCurrentScope: () => true,
    selectOrganization: vi.fn(),
    reloadMemberships: vi.fn(),
    publishSearch: vi.fn(),
    clearSearch: vi.fn(),
    rejectSelection: vi.fn(),
    ...overrides,
  };
}
function Page({ scope = workspace() }: { scope?: OrganizationWorkspace }) {
  return (
    <OrganizationWorkspaceContext.Provider value={scope}>
      <CheckMyFlightPage />
    </OrganizationWorkspaceContext.Provider>
  );
}
function change(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function fill() {
  change("Origin airport", "jfk");
  change("Destination airport", "lax");
  change("Departure date", "2099-12-10");
  change("Original total price", "600");
  change("Currency", "gbp");
}
function baggage() {
  change("Checked baggage requirement", "not_required");
  change("Cabin baggage requirement", "not_required");
}
function submit() {
  fireEvent.submit(screen.getByRole("form", { name: "Check My Flight" }));
}
function deferred() {
  let resolve!: (result: FlightCheckResult) => void;
  const promise = new Promise<FlightCheckResult>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.check.mockResolvedValue(result());
});
afterEach(cleanup);

describe("Check My Flight form", () => {
  it("requires route, date, original price and currency without issuing a request", () => {
    render(<Page />);
    submit();
    for (const label of [
      "Origin airport",
      "Destination airport",
      "Departure date",
      "Original total price",
      "Currency",
    ])
      expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Check the highlighted fields");
    expect(mocks.check).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Return date/)).not.toBeInTheDocument();
  });
  it("requires independent explicit baggage selections", () => {
    render(<Page />);
    fill();
    submit();
    expect(screen.getAllByText("Choose whether this baggage is required.")).toHaveLength(2);
    change("Checked baggage requirement", "not_required");
    submit();
    expect(screen.getAllByText("Choose whether this baggage is required.")).toHaveLength(1);
    expect(mocks.check).not.toHaveBeenCalled();
    expect(screen.getByText(/it does not mean baggage is included/)).toBeInTheDocument();
  });
  it("sends the requirements_match contract with the selected organization and numeric minimums", async () => {
    render(<Page />);
    fill();
    change("Passengers (adults)", "2");
    change("Cabin class", "business");
    change("Checked baggage requirement", "required");
    change("Checked baggage minimum pieces", "2");
    change("Checked baggage minimum weight (kg, optional)", "20");
    change("Cabin baggage requirement", "not_required");
    submit();
    await screen.findByRole("region", { name: "Flight check results" });
    expect(mocks.check).toHaveBeenCalledExactlyOnceWith({
      data: {
        ...input,
        organizationId,
        passengers: 2,
        cabinClass: "business",
        baggageRequirements: {
          checked: { status: "required", pieces: 2, weightKg: 20 },
          cabin: { status: "not_required" },
        },
      },
    });
    expect(mocks.check.mock.calls[0]![0].data).not.toHaveProperty("returnDate");
    expect(mocks.check.mock.calls[0]![0].data).not.toHaveProperty("baggage");
  });
  it("rejects missing minimum pieces and nonpositive optional weight", () => {
    render(<Page />);
    fill();
    baggage();
    change("Cabin baggage requirement", "required");
    submit();
    expect(screen.getByLabelText("Cabin baggage minimum pieces")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    change("Cabin baggage minimum pieces", "1");
    change("Cabin baggage minimum weight (kg, optional)", "0");
    submit();
    expect(screen.getByLabelText("Cabin baggage minimum weight (kg, optional)")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it("omits optional weight and discards hidden minimums when no longer required", async () => {
    render(<Page />);
    fill();
    baggage();
    change("Checked baggage requirement", "required");
    change("Checked baggage minimum pieces", "1");
    change("Checked baggage requirement", "not_required");
    change("Cabin baggage requirement", "required");
    change("Cabin baggage minimum pieces", "1");
    submit();
    await screen.findByRole("region", { name: "Flight check results" });
    expect(mocks.check.mock.calls[0]![0].data.baggageRequirements).toEqual({
      checked: { status: "not_required" },
      cabin: { status: "required", pieces: 1 },
    });
  });
  it("rejects impossible dates, invalid adult counts and unsupported currency precision", () => {
    render(<Page />);
    fill();
    baggage();
    change("Departure date", "2099-02-30");
    change("Passengers (adults)", "0");
    change("Original total price", "600.001");
    submit();
    expect(screen.getByLabelText("Departure date")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Passengers (adults)")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Original total price")).toHaveAttribute("aria-invalid", "true");
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it("shows loading, freezes fields and prevents duplicate submissions before React updates", async () => {
    const pending = deferred();
    mocks.check.mockReturnValue(pending.promise);
    render(<Page />);
    fill();
    baggage();
    act(() => {
      submit();
      submit();
    });
    expect(mocks.check).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Checking your flight/ })).toBeDisabled();
    expect(screen.getByLabelText("Origin airport")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Checking alternatives");
    await act(async () => pending.resolve(result()));
    expect(screen.getByRole("button", { name: "Check my flight" })).toBeEnabled();
  });
  it("blocks submission without an authorized organization", () => {
    render(
      <Page
        scope={workspace({ canSearch: false, selectedOrganizationId: null, memberships: [] })}
      />,
    );
    expect(screen.getByText(/No organization assigned/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check my flight" })).toBeDisabled();
    fill();
    baggage();
    submit();
    expect(mocks.check).not.toHaveBeenCalled();
  });
  it("shows safe search errors without rendering arbitrary exception details", async () => {
    mocks.check.mockRejectedValue(new Error("sensitive backend detail"));
    render(<Page />);
    fill();
    baggage();
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t check your flight");
    expect(screen.queryByText(/sensitive backend/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check my flight" })).toBeEnabled();
  });
  it("rejects an expired authenticated selection using the existing workspace flow", async () => {
    const scope = workspace();
    mocks.check.mockRejectedValue({ statusCode: 401 });
    render(<Page scope={scope} />);
    fill();
    baggage();
    submit();
    await act(async () => {});
    expect(scope.rejectSelection).toHaveBeenCalledWith("Your session has expired. Sign in again.");
    expect(screen.queryByRole("region", { name: "Flight check results" })).not.toBeInTheDocument();
  });
  it("discards results when the organization scope changes during a request", async () => {
    const pending = deferred();
    mocks.check.mockReturnValue(pending.promise);
    const view = render(<Page />);
    fill();
    baggage();
    submit();
    view.rerender(
      <Page
        scope={workspace({
          version: 2,
          selectedOrganizationId: "f2000000-0000-4000-8000-000000000002" as OrganizationId,
        })}
      />,
    );
    await act(async () => pending.resolve(result()));
    expect(screen.queryByRole("region", { name: "Flight check results" })).not.toBeInTheDocument();
  });
  it("clears results when search details change without automatically searching again", async () => {
    render(<Page />);
    fill();
    baggage();
    submit();
    await screen.findByRole("region", { name: "Flight check results" });
    change("Original total price", "650");
    expect(screen.queryByRole("region", { name: "Flight check results" })).not.toBeInTheDocument();
    expect(mocks.check).toHaveBeenCalledOnce();
  });

  it("clears completed results when the workspace version changes", async () => {
    const view = render(<Page />);
    fill();
    baggage();
    submit();
    await screen.findByRole("region", { name: "Flight check results" });
    view.rerender(<Page scope={workspace({ version: 2 })} />);
    expect(screen.queryByRole("region", { name: "Flight check results" })).not.toBeInTheDocument();
  });
});

describe("Check My Flight result presentation (synthetic mocked callable)", () => {
  it("labels original price, potential savings, requirements, local times and the complete itinerary", async () => {
    render(<Page />);
    fill();
    baggage();
    submit();
    const results = await screen.findByRole("region", { name: "Flight check results" });
    expect(within(results).getByText("Your original total · user-provided")).toBeInTheDocument();
    expect(within(results).getByText("GBP 600.00")).toBeInTheDocument();
    expect(within(results).getByText("GBP 400.00")).toBeInTheDocument();
    expect(screen.getByText("Potential savings: GBP 400.00")).toBeInTheDocument();
    expect(screen.getByText("Airline: ZZ · Flight 101")).toBeInTheDocument();
    expect(screen.getByText("Verified traveler requirements")).toBeInTheDocument();
    expect(screen.getByText("Checked baggage: Explicitly not required")).toBeInTheDocument();
    expect(screen.getByText("1. JFK → DFW")).toBeInTheDocument();
    expect(screen.getByText("2. DFW → LAX")).toBeInTheDocument();
    expect(screen.getByText("Connection at DFW")).toBeInTheDocument();
    expect(screen.getByText("Total journey duration: 8h")).toBeInTheDocument();
    expect(screen.getByText("1 stop")).toBeInTheDocument();
    expect(screen.getByText("10 Dec 2099 · 08:00 (UTC-05:00)")).toBeInTheDocument();
  });
  it("discloses Preproduction before submission and in returned results", async () => {
    render(<Page />);
    expect(
      screen.getByText(/Travelport Preproduction · Test environment. Results/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Flight check results" })).not.toBeInTheDocument();
    expect(mocks.check).not.toHaveBeenCalled();
    fill();
    baggage();
    submit();
    const results = await screen.findByRole("region", { name: "Flight check results" });
    expect(
      within(results).getByText("Travelport Preproduction · Test environment"),
    ).toBeInTheDocument();
    expect(
      within(results).getByText(
        /Preproduction test results are not verified as live bookable fares/,
      ),
    ).toBeInTheDocument();
  });
  it("renders unknown cabin evidence as conditional with only an informational difference", async () => {
    mocks.check.mockResolvedValue(
      result([entry], {
        baggageRequirements: {
          checked: { status: "not_required" },
          cabin: { status: "required", pieces: 1 },
        },
      }),
    );
    render(<Page />);
    fill();
    baggage();
    change("Cabin baggage requirement", "required");
    change("Cabin baggage minimum pieces", "1");
    submit();
    await screen.findByRole("region", { name: "Conditional alternatives" });
    expect(
      screen.getByText(
        /Cabin baggage: All-passenger and all-segment applicability unverified \(unknown\)/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Informational price difference \(original minus alternative\): GBP 400.00/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Best potential savings")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Qualifying alternatives" }),
    ).not.toBeInTheDocument();
  });
  it("does not display a price difference or savings when pricing evidence is unknown", async () => {
    mocks.check.mockResolvedValue(result([{ offer }]));
    render(<Page />);
    fill();
    baggage();
    submit();
    await screen.findByRole("region", { name: "Conditional alternatives" });
    expect(
      screen.getByText(/Total price: Total price, passenger scope or mandatory charges unverified/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Informational price difference \(original/)).not.toBeInTheDocument();
    expect(screen.queryByText("Best potential savings")).not.toBeInTheDocument();
  });
  it("shows structured unmet baggage reasons without recommending incompatible offers", async () => {
    const checked: FlightCheckOffer = {
      ...entry,
      baggageScopes: { checked: "all_passengers_all_segments" },
      offer: { ...offer, baggage: { checked: { pieces: 0 } } },
    };
    mocks.check.mockResolvedValue(
      result([checked], {
        baggageRequirements: {
          checked: { status: "required", pieces: 1 },
          cabin: { status: "not_required" },
        },
      }),
    );
    render(<Page />);
    fill();
    baggage();
    submit();
    await screen.findByText("Do not meet your requirements (1)");
    expect(
      screen.getByText("Checked baggage: Allowance below selected minimum (not met)"),
    ).toBeInTheDocument();
    expect(screen.getByText(/are not recommended/)).toBeInTheDocument();
    expect(screen.queryByText(/Potential savings:/)).not.toBeInTheDocument();
  });
  it("preserves the combined compatibility explanation without inventing a specific cause", async () => {
    mocks.check.mockResolvedValue(
      result([{ ...entry, offer: { ...offer, price: { amount: 200, currency: "USD" } } }]),
    );
    render(<Page />);
    fill();
    baggage();
    submit();
    await screen.findByText("Do not meet your requirements (1)");
    expect(
      screen.getByText(
        "Flight compatibility: Route, dates, trip type, cabin, passengers or currency incompatible (not met)",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Informational price difference \(original/)).not.toBeInTheDocument();
  });
  it("handles empty returned offers", async () => {
    mocks.check.mockResolvedValue(result([]));
    render(<Page />);
    fill();
    baggage();
    submit();
    await screen.findByText("No alternatives returned");
    expect(
      screen.getByText(/No flights were returned for this route and date/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Best potential savings")).not.toBeInTheDocument();
  });
  it("handles provider failure returned by the service", async () => {
    mocks.check.mockResolvedValue({ ...result([]), status: "search_failed" });
    render(<Page />);
    fill();
    baggage();
    submit();
    await screen.findByText("Flight check unavailable");
    expect(screen.getByText(/No price comparison is available/)).toBeInTheDocument();
  });
  it("handles qualifying offers that are not cheaper without savings language", async () => {
    mocks.check.mockResolvedValue(
      result([{ ...entry, offer: { ...offer, price: { amount: 700, currency: "GBP" } } }]),
    );
    render(<Page />);
    fill();
    baggage();
    submit();
    await screen.findByText("No cheaper qualifying alternative found");
    expect(screen.getByText("Requirements met · no lower price")).toBeInTheDocument();
    expect(screen.queryByText("Best potential savings")).not.toBeInTheDocument();
  });
});
