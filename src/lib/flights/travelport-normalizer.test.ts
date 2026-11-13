import { describe, it, expect } from "vitest";
import fixture from "./fixtures/travelport-core.json";
import { normalizeTravelportFlights } from "./travelport-normalizer";
const zones: Record<string, string> = {
  JFK: "America/New_York",
  LAX: "America/Los_Angeles",
  ONT: "America/Los_Angeles",
  PHX: "America/Phoenix",
  DFW: "America/Chicago",
};
const timezone = (code: string) => {
  if (!zones[code]) throw Error();
  return zones[code]!;
};
const run = (data: unknown = fixture) => normalizeTravelportFlights(data, timezone);
describe("Travelport core: real response subset", () => {
  it("expands variants rather than catalog rows", () => {
    const r = run();
    expect(r.skipped).toEqual([]);
    expect(r.offers.length).toBeGreaterThan(2);
    expect(new Set(r.offers.map((o) => o.id)).size).toBe(r.offers.length);
  });
  it("resolves direct flight references and preserves price", () => {
    const r = run();
    const o = r.offers[0]!;
    const c =
      fixture.CatalogProductOfferingsResponse.CatalogProductOfferings.CatalogProductOffering[0]!;
    const price = c.ProductBrandOptions[0]!.ProductBrandOffering[0]!.BestCombinablePrice;
    expect(o.stops).toBe(0);
    expect(o.origin).toBe("JFK");
    expect(o.destination).toBe("LAX");
    expect(o.price).toEqual({ amount: price.TotalPrice, currency: price.CurrencyCode.value });
    expect(o.departureAt).toMatch(/-05:00$/);
    expect(o.arrivalAt).toMatch(/-08:00$/);
    expect(o.baggage).toBeUndefined();
    expect(o.refundable).toBeUndefined();
  });
  it("resolves connecting segments in sequence", () => {
    const o = run().offers.find((o) => o.stops === 1)!;
    expect(o).toBeDefined();
    expect(o.outbound!.segments[0]!.destination).toBe(o.outbound!.segments[1]!.origin);
    expect(o.outbound!.durationMinutes).toBe(519);
  });
  it("skips missing required prices with safe diagnostics", () => {
    const x = structuredClone(fixture);
    delete (
      x.CatalogProductOfferingsResponse.CatalogProductOfferings.CatalogProductOffering[0]!
        .ProductBrandOptions[0]!.ProductBrandOffering[0]!.BestCombinablePrice as Partial<{
        TotalPrice: number;
      }>
    ).TotalPrice;
    expect(run(x).skipped[0]!.reason).toBe("INVALID_VARIANT");
  });
  it("skips unresolved references", () => {
    const x = structuredClone(fixture);
    x.CatalogProductOfferingsResponse.ReferenceList = [];
    expect(run(x).offers).toEqual([]);
    expect(run(x).skipped.length).toBeGreaterThan(0);
  });
  it("skips unknown timezones without inventing offsets", () => {
    expect(
      normalizeTravelportFlights(fixture, () => {
        throw Error("sensitive");
      }).skipped.every((s) => s.reason === "INVALID_DATETIME_OR_TIMEZONE"),
    ).toBe(true);
  });
  it.each([null, {}, [], { CatalogProductOfferingsResponse: {} }])(
    "rejects malformed envelopes",
    (x) => expect(() => run(x)).toThrow("Invalid or unsupported Travelport response"),
  );
  it("accepts explicit empty catalogs", () =>
    expect(
      run({
        CatalogProductOfferingsResponse: {
          CatalogProductOfferings: { CatalogProductOffering: [] },
        },
      }),
    ).toEqual({ offers: [], skipped: [] }));
  it("does not mutate input", () => {
    const before = JSON.stringify(fixture);
    run();
    expect(JSON.stringify(fixture)).toBe(before);
  });
});

describe("review regression checks", () => {
  it("uses the production timezone resolver for the real subset", () => {
    expect(normalizeTravelportFlights(fixture)).toEqual(run());
  });
  it("rejects prototype property names as cabins", () => {
    const x = structuredClone(fixture);
    const products = x.CatalogProductOfferingsResponse.ReferenceList.find(
      (r) => r.Product,
    )?.Product!;
    for (const p of products)
      for (const passenger of p.PassengerFlight)
        for (const f of passenger.FlightProduct) f.cabin = "__proto__";
    expect(run(x).offers).toEqual([]);
    expect(run(x).skipped.every((s) => s.reason === "UNSUPPORTED_CABIN")).toBe(true);
  });
  it("rejects duplicate reference IDs", () => {
    const x = structuredClone(fixture);
    const products = x.CatalogProductOfferingsResponse.ReferenceList.find(
      (r) => r.Product,
    )?.Product!;
    products.push(structuredClone(products[0]!));
    expect(() => run(x)).toThrow("Invalid or unsupported Travelport response");
  });
});

describe("CDG/PVG timezone regression with the default resolver", () => {
  it.each([
    ["CDG", "2027-03-08", "+01:00"],
    ["PVG", "2027-01-09", "+08:00"],
  ])("normalizes %s to NQZ without an injected timezone map", (origin, date, offset) => {
    const data = structuredClone(fixture);
    const flight = data.CatalogProductOfferingsResponse.ReferenceList.flatMap((ref) =>
      "Flight" in ref ? ref.Flight : [],
    ).find((item) => item.id === "s1")!;
    flight.Departure = { location: origin, date, time: "01:00:00" };
    flight.Arrival = { location: "NQZ", date, time: "23:00:00" };
    const result = normalizeTravelportFlights(data);
    const offer = result.offers.find(
      (item) => item.origin === origin && item.destination === "NQZ",
    );
    expect(offer).toBeDefined();
    expect(offer!.departureAt).toBe(`${date}T01:00:00${offset}`);
    expect(offer!.arrivalAt).toBe(`${date}T23:00:00+05:00`);
  });
});
