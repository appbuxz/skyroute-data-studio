import { describe, expect, it } from "vitest";
import fixture from "./fixtures/travelport-core.json";
import { normalizeTravelportFlights } from "./travelport-normalizer";
import { compareFlightCheck, flightCheckSchema } from "./flight-check";

// Synthetic additions to the real schedule subset, following the documented GDS Search schema.
function sample(quantity = 1) {
  const data = structuredClone(fixture);
  const root = data.CatalogProductOfferingsResponse;
  const v =
    root.CatalogProductOfferings.CatalogProductOffering[0]!.ProductBrandOptions[0]!
      .ProductBrandOffering[0]!;
  const id = v.Product[0]!.productRef;
  const product = root.ReferenceList.flatMap((r) => r.Product ?? []).find((p) => p.id === id)!;
  Object.assign(product.PassengerFlight[0]!, {
    passengerTypeCode: "ADT",
    passengerQuantity: quantity,
  });
  const amount = {
    CurrencyCode: { value: "GBP" },
    Base: 100,
    Taxes: { TotalTaxes: 20 },
    Fees: { TotalFees: 5 },
    Total: 125,
  };
  const price = {
    CurrencyCode: { value: "GBP" },
    Base: 100 * quantity,
    TotalTaxes: 20 * quantity,
    TotalFees: 5 * quantity,
    TotalPrice: 125 * quantity,
    PriceBreakdown: [
      { "@type": "PriceBreakdownAir", quantity, requestedPassengerType: "ADT", Amount: amount },
    ],
  };
  Object.assign(v, {
    ContentSource: "GDS",
    BestCombinablePrice: price,
    TermsAndConditions: { termsAndConditionsRef: "test-terms" },
  });
  const rows = ["FirstCheckedBag", "CarryOn"].map((baggageType) => ({
    baggageType,
    ProductRef: [id],
    passengerTypeCodes: ["ADT"],
    SegmentSequenceList: product.FlightSegment.map((s) => s.sequence),
    BaggageItem: [
      {
        quantity: 1,
        includedInOfferPrice: "Yes",
        soldByPieceInd: true,
        Measurement: [{ measurementType: "Weight", unit: "Kilograms", value: 23 }],
      },
    ],
  }));
  Object.assign(root.ReferenceList, {
    [root.ReferenceList.length]: {
      TermsAndConditions: [{ id: "test-terms", BaggageAllowance: rows }],
    },
  });
  return { data, price, rows, product, offer: () => normalizeTravelportFlights(data).offers[0]! };
}
describe("Travelport comparison evidence (synthetic)", () => {
  it.each([1, 2, 9])("verifies totals for %i adults without changing price", (n) => {
    const x = sample(n),
      o = x.offer();
    expect(o.price).toEqual({ amount: 125 * n, currency: "GBP" });
    expect(o.comparisonEvidence).toEqual({
      passengers: n,
      priceScope: "all_passengers_total",
      mandatoryChargesIncluded: true,
      baggageScopes: {
        checked: "all_passengers_all_segments",
        cabin: "all_passengers_all_segments",
      },
      baggageScope: "all_passengers_all_segments",
    });
    expect(o.baggage?.checked).toEqual({ pieces: 1, weightKg: 23 });
  });
  it("does not mistake per-person totals for group totals", () => {
    const x = sample(2);
    x.price.TotalPrice = 125;
    expect(x.offer().comparisonEvidence?.priceScope).toBeUndefined();
  });
  it.each(["TotalFees", "TotalTaxes"] as const)("missing %s stays unknown", (field) => {
    const x = sample();
    Reflect.deleteProperty(x.price, field);
    expect(x.offer().comparisonEvidence?.mandatoryChargesIncluded).toBeUndefined();
  });
  it("inconsistent charges stay unknown", () => {
    const x = sample();
    x.price.TotalFees = 0;
    expect(x.offer().comparisonEvidence?.mandatoryChargesIncluded).toBeUndefined();
  });
  it("explicit paid baggage means no included pieces", () => {
    const x = sample();
    x.rows[0]!.BaggageItem[0]!.includedInOfferPrice = "No";
    expect(x.offer().baggage?.checked).toEqual({ pieces: 0 });
  });
  it.each(["missing", "passenger", "segment", "duplicate", "unknown", "product"])(
    "preserves %s baggage uncertainty",
    (kind) => {
      const x = sample();
      if (kind === "missing") x.rows.splice(0, 1);
      if (kind === "passenger") x.rows[0]!.passengerTypeCodes = ["CNN"];
      if (kind === "segment") x.rows[0]!.SegmentSequenceList = [99];
      if (kind === "duplicate") x.rows.push(structuredClone(x.rows[0]!));
      if (kind === "unknown") x.rows[0]!.BaggageItem[0]!.includedInOfferPrice = "Unknown";
      if (kind === "product") x.rows[0]!.ProductRef = ["other"];
      expect(x.offer().baggage?.checked).toBeUndefined();
      expect(x.offer().comparisonEvidence?.baggageScope).toBeUndefined();
    },
  );
  it("accepts multiple distinct product references including the selected product", () => {
    const x = sample();
    for (const row of x.rows) row.ProductRef = ["other-valid-product", x.product.id];
    expect(x.offer().comparisonEvidence?.baggageScope).toBe("all_passengers_all_segments");
    expect(x.offer().baggage?.checked).toEqual({ pieces: 1, weightKg: 23 });
  });
  it.each([[], ["other"], [""], [" "], ["p", "p"]].map((refs) => ({ refs })))(
    "rejects missing, unrelated or ambiguous product references %j",
    ({ refs }) => {
      const x = sample();
      x.rows[0]!.ProductRef = refs;
      expect(x.offer().baggage?.checked).toBeUndefined();
      expect(x.offer().comparisonEvidence?.baggageScopes?.checked).toBeUndefined();
    },
  );
  it("rejects malformed or duplicate product references even when the product is included", () => {
    for (const extra of ["", " ", " padded ", null, 12, undefined]) {
      const x = sample();
      Object.assign(x.rows[0]!, { ProductRef: [x.product.id, extra] });
      expect(x.offer().baggage?.checked).toBeUndefined();
    }
    const x = sample();
    x.rows[0]!.ProductRef = [x.product.id, x.product.id];
    expect(x.offer().baggage?.checked).toBeUndefined();
    Reflect.deleteProperty(x.rows[0]!, "ProductRef");
    expect(x.offer().baggage?.checked).toBeUndefined();
  });
  it.each(["checked", "cabin"] as const)(
    "retains verified %s scope independently of the other allowance",
    (known) => {
      const x = sample();
      const unknown = known === "checked" ? "cabin" : "checked";
      const row = x.rows[known === "checked" ? 1 : 0]!;
      x.rows.push(structuredClone(row));
      const o = x.offer();
      expect(o.baggage?.[known]).toEqual({ pieces: 1, weightKg: 23 });
      expect(o.baggage?.[unknown]).toBeUndefined();
      expect(o.comparisonEvidence?.baggageScopes).toEqual({
        [known]: "all_passengers_all_segments",
      });
      expect(o.comparisonEvidence?.baggageScope).toBeUndefined();
    },
  );
  it.each(["checked", "cabin"] as const)(
    "requires complete passenger and segment applicability for %s scope",
    (kind) => {
      for (const invalid of [
        { passengerTypeCodes: [] },
        { passengerTypeCodes: ["CNN"] },
        { passengerTypeCodes: ["ADT", "CNN"] },
        { SegmentSequenceList: [] },
        { SegmentSequenceList: [99] },
        { SegmentSequenceList: [1, 1] },
      ]) {
        const x = sample();
        Object.assign(x.rows[kind === "checked" ? 0 : 1]!, invalid);
        expect(x.offer().baggage?.[kind]).toBeUndefined();
        expect(x.offer().comparisonEvidence?.baggageScopes?.[kind]).toBeUndefined();
      }
    },
  );
  it("does not parse text into weights", () => {
    const x = sample();
    Reflect.deleteProperty(x.rows[0]!.BaggageItem[0]!, "Measurement");
    Object.assign(x.rows[0]!.BaggageItem[0]!, { Text: "23KG" });
    expect(x.offer().baggage?.checked).toEqual({ pieces: 1 });
  });
  it("calculates savings only from complete normalized evidence", () => {
    const x = sample(2),
      o = x.offer();
    const input = flightCheckSchema.parse({
      origin: o.origin,
      destination: o.destination,
      departureDate: o.departureAt.slice(0, 10),
      passengers: 2,
      cabinClass: o.cabinClass,
      tripType: "one_way",
      originalPrice: 300,
      originalCurrency: "GBP",
      baggage: { status: "known", checked: { pieces: 1, weightKg: 23 }, cabin: { pieces: 1 } },
    });
    const compare = () => {
      const offer = x.offer();
      return compareFlightCheck(input, [{ offer, ...offer.comparisonEvidence }], {
        environment: "test",
        searchedAt: "2026-11-13T00:00:00Z",
      });
    };
    expect(compare()).toMatchObject({
      status: "better_offer_found",
      savingsAmount: 50,
      savingsPercentage: 16.67,
      environment: "test",
      providers: ["travelport"],
    });
    x.rows.splice(0, 1);
    expect(compare()).toMatchObject({ status: "insufficient_data" });
    expect(compare().savingsAmount).toBeUndefined();
  });
  it.each(["NDC", "passenger_type", "multiple_breakdowns", "currency", "quantity"])(
    "rejects ambiguous %s price evidence",
    (kind) => {
      const x = sample();
      if (kind === "NDC")
        Object.assign(
          x.data.CatalogProductOfferingsResponse.CatalogProductOfferings.CatalogProductOffering[0]!
            .ProductBrandOptions[0]!.ProductBrandOffering[0]!,
          { ContentSource: "NDC" },
        );
      if (kind === "passenger_type")
        Object.assign(x.product.PassengerFlight[0]!, { passengerTypeCode: "CNN" });
      if (kind === "multiple_breakdowns")
        x.price.PriceBreakdown.push(structuredClone(x.price.PriceBreakdown[0]!));
      if (kind === "currency") x.price.PriceBreakdown[0]!.Amount.CurrencyCode.value = "USD";
      if (kind === "quantity") x.price.PriceBreakdown[0]!.quantity = 2;
      expect(x.offer().comparisonEvidence?.priceScope).toBeUndefined();
    },
  );
  it("whitelisted real fixture remains insufficient", () => {
    expect(
      normalizeTravelportFlights(fixture).offers.every((o) => !o.comparisonEvidence && !o.baggage),
    ).toBe(true);
  });
});

// Field-whitelisted prices and baggage from the same local captured response as core.json.
import realEvidence from "./fixtures/travelport-comparison.json";
it("normalizes captured evidence without resolving duplicate carry-on descriptions", () => {
  const result = normalizeTravelportFlights(realEvidence);
  expect(result.skipped).toEqual([]);
  expect(result.offers.every((o) => o.comparisonEvidence?.mandatoryChargesIncluded === true)).toBe(
    true,
  );
  expect(result.offers.every((o) => o.comparisonEvidence?.passengers === 1)).toBe(true);
  expect(result.offers.every((o) => o.comparisonEvidence?.baggageScope === undefined)).toBe(true);
  expect(
    result.offers.every(
      (o) => o.comparisonEvidence?.baggageScopes?.checked === "all_passengers_all_segments",
    ),
  ).toBe(true);
  expect(
    result.offers.every((o) => !o.baggage?.cabin && !o.comparisonEvidence?.baggageScopes?.cabin),
  ).toBe(true);
});
