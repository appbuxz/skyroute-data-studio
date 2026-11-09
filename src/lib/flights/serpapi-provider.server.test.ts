import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serpApiProvider } from "./serpapi-provider.server";
import type { FlightSearchParams, OrganizationId } from "./types";

const params: FlightSearchParams = {
  origin: "ALA",
  destination: "IST",
  departureDate: "2026-12-10",
  passengers: 1,
  cabinClass: "economy",
};

const originalKey = process.env["SERPAPI_API_KEY"];

beforeEach(() => {
  process.env["SERPAPI_API_KEY"] = "test-key-not-real";
});

afterEach(() => {
  vi.unstubAllGlobals();

  if (originalKey === undefined) {
    delete process.env["SERPAPI_API_KEY"];
  } else {
    process.env["SERPAPI_API_KEY"] = originalKey;
  }
});

describe("SerpApi server provider", () => {
  it("returns not_connected when API key is missing", async () => {
    delete process.env["SERPAPI_API_KEY"];
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.searchFlights(params, {});

    expect(result.status).toBe("not_connected");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects round trips without making an API request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await serpApiProvider.searchFlights({ ...params, returnDate: "2026-12-20" }, {});

    expect(result.status).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the correct search parameters without internal organization context", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        search_parameters: { currency: "KZT" },
        best_flights: [],
        other_flights: [],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    const organizationId = "f2000000-0000-4000-8000-000000000001" as OrganizationId;
    const result = await serpApiProvider.searchFlights(params, { organizationId });

    expect(result.status).toBe("ok");

    if (result.status === "ok") {
      expect(result.offers).toEqual([]);
      expect(Number.isNaN(Date.parse(result.fetchedAt))).toBe(false);
    }

    expect(fetchMock).toHaveBeenCalledOnce();

    const firstCall = fetchMock.mock.calls[0];

    if (!firstCall) {
      throw new Error("Expected fetch to be called");
    }

    const url = new URL(firstCall[0]);

    expect(url.origin).toBe("https://serpapi.com");
    expect(url.searchParams.get("engine")).toBe("google_flights");
    expect(url.searchParams.get("departure_id")).toBe("ALA");
    expect(url.searchParams.get("arrival_id")).toBe("IST");
    expect(url.searchParams.get("outbound_date")).toBe("2026-12-10");
    expect(url.searchParams.get("type")).toBe("2");
    expect(url.searchParams.get("currency")).toBe("KZT");
    expect(url.searchParams.get("adults")).toBe("1");
    expect(url.searchParams.get("travel_class")).toBe("1");
    expect(url.searchParams.get("api_key")).toBe("test-key-not-real");
    expect([...url.searchParams.keys()].sort()).toEqual([
      "adults",
      "api_key",
      "arrival_id",
      "currency",
      "departure_id",
      "engine",
      "hl",
      "outbound_date",
      "travel_class",
      "type",
    ]);
    expect(JSON.stringify(firstCall)).not.toContain(organizationId);
  });

  it("handles provider HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "Rate limit exceeded" }),
      }),
    );

    const result = await serpApiProvider.searchFlights(params, {});

    expect(result).toEqual({
      status: "error",
      message: "Flight data provider is unavailable.",
    });
  });

  it("handles provider API errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ error: "Invalid API key" }),
      }),
    );

    const result = await serpApiProvider.searchFlights(params, {});

    expect(result.status).toBe("error");
  });

  it("handles network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network unavailable")));

    const result = await serpApiProvider.searchFlights(params, {});

    expect(result.status).toBe("error");
  });
});
