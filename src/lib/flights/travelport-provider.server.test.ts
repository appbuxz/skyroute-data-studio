import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "./fixtures/travelport-core.json";
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
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("recognizes complete server configuration and maps form input through existing OAuth/search", async () => {
  fetchMock
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-token" })))
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
  expect(request.headers["TVP-PCC-Core"]).toBe("test-PCC");
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
    .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-token" })))
    .mockResolvedValueOnce(new Response(JSON.stringify({})));
  expect((await travelportProvider.searchFlights(params, {})).status).toBe("error");
});
