import { expect, it } from "vitest";
import { analyzeComparablePrices } from "./comparable-prices";
import type { FlightOffer } from "./types";
import fixture from "./fixtures/travelport-core.json";
import { normalizeTravelportFlights } from "./travelport-normalizer";

const base = normalizeTravelportFlights(fixture).offers[0]!;
const passengers = { adults: 1, children: 0, infants: 0 };
function offer(id: string, amount: number): FlightOffer {
  return { ...structuredClone(base), id, price: { amount, currency: "USD" } };
}
const entry = (offer: FlightOffer) => ({ offer, passengers });

it("calculates minimum, maximum and potential difference without mutating inputs", () => {
  const entries = [entry(offer("a", 300)), entry(offer("b", 100)), entry(offer("c", 200))];
  const before = structuredClone(entries);
  const groups = analyzeComparablePrices(entries);
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({
    minimumPrice: 100,
    maximumPrice: 300,
    potentialPriceDifference: 200,
    currency: "USD",
  });
  expect(entries).toEqual(before);
});

it.each(["origin", "destination", "carrier", "flightNumber", "departureAt", "arrivalAt"] as const)(
  "separates segment %s",
  (field) => {
    const changed = offer("b", 100);
    changed.outbound!.segments[0]![field] += "-different";
    expect(analyzeComparablePrices([entry(offer("a", 300)), entry(changed)])).toEqual([]);
  },
);

it("separates segment order and inbound itineraries", () => {
  const a = offer("a", 300);
  a.outbound!.segments.push({ ...a.outbound!.segments[0]!, flightNumber: "SECOND" });
  const b = structuredClone(a);
  b.id = "b";
  b.outbound!.segments.reverse();
  expect(analyzeComparablePrices([entry(a), entry(b)])).toEqual([]);
  b.outbound = structuredClone(a.outbound!);
  b.inbound = structuredClone(a.outbound!);
  expect(analyzeComparablePrices([entry(a), entry(b)])).toEqual([]);
});

it("never compares different passenger compositions", () => {
  expect(
    analyzeComparablePrices([
      entry(offer("a", 100)),
      { offer: offer("b", 200), passengers: { adults: 2, children: 0, infants: 0 } },
      { offer: offer("c", 300), passengers: { adults: 1, children: 1, infants: 0 } },
    ]),
  ).toEqual([]);
});

it("groups currencies separately, without conversion", () => {
  const usd = [offer("a", 100), offer("b", 200)];
  const eur = [offer("c", 150), offer("d", 400)];
  eur.forEach((o) => (o.price.currency = "EUR"));
  expect(
    analyzeComparablePrices([...usd, ...eur].map(entry)).map((g) => [
      g.currency,
      g.potentialPriceDifference,
    ]),
  ).toEqual([
    ["USD", 100],
    ["EUR", 250],
  ]);
});

it.each([
  { cabinClass: "business" },
  { baggage: { checked: { pieces: 1 } } },
  { fareBrand: "Flex" },
  { refundable: true },
  { changeable: false },
] satisfies Partial<FlightOffer>[])(
  "separates differences in known fare conditions %j",
  (change) => {
    expect(
      analyzeComparablePrices([entry(offer("a", 100)), entry({ ...offer("b", 200), ...change })]),
    ).toEqual([]);
  },
);

it("groups equal known conditions regardless of baggage property order", () => {
  const a = {
    ...offer("a", 100),
    baggage: { checked: { pieces: 1, weightKg: 23 } },
    refundable: false,
  };
  const b = {
    ...offer("b", 200),
    baggage: { checked: { weightKg: 23, pieces: 1 } },
    refundable: false,
  };
  expect(analyzeComparablePrices([entry(a), entry(b)])).toHaveLength(1);
});

it("excludes summary-only offers and invalid prices or passenger context", () => {
  const summary = offer("b", 200);
  delete summary.outbound;
  expect(
    analyzeComparablePrices([
      entry(offer("a", 100)),
      entry(summary),
      entry(offer("c", NaN)),
      entry(offer("d", -1)),
      { offer: offer("e", 400), passengers: { adults: 0, children: 0, infants: 0 } },
    ]),
  ).toEqual([]);
});
