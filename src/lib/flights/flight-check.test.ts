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
const compare = (entries: FlightCheckOffer[], original: FlightCheckInput = input) =>
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

it.each(["checked", "cabin"] as const)("rejects %s-only scope evidence without savings", (kind) => {
  const e = entry();
  delete e.baggageScope;
  e.baggageScopes = { [kind]: "all_passengers_all_segments" };
  const result = compare([e]);
  expect(result.status).toBe("insufficient_data");
  expect(result.comparableOfferCount).toBe(0);
  expect(result.savingsAmount).toBeUndefined();
  expect(result.insufficientOffers[0]?.reason).toBe(
    "Baggage conditions unknown or scope unverified",
  );
});

const requirementsInput: FlightCheckInput = {
  ...input,
  mode: "requirements_match",
  baggageRequirements: {
    checked: { status: "required", pieces: 1, weightKg: 20 },
    cabin: { status: "not_required" },
  },
};
function requirementsEntry() {
  const e = entry();
  delete e.baggageScope;
  e.baggageScopes = { checked: "all_passengers_all_segments" };
  e.offer.baggage = { checked: { pieces: 2, weightKg: 23 } };
  return e;
}
it("preserves explicit strict mode behavior", () => {
  expect(compare([entry()], { ...input, mode: "strict_equivalence" })).toEqual(compare([entry()]));
});
it("qualifies larger independently verified checked allowance without cabin evidence", () => {
  const result = compare([requirementsEntry()], requirementsInput);
  expect(result).toMatchObject({
    comparableOfferCount: 1,
    savingsAmount: 100.2,
    savingsPercentage: 33.37,
  });
  expect(result.requirementEvaluations?.[0]).toMatchObject({ status: "requirements_met" });
});
it.each([
  [{ pieces: 0, weightKg: 23 }, "requirements_not_met"],
  [{ pieces: 2 }, "requirements_unknown"],
  [{ pieces: 2, weightKg: 19 }, "requirements_not_met"],
  [undefined, "requirements_unknown"],
] as const)("evaluates checked allowance %j as %s", (checked, status) => {
  const e = requirementsEntry();
  e.offer.baggage = checked ? { checked } : {};
  const result = compare([e], requirementsInput);
  expect(result.requirementEvaluations?.[0]?.status).toBe(status);
  expect(result.savingsAmount).toBeUndefined();
  expect(result.comparableOfferCount).toBe(0);
  expect(result.requirementEvaluations?.[0]?.priceDifference).toBe(
    status === "requirements_unknown" ? 100.2 : undefined,
  );
});
it("requires cabin evidence when selected and prioritizes any failed requirement", () => {
  const selected: FlightCheckInput = {
    ...requirementsInput,
    mode: "requirements_match",
    baggageRequirements: {
      checked: { status: "required", pieces: 1 },
      cabin: { status: "required", pieces: 1 },
    },
  };
  const e = requirementsEntry();
  expect(compare([e], selected).requirementEvaluations?.[0]?.status).toBe("requirements_unknown");
  e.offer.baggage!.checked!.pieces = 0;
  expect(compare([e], selected).requirementEvaluations?.[0]).toMatchObject({
    status: "requirements_not_met",
    reasons: expect.arrayContaining([
      expect.objectContaining({ requirement: "checked", status: "requirements_not_met" }),
      expect.objectContaining({ requirement: "cabin", status: "requirements_unknown" }),
    ]),
  });
});
it.each([
  {},
  { checked: { status: "not_required" } },
  { checked: { status: "required", pieces: 0 }, cabin: { status: "not_required" } },
  { checked: { status: "required", pieces: 1, weightKg: -1 }, cabin: { status: "not_required" } },
])("requires explicit valid independent selections %j", (baggageRequirements) => {
  expect(flightCheckSchema.safeParse({ ...requirementsInput, baggageRequirements }).success).toBe(
    false,
  );
});
it.each([
  (e: FlightCheckOffer) => {
    delete e.priceScope;
  },
  (e: FlightCheckOffer) => {
    e.mandatoryChargesIncluded = false;
  },
  (e: FlightCheckOffer) => {
    e.offer.price.currency = "EUR";
  },
  (e: FlightCheckOffer) => {
    e.offer.price.amount = NaN;
  },
  (e: FlightCheckOffer) => {
    delete e.passengers;
  },
  (e: FlightCheckOffer) => {
    e.passengers = 1;
  },
  (e: FlightCheckOffer) => {
    e.offer.outbound!.segments[0]!.departureAt = "2099-12-11T10:00:00Z";
  },
])(
  "suppresses differences and qualification for unverified or incompatible pricing/itinerary",
  (change) => {
    const e = requirementsEntry();
    change(e);
    const result = compare([e], requirementsInput);
    expect(result.requirementEvaluations?.[0]?.priceDifference).toBeUndefined();
    expect(result.savingsAmount).toBeUndefined();
    expect(result.comparableOfferCount).toBe(0);
  },
);
it("requires applicability across all passengers and segments", () => {
  const e = requirementsEntry();
  delete e.baggageScopes;
  expect(compare([e], requirementsInput).requirementEvaluations?.[0]?.status).toBe(
    "requirements_unknown",
  );
});
it("integrates captured normalized Travelport evidence without inventing cabin allowance", async () => {
  const { default: fixture } = await import("./fixtures/travelport-comparison.json");
  const { normalizeTravelportFlights } = await import("./travelport-normalizer");
  const { offers } = normalizeTravelportFlights(fixture);
  const offer = offers.find((o) => o.comparisonEvidence?.baggageScopes?.checked)!;
  expect(offer).toBeDefined();
  expect(offer.baggage?.cabin).toBeUndefined();
  const selected = flightCheckSchema.parse({
    ...requirementsInput,
    origin: offer.origin,
    destination: offer.destination,
    departureDate: offer.departureAt.slice(0, 10),
    passengers: 1,
    cabinClass: offer.cabinClass,
    originalCurrency: offer.price.currency,
    originalPrice: offer.price.amount + 100,
    baggageRequirements: { checked: { status: "not_required" }, cabin: { status: "not_required" } },
  });
  const searchFlights = vi.fn().mockResolvedValue({
    status: "ok",
    offers: [offer],
    fetchedAt: provenance.searchedAt,
    environment: "test",
  });
  const result = await runFlightCheck(
    selected,
    { searchFlights },
    { organizationId: "verified" as OrganizationId },
  );
  expect(result).toMatchObject({
    status: "better_offer_found",
    savingsAmount: 100,
    environment: "test",
  });
  const requiredCabin = {
    ...selected,
    mode: "requirements_match" as const,
    baggageRequirements: {
      checked: { status: "not_required" as const },
      cabin: { status: "required" as const, pieces: 1 },
    },
  };
  expect(
    compareFlightCheck(requiredCabin, [{ ...offer.comparisonEvidence, offer }], provenance)
      .requirementEvaluations?.[0]?.status,
  ).toBe("requirements_unknown");
});
it.each([
  { baggageRequirements: undefined },
  { originalCurrency: "US" },
  { originalPrice: -1 },
  { originalPrice: 1.001 },
  { passengers: 10 },
  {
    baggageRequirements: {
      checked: { status: "required", pieces: 1.5 },
      cabin: { status: "not_required" },
    },
  },
  {
    baggageRequirements: {
      checked: { status: "required", pieces: 1, weightKg: Infinity },
      cabin: { status: "not_required" },
    },
  },
])("validates requirements-mode inputs %j", (change) => {
  expect(flightCheckSchema.safeParse({ ...requirementsInput, ...change }).success).toBe(false);
});
it("does not emit potential savings for a qualifying more expensive offer", () => {
  const e = requirementsEntry();
  e.offer.price.amount = 400;
  expect(compare([e], requirementsInput)).toMatchObject({
    status: "no_better_offer_found",
    comparableOfferCount: 1,
  });
  expect(compare([e], requirementsInput).savingsAmount).toBeUndefined();
});
it("preserves requirements-mode search failure handling", async () => {
  const result = await runFlightCheck(
    requirementsInput,
    { searchFlights: vi.fn().mockRejectedValue(new Error("secret")) },
    { organizationId: "verified" as OrganizationId },
  );
  expect(result).toMatchObject({
    status: "search_failed",
    environment: "unknown",
    requirementEvaluations: [],
  });
  expect(JSON.stringify(result)).not.toContain("secret");
});
