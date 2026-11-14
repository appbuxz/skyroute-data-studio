import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlightSearchParams, FlightSearchResult, OrganizationId } from "./types";

const mocks = vi.hoisted(() => ({
  requireOrganization: vi.fn(),
  requireAuth: vi.fn(),
  searchFlights: vi.fn(),
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

// Run the actual configured validator and handler. HTTP serialization still
// requires a separate TanStack Start integration check.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
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
    let authorize!: (context: { organizationId: OrganizationId }) => void;
    mocks.requireOrganization.mockReturnValue(
      new Promise((resolve) => {
        authorize = resolve;
      }),
    );

    const pending = searchFlightsServer({ data: { ...params, organizationId } });
    expect(mocks.requireOrganization).toHaveBeenCalledOnce();
    expect(mocks.searchFlights).not.toHaveBeenCalled();
    authorize({ organizationId });
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
        { organizationId },
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
      { organizationId },
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
      { organizationId },
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
      { organizationId },
    );
  });

  it("preserves nonempty return dates for provider handling", async () => {
    const roundTrip = { ...params, returnDate: "2026-12-20" };
    await searchFlightsServer({ data: { ...roundTrip, organizationId } });
    expect(mocks.searchFlights).toHaveBeenCalledExactlyOnceWith(roundTrip, { organizationId });
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
      {},
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
      {},
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
