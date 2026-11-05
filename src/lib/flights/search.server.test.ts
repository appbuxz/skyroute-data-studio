import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  searchFlights: vi.fn(),
}));

vi.mock("../supabase/auth.server", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("./serpapi-provider.server", () => ({
  serpApiProvider: {
    searchFlights: mocks.searchFlights,
  },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator() {
      return {
        handler(fn: unknown) {
          return fn;
        },
      };
    },
  }),
}));

import { searchFlightsServer } from "./search.server";

const params = {
  origin: "ALA",
  destination: "IST",
  departureDate: "2026-12-10",
  passengers: 1,
  cabinClass: "ECONOMY",
};

describe("searchFlightsServer authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call SerpApi when authentication fails", async () => {
    mocks.requireAuth.mockRejectedValue(
      new Error("Authentication required"),
    );

    await expect(
      (searchFlightsServer as Function)({ data: params }),
    ).rejects.toThrow("Authentication required");

    expect(mocks.requireAuth).toHaveBeenCalledOnce();
    expect(mocks.searchFlights).not.toHaveBeenCalled();
  });
});
