import { afterEach, expect, it, vi } from "vitest";
import {
  compareFlightCheck,
  flightCheckSchema,
  type FlightCheckInput,
  type FlightCheckOffer,
} from "./flight-check";
import { runFlightCheck } from "./flight-check.server";
import type { OrganizationId } from "./types";

const input: FlightCheckInput = {
  origin: "ALA",
  destination: "IST",
  departureDate: "2099-12-10",
  passengers: 2,
  cabinClass: "economy",
  tripType: "one_way",
  originalPrice: 300.3,
  originalCurrency: "USD",
  baggage: { status: "known", checked: { pieces: 0 }, cabin: { pieces: 1 } },
};
const provenance = { searchedAt: "2026-11-13T00:00:00Z", environment: "test" as const };
function entry(amount = 200.1): FlightCheckOffer {
  return {
    passengers: 2,
    priceScope: "all_passengers_total",
    mandatoryChargesIncluded: true,
    baggageScope: "all_passengers_all_segments",
    offer: {
      id: String(amount),
      provider: "synthetic",
      carrier: "XX",
      flightNumber: "1",
      origin: "ALA",
      destination: "IST",
      departureAt: "2099-12-10T10:00:00+05:00",
      arrivalAt: "2099-12-10T12:00:00+03:00",
      stops: 0,
      cabinClass: "economy",
      price: { amount, currency: "USD" },
      baggage: { checked: { pieces: 0 }, cabin: { pieces: 1 } },
      outbound: {
        segments: [
          {
            carrier: "XX",
            flightNumber: "1",
            origin: "ALA",
            destination: "IST",
            departureAt: "2099-12-10T10:00:00+05:00",
            arrivalAt: "2099-12-10T12:00:00+03:00",
          },
        ],
      },
    },
  };
}
const compare = (entries: FlightCheckOffer[], original = input) =>
  compareFlightCheck(original, entries, provenance);
afterEach(() => vi.restoreAllMocks());
it("selects cheapest without mutation and calculates decimal savings", () => {
  const entries = [entry(250), entry(), entry(290)];
  const before = structuredClone(entries);
  expect(compare(entries)).toMatchObject({
    status: "better_offer_found",
    savingsAmount: 100.2,
    savingsPercentage: 33.37,
    comparableOfferCount: 3,
    bestComparableOffer: { id: "200.1" },
    environment: "test",
    providers: ["synthetic"],
    originalPrice: { source: "user_provided" },
  });
  expect(entries).toEqual(before);
});
it.each([300.3, 400])("does not report positive savings for %s", (amount) => {
  expect(compare([entry(amount)])).toMatchObject({
    status: "no_better_offer_found",
    savingsAmount: 0,
    savingsPercentage: 0,
  });
});
it.each([
  (e: FlightCheckOffer) => {
    e.offer.price.currency = "EUR";
  },
  (e: FlightCheckOffer) => {
    e.passengers = 1;
  },
  (e: FlightCheckOffer) => {
    e.offer.inbound = e.offer.outbound!;
  },
  (e: FlightCheckOffer) => {
    e.offer.outbound!.segments[0]!.departureAt = "2099-12-11T10:00:00Z";
  },
  (e: FlightCheckOffer) => {
    e.offer.cabinClass = "business";
  },
  (e: FlightCheckOffer) => {
    e.offer.baggage!.checked!.pieces = 1;
  },
])("excludes incompatible offers", (change) => {
  const e = entry();
  change(e);
  expect(compare([e])).toMatchObject({
    status: "insufficient_data",
    comparableOfferCount: 0,
    incompatibleOffers: [e.offer],
  });
});
it.each([
  (e: FlightCheckOffer) => {
    delete e.offer.baggage;
  },
  (e: FlightCheckOffer) => {
    delete e.passengers;
  },
  (e: FlightCheckOffer) => {
    delete e.priceScope;
  },
  (e: FlightCheckOffer) => {
    e.mandatoryChargesIncluded = false;
  },
  (e: FlightCheckOffer) => {
    e.offer.price.amount = NaN;
  },
  (e: FlightCheckOffer) => {
    e.offer.price.amount = -1;
  },
])("separates insufficient data without savings", (change) => {
  const e = entry();
  change(e);
  const result = compare([e]);
  expect(result.insufficientOffers).toHaveLength(1);
  expect(result.savingsAmount).toBeUndefined();
});
it("handles missing normalized price information without savings", () => {
  const e = entry();
  Reflect.deleteProperty(e.offer, "price");
  const result = compare([e]);
  expect(result.status).toBe("insufficient_data");
  expect(result.savingsAmount).toBeUndefined();
});
it("does not assume unknown original baggage is free", () => {
  expect(compare([entry()], { ...input, baggage: { status: "unknown" } }).status).toBe(
    "insufficient_data",
  );
});
it.each([
  { originalPrice: 0 },
  { originalPrice: Infinity },
  { originalPrice: undefined },
  { originalPrice: 1.001 },
  { departureDate: "2099-02-30" },
  { passengers: 0 },
  { passengers: 1.5 },
  { tripType: "round_trip" },
  { returnDate: "2099-12-11" },
])("validates invalid input %j", (change) => {
  expect(flightCheckSchema.safeParse({ ...input, ...change }).success).toBe(false);
});
it("accepts valid round trips", () => {
  expect(
    flightCheckSchema.safeParse({ ...input, tripType: "round_trip", returnDate: "2099-12-11" })
      .success,
  ).toBe(true);
});
it("distinguishes empty results and preserves test provenance", async () => {
  const searchFlights = vi.fn().mockResolvedValue({
    status: "ok",
    offers: [],
    fetchedAt: provenance.searchedAt,
    environment: "test",
  });
  expect(
    await runFlightCheck(
      input,
      { searchFlights },
      { organizationId: "verified" as OrganizationId },
    ),
  ).toMatchObject({
    status: "no_offers_found",
    environment: "test",
    searchedAt: provenance.searchedAt,
  });
  expect(searchFlights).toHaveBeenCalledWith(
    {
      origin: input.origin,
      destination: input.destination,
      departureDate: input.departureDate,
      returnDate: undefined,
      passengers: 2,
      cabinClass: "economy",
    },
    { organizationId: "verified" },
  );
});
it.each(["error", "not_connected", "throw"])("handles provider failure %s", async (status) => {
  const searchFlights =
    status === "throw"
      ? vi.fn().mockRejectedValue(new Error("secret"))
      : vi.fn().mockResolvedValue({ status, message: "secret" });
  const result = await runFlightCheck(
    input,
    { searchFlights },
    { organizationId: "verified" as OrganizationId },
  );
  expect(result.status).toBe("search_failed");
  expect(JSON.stringify(result)).not.toContain("secret");
});
it("does not manufacture comparison evidence from search filters", async () => {
  const searchFlights = vi.fn().mockResolvedValue({
    status: "ok",
    offers: [entry().offer],
    fetchedAt: provenance.searchedAt,
    environment: "test",
  });
  expect(
    (
      await runFlightCheck(
        input,
        { searchFlights },
        { organizationId: "verified" as OrganizationId },
      )
    ).status,
  ).toBe("insufficient_data");
});

it("compares verified round-trip offers", () => {
  const e = entry();
  e.offer.inbound = {
    segments: [
      {
        ...e.offer.outbound!.segments[0]!,
        origin: "IST",
        destination: "ALA",
        departureAt: "2099-12-20T10:00:00+03:00",
        arrivalAt: "2099-12-20T18:00:00+05:00",
      },
    ],
  };
  expect(compare([e], { ...input, tripType: "round_trip", returnDate: "2099-12-20" }).status).toBe(
    "better_offer_found",
  );
});
it("passes through verified offer evidence and test provenance", async () => {
  const { offer, ...evidence } = entry();
  offer.comparisonEvidence = evidence;
  const searchFlights = vi.fn().mockResolvedValue({
    status: "ok",
    offers: [offer],
    fetchedAt: provenance.searchedAt,
    environment: "test",
  });
  const result = await runFlightCheck(
    input,
    { searchFlights },
    { organizationId: "verified" as OrganizationId },
  );
  expect(result).toMatchObject({
    status: "better_offer_found",
    environment: "test",
    providers: ["synthetic"],
  });
  expect(result.limitations.join(" ")).toContain("must not be represented as live bookable");
});
it.each([
  ["JPY", 300, 200, 100],
  ["KWD", 1.234, 1.111, 0.123],
] as const)("uses %s minor units", (currency, originalPrice, price, savings) => {
  const e = entry(price);
  e.offer.price.currency = currency;
  expect(compare([e], { ...input, originalCurrency: currency, originalPrice }).savingsAmount).toBe(
    savings,
  );
});
