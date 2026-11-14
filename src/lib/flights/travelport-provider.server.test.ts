import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "./fixtures/travelport-core.json";
import mixedFixture from "./fixtures/travelport-mixed-cabins.json";
import { normalizeTravelportFlights } from "./travelport-normalizer";
import { travelportProvider } from "./travelport-provider.server";
import type { FlightSearchParams } from "./types";

const params: FlightSearchParams = {
  origin: "JFK",
  destination: "LAX",
  departureDate: "2026-12-10",
  passengers: 2,
  cabinClass: "business",
};
const fetchMock = vi.fn();
beforeEach(() => {
  for (const name of ["CLIENT_ID", "CLIENT_SECRET", "USERNAME", "PASSWORD", "PCC"]) {
    vi.stubEnv(`TRAVELPORT_${name}`, `test-${name}`);
  }
  vi.stubEnv("TRAVELPORT_ACCESS_GROUP", "");
  vi.stubEnv("TRAVELPORT_PCC", "TEST_1G");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("keeps accurately normalized offers when the captured response also contains mixed cabins", async () => {
  const expected = normalizeTravelportFlights(fixture).offers;
  const normalized = normalizeTravelportFlights(mixedFixture);
  expect(normalized.skipped).toHaveLength(1);
  expect(normalized.skipped[0]?.reason).toBe("UNSUPPORTED_CABIN");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchMock
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "test-token", expires_in: 0 })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(mixedFixture)));
  const result = await travelportProvider.searchFlights(params, {});
  expect(result).toEqual({
    status: "ok",
    environment: "test",
    offers: expected,
    fetchedAt: expect.any(String),
  });
  expect(warn).toHaveBeenCalledWith("Travelport offers skipped", {
    count: 1,
    reasons: "UNSUPPORTED_CABIN",
  });
});

it("reports a clear reason when every variant is unsupported", async () => {
  const unsupported = structuredClone(mixedFixture);
  unsupported.CatalogProductOfferingsResponse.CatalogProductOfferings.CatalogProductOffering =
    unsupported.CatalogProductOfferingsResponse.CatalogProductOfferings.CatalogProductOffering.slice(
      -1,
    );
  vi.spyOn(console, "warn").mockImplementation(() => {});
  fetchMock
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "test-token", expires_in: 0 })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(unsupported)));
  expect(await travelportProvider.searchFlights(params, {})).toEqual({
    status: "error",
    message: "Travelport returned no supported flight offers (UNSUPPORTED_CABIN).",
  });
});

it("recognizes complete server configuration and maps form input through existing OAuth/search", async () => {
  fetchMock
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "test-token", expires_in: 0 })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(fixture)));
  const result = await travelportProvider.searchFlights(params, {});
  expect(result.status).toBe("ok");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0]![0]).toBe("https://auth.pp.travelport.com/oauth/token");
  const [url, request] = fetchMock.mock.calls[1]!;
  expect(url).toBe("https://api.pp.travelport.net/11/air/catalog/search/catalogproductofferings");
  const body = JSON.parse(request.body).CatalogProductOfferingsRequest;
  expect(body.PassengerCriteria[0].number).toBe(2);
  expect(body.SearchCriteriaFlight[0]).toEqual({
    "@type": "SearchCriteriaFlight",
    departureDate: params.departureDate,
    From: { value: "JFK" },
    To: { value: "LAX" },
  });
  expect(body.SearchModifiersAir.CabinPreference[0]).toMatchObject({
    preferenceType: "Permitted",
    cabins: ["Business"],
  });
  expect(request.headers["TVP-PCC-CORE"]).toBe("TEST_1G");
  expect(request.body).not.toContain("organizationId");
});

it.each(["CLIENT_ID", "CLIENT_SECRET", "USERNAME", "PASSWORD", "PCC"])(
  "rejects missing %s without network requests",
  async (name) => {
    vi.stubEnv(`TRAVELPORT_${name}`, " ");
    expect((await travelportProvider.searchFlights(params, {})).status).toBe("not_connected");
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

it("rejects round trips before OAuth or search", async () => {
  expect(
    (await travelportProvider.searchFlights({ ...params, returnDate: "2026-12-20" }, {})).status,
  ).toBe("error");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("sanitizes provider errors", async () => {
  fetchMock.mockRejectedValue(new Error("private provider details"));
  expect(await travelportProvider.searchFlights(params, {})).toEqual({
    status: "error",
    message: "Flight search is temporarily unavailable.",
  });
});

it("rejects malformed responses rather than fabricating offers", async () => {
  fetchMock
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "test-token", expires_in: 0 })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify({})));
  expect((await travelportProvider.searchFlights(params, {})).status).toBe("error");
});

it("sends Access Group instead of PCC with v11 headers", async () => {
  vi.stubEnv("TRAVELPORT_ACCESS_GROUP", "00000000-0000-4000-8000-000000000001");
  vi.stubEnv("TRAVELPORT_PCC", "");
  fetchMock
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "test-token", expires_in: 0 })),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(fixture)));
  expect((await travelportProvider.searchFlights(params, {})).status).toBe("ok");
  const headers = fetchMock.mock.calls[1]![1].headers;
  expect(headers.XAUTH_TRAVELPORT_ACCESSGROUP).toBe("00000000-0000-4000-8000-000000000001");
  expect(headers).not.toHaveProperty("TVP-PCC-CORE");
  expect(headers).toMatchObject({
    Accept: "application/json",
    "Accept-Version": "11",
    "Content-Version": "11",
    "Accept-Encoding": "gzip, deflate",
  });
});
