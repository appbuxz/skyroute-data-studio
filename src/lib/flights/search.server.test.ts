import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightSearchParams, FlightSearchResult, OrganizationId } from "./types";

const mocks = vi.hoisted(() => ({
  requireOrganization: vi.fn(),
  requireAuth: vi.fn(),
  searchFlights: vi.fn(),
  confirmPrice: vi.fn(),
  acceptPrice: vi.fn(),
  retrieveBooking: vi.fn(),
  listBookings: vi.fn(),
}));

vi.mock("../organizations/authorization.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../organizations/authorization.server")>()),
  requireOrganization: mocks.requireOrganization,
}));

vi.mock("../supabase/auth.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../supabase/auth.server")>()),
  requireAuth: mocks.requireAuth,
}));

vi.mock("./travelport-provider.server", () => ({
  travelportProvider: { searchFlights: mocks.searchFlights },
}));
vi.mock("./travelport-price.server", () => ({
  confirmTravelportPrice: mocks.confirmPrice,
  acceptTravelportPrice: mocks.acceptPrice,
}));
vi.mock("./test-booking-status.server", () => ({
  retrieveTestBooking: mocks.retrieveBooking,
  listMyTestBookings: mocks.listBookings,
}));

// Run the actual configured validator and handler. HTTP serialization still
// requires a separate TanStack Start integration check.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (fn: () => Promise<unknown>) => fn,
    validator(schema: { parse(input: unknown): unknown }) {
      return {
        handler(fn: (args: { data: unknown }) => Promise<unknown>) {
          return async ({ data }: { data: unknown }) => fn({ data: schema.parse(data) });
        },
      };
    },
  }),
}));

import { OrganizationAuthorizationError } from "../organizations/authorization.server";
import { UnauthorizedError } from "../supabase/auth.server";
import { searchFlightsServer } from "./search.functions";
import { acceptFlightPriceServer, confirmFlightPriceServer } from "./flight-price.functions";
import {
  getTestBookingStatusServer,
  listMyTestBookingsServer,
} from "./test-booking-status.functions";
import { checkFlightServer } from "./flight-check.functions";

const organizationId = "f2000000-0000-4000-8000-000000000001" as OrganizationId;
const params: FlightSearchParams = {
  origin: "ALA",
  destination: "IST",
  departureDate: "2026-12-10",
  passengers: 1,
  cabinClass: "economy",
};
const success: FlightSearchResult = {
  status: "ok",
  offers: [],
  fetchedAt: "2026-11-10T10:00:00Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T10:00:00Z"));
  mocks.requireOrganization.mockResolvedValue({
    userId: "verified-user",
    organizationId,
    role: "member",
  });
  mocks.requireAuth.mockResolvedValue({ id: "verified-user" });
  mocks.searchFlights.mockResolvedValue(success);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("AirPrice authorization", () => {
  it("verifies agency membership before using a checkout token", async () => {
    const error = new OrganizationAuthorizationError("ORGANIZATION_ACCESS_DENIED");
    mocks.requireOrganization.mockRejectedValue(error);
    await expect(
      confirmFlightPriceServer({ data: { checkoutToken: "test-token", organizationId } }),
    ).rejects.toBe(error);
    expect(mocks.confirmPrice).not.toHaveBeenCalled();
  });

  it("rechecks agency membership on acceptance and passes only the signed quote", async () => {
    const data = {
      organizationId,
      acceptanceToken: "quote",
      price: { amount: 1, currency: "USD" },
    };
    const error = new OrganizationAuthorizationError("ORGANIZATION_ACCESS_DENIED");
    mocks.requireOrganization.mockRejectedValueOnce(error);
    await expect(acceptFlightPriceServer({ data })).rejects.toBe(error);
    expect(mocks.acceptPrice).not.toHaveBeenCalled();

    mocks.acceptPrice.mockResolvedValue({
      status: "confirmed",
      price: { amount: 118000, currency: "KZT" },
    });
    await expect(acceptFlightPriceServer({ data })).resolves.toEqual({
      status: "confirmed",
      price: { amount: 118000, currency: "KZT" },
    });
    expect(mocks.acceptPrice).toHaveBeenCalledExactlyOnceWith("quote", {
      userId: "verified-user",
      organizationId,
      role: "member",
    });
  });

  it("uses the server-verified context and ignores the supplied user ID", async () => {
    const input = { checkoutToken: "test-token", organizationId, userId: "forged-user" };
    mocks.confirmPrice.mockResolvedValue({ status: "expired" });
    await expect(confirmFlightPriceServer({ data: input })).resolves.toEqual({ status: "expired" });
    expect(mocks.confirmPrice).toHaveBeenCalledExactlyOnceWith(input.checkoutToken, {
      userId: "verified-user",
      organizationId,
      role: "member",
    });
  });
});

it("lists personal bookings only for the authenticated user", async () => {
  mocks.listBookings.mockResolvedValue([]);
  await expect(listMyTestBookingsServer()).resolves.toEqual([]);
  expect(mocks.listBookings).toHaveBeenCalledExactlyOnceWith("verified-user");

  const error = new UnauthorizedError();
  mocks.requireAuth.mockRejectedValue(error);
  await expect(listMyTestBookingsServer()).rejects.toBe(error);
  expect(mocks.listBookings).toHaveBeenCalledTimes(1);
});

describe("saved test booking authorization", () => {
  const flight = {
    carrier: "KC",
    flightNumber: "913",
    from: "ALA",
    to: "IST",
    departureDate: "2026-12-12",
  };

  it("refuses agency lookup after membership has been revoked", async () => {
    const error = new OrganizationAuthorizationError("ORGANIZATION_ACCESS_DENIED");
    mocks.requireOrganization.mockRejectedValue(error);
    await expect(getTestBookingStatusServer({ data: { organizationId, flight } })).rejects.toBe(
      error,
    );
    expect(mocks.retrieveBooking).not.toHaveBeenCalled();
  });

  it("uses verified identity and never accepts a PNR from the caller", async () => {
    const data = { flight, userId: "forged", pnr: "ABC123" };
    mocks.retrieveBooking.mockResolvedValue({ status: "not_found" });
    await expect(getTestBookingStatusServer({ data })).resolves.toEqual({ status: "not_found" });
    expect(mocks.retrieveBooking).toHaveBeenCalledExactlyOnceWith(
      { userId: "verified-user" },
      flight,
    );
  });
});

describe("searchFlightsServer authorization", () => {
  it.each([
    ["unauthenticated user", new UnauthorizedError()],
    ["user without memberships", new OrganizationAuthorizationError("ORGANIZATION_ACCESS_DENIED")],
    [
      "user with multiple organizations",
      new OrganizationAuthorizationError("ORGANIZATION_SELECTION_REQUIRED"),
    ],
    [
      "authorization database failure",
      new OrganizationAuthorizationError("AUTHORIZATION_UNAVAILABLE"),
    ],
    ["invalid organization", new OrganizationAuthorizationError("INVALID_ORGANIZATION_ID")],
  ])("does not execute the provider for %s", async (_label, error) => {
    mocks.requireOrganization.mockRejectedValue(error);

    // Preserve the exact error and statusCode outside the provider catch block.
    await expect(searchFlightsServer({ data: { ...params, organizationId } })).rejects.toBe(error);
    expect(mocks.requireOrganization).toHaveBeenCalledExactlyOnceWith(organizationId);
    expect(mocks.searchFlights).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("waits for authorization before executing the provider", async () => {
    let authorize!: (context: { userId: string; organizationId: OrganizationId }) => void;
    mocks.requireOrganization.mockReturnValue(
      new Promise((resolve) => {
        authorize = resolve;
      }),
    );

    const pending = searchFlightsServer({ data: { ...params, organizationId } });
    expect(mocks.requireOrganization).toHaveBeenCalledOnce();
    expect(mocks.searchFlights).not.toHaveBeenCalled();
    authorize({ userId: "verified-user", organizationId });
    await expect(pending).resolves.toEqual(success);
    expect(mocks.searchFlights).toHaveBeenCalledOnce();
  });

  it.each(["owner", "admin", "member"])(
    "passes verified context for an authorized %s",
    async (role) => {
      mocks.requireOrganization.mockResolvedValue({
        userId: "verified-user",
        organizationId,
        role,
      });

      await expect(searchFlightsServer({ data: { ...params, organizationId } })).resolves.toBe(
        success,
      );
      expect(mocks.requireOrganization).toHaveBeenCalledExactlyOnceWith(organizationId);
      expect(mocks.searchFlights).toHaveBeenCalledExactlyOnceWith(
        { ...params, returnDate: undefined },
        { userId: "verified-user", organizationId },
      );
    },
  );

  it("ignores client-supplied user identity and role", async () => {
    const forgedInput = {
      ...params,
      userId: "forged-user",
      role: "owner",
      organizationId,
    };
    await searchFlightsServer({ data: forgedInput });
    expect(mocks.requireOrganization).toHaveBeenCalledExactlyOnceWith(organizationId);
    expect(mocks.searchFlights).toHaveBeenCalledExactlyOnceWith(
      { ...params, returnDate: undefined },
      { userId: "verified-user", organizationId },
    );
  });

  it("passes an explicit selection to authorization and only verified context to the provider", async () => {
    const requestedOrganizationId = organizationId.toUpperCase();
    await expect(
      searchFlightsServer({ data: { ...params, organizationId: requestedOrganizationId } }),
    ).resolves.toBe(success);
    expect(mocks.requireOrganization).toHaveBeenCalledExactlyOnceWith(requestedOrganizationId);
    expect(mocks.searchFlights).toHaveBeenCalledExactlyOnceWith(
      { ...params, returnDate: undefined },
      { userId: "verified-user", organizationId },
    );
  });

  it("never falls back after an unauthorized explicit selection", async () => {
    const selected = "f2000000-0000-4000-8000-000000000002";
    const error = new OrganizationAuthorizationError("ORGANIZATION_ACCESS_DENIED");
    mocks.requireOrganization.mockRejectedValue(error);
    await expect(
      searchFlightsServer({ data: { ...params, organizationId: selected } }),
    ).rejects.toBe(error);
    expect(mocks.requireOrganization).toHaveBeenCalledExactlyOnceWith(selected);
    expect(mocks.searchFlights).not.toHaveBeenCalled();
  });

  it.each(["", "forged-id"])(
    "rejects invalid selection %j without authorization or provider execution",
    async (selected) => {
      await expect(
        searchFlightsServer({ data: { ...params, organizationId: selected } }),
      ).rejects.toThrow();
      expect(mocks.requireOrganization).not.toHaveBeenCalled();
      expect(mocks.searchFlights).not.toHaveBeenCalled();
    },
  );

  it("preserves validation and avoids authorization/provider work for invalid input", async () => {
    await expect(
      searchFlightsServer({ data: { ...params, destination: params.origin } }),
    ).rejects.toThrow();
    expect(mocks.requireOrganization).not.toHaveBeenCalled();
    expect(mocks.searchFlights).not.toHaveBeenCalled();
  });

  it("preserves empty return-date normalization", async () => {
    await searchFlightsServer({ data: { ...params, returnDate: "", organizationId } });
    expect(mocks.searchFlights).toHaveBeenCalledExactlyOnceWith(
      { ...params, returnDate: undefined },
      { userId: "verified-user", organizationId },
    );
  });

  it("preserves nonempty return dates for provider handling", async () => {
    const roundTrip = { ...params, returnDate: "2026-12-20" };
    await searchFlightsServer({ data: { ...roundTrip, organizationId } });
    expect(mocks.searchFlights).toHaveBeenCalledExactlyOnceWith(roundTrip, {
      userId: "verified-user",
      organizationId,
    });
  });

  it.each([
    { status: "not_connected", message: "Flight search API is not configured." },
    { status: "error", message: "Flight data provider is unavailable." },
  ] satisfies FlightSearchResult[])("preserves provider result $status", async (result) => {
    mocks.searchFlights.mockResolvedValue(result);
    await expect(searchFlightsServer({ data: { ...params, organizationId } })).resolves.toBe(
      result,
    );
  });

  it("preserves generic handling for unexpected provider failures", async () => {
    mocks.searchFlights.mockRejectedValue(new Error("Provider unavailable"));
    await expect(searchFlightsServer({ data: { ...params, organizationId } })).resolves.toEqual({
      status: "error",
      message: "Flight search is temporarily unavailable.",
    });
    expect(console.error).toHaveBeenCalledOnce();
  });
});

describe("personal search authorization", () => {
  it("allows a verified traveler without resolving any organization", async () => {
    mocks.requireOrganization.mockRejectedValue(
      new OrganizationAuthorizationError("ORGANIZATION_ACCESS_DENIED"),
    );
    await expect(searchFlightsServer({ data: params })).resolves.toBe(success);
    expect(mocks.requireAuth).toHaveBeenCalledOnce();
    expect(mocks.requireOrganization).not.toHaveBeenCalled();
    expect(mocks.searchFlights).toHaveBeenCalledExactlyOnceWith(
      { ...params, returnDate: undefined },
      { userId: "verified-user" },
    );
  });

  it("rejects signed-out callers before the provider runs", async () => {
    const error = new UnauthorizedError();
    mocks.requireAuth.mockRejectedValue(error);
    await expect(searchFlightsServer({ data: params })).rejects.toBe(error);
    expect(mocks.searchFlights).not.toHaveBeenCalled();
  });

  it("does not trust client identity or implicitly select an agency", async () => {
    const forgedInput = { ...params, userId: "forged-user", role: "owner" };
    await searchFlightsServer({ data: forgedInput });
    expect(mocks.requireAuth).toHaveBeenCalledOnce();
    expect(mocks.requireOrganization).not.toHaveBeenCalled();
    expect(mocks.searchFlights).toHaveBeenCalledExactlyOnceWith(
      { ...params, returnDate: undefined },
      { userId: "verified-user" },
    );
  });

  it("fails closed when identity verification is unavailable", async () => {
    const error = Object.assign(new Error("Authentication service unavailable"), {
      statusCode: 503,
    });
    mocks.requireAuth.mockRejectedValue(error);
    await expect(searchFlightsServer({ data: params })).rejects.toBe(error);
    expect(mocks.searchFlights).not.toHaveBeenCalled();
  });
});

const checkInput = {
  ...params,
  tripType: "one_way" as const,
  originalPrice: 300,
  originalCurrency: "USD",
  baggage: { status: "unknown" as const },
};
describe("checkFlightServer authorization", () => {
  it.each([
    new UnauthorizedError(),
    new OrganizationAuthorizationError("ORGANIZATION_ACCESS_DENIED"),
    new OrganizationAuthorizationError("AUTHORIZATION_UNAVAILABLE"),
  ])("preserves authorization failures before provider execution", async (error) => {
    mocks.requireOrganization.mockRejectedValue(error);
    await expect(checkFlightServer({ data: checkInput })).rejects.toBe(error);
    expect(mocks.searchFlights).not.toHaveBeenCalled();
  });
  it("uses only verified organization context and exact search fields", async () => {
    await expect(
      checkFlightServer({ data: { ...checkInput, organizationId } }),
    ).resolves.toMatchObject({ status: "no_offers_found" });
    expect(mocks.requireOrganization).toHaveBeenCalledExactlyOnceWith(organizationId);
    expect(mocks.searchFlights).toHaveBeenCalledExactlyOnceWith(
      { ...params, returnDate: undefined },
      { organizationId },
    );
  });
  it("rejects invalid input before authorization", async () => {
    await expect(
      checkFlightServer({ data: { ...checkInput, originalPrice: 0 } }),
    ).rejects.toThrow();
    expect(mocks.requireOrganization).not.toHaveBeenCalled();
    expect(mocks.searchFlights).not.toHaveBeenCalled();
  });
});
