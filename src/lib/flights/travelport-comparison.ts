import { z } from "zod";
import type { FlightBaggage, FlightOfferComparisonEvidence } from "./types";

const money = z.number().finite().nonnegative();
const count = z.number().int().positive().max(9);
const currency = z.object({ value: z.string().regex(/^[A-Z]{3}$/) });
const priceSchema = z.object({
  Base: money,
  TotalTaxes: money,
  TotalFees: money,
  TotalPrice: money,
  CurrencyCode: currency,
  PriceBreakdown: z
    .array(
      z.object({
        "@type": z.literal("PriceBreakdownAir"),
        quantity: count,
        requestedPassengerType: z.literal("ADT"),
        Amount: z.object({
          CurrencyCode: currency,
          Base: money,
          Taxes: z.object({ TotalTaxes: money }),
          Fees: z.object({ TotalFees: money }),
          Total: money,
        }),
      }),
    )
    .length(1),
});
const passengerSchema = z
  .array(z.object({ passengerQuantity: count, passengerTypeCode: z.literal("ADT") }))
  .length(1);
const allowanceSchema = z.object({
  passengerTypeCodes: z.array(z.string()).length(1),
  ProductRef: z.array(z.string()).length(1),
  SegmentSequenceList: z.array(z.number().int().positive()).min(1),
  baggageType: z.string(),
  BaggageItem: z
    .array(
      z.object({
        quantity: z.number().int().nonnegative(),
        includedInOfferPrice: z.enum(["Yes", "No"]),
        soldByPieceInd: z.literal(true),
        Measurement: z
          .array(
            z.object({
              measurementType: z.literal("Weight"),
              unit: z.literal("Kilograms"),
              value: money,
            }),
          )
          .max(1)
          .optional(),
      }),
    )
    .length(1),
});
// Search reference semantics and deliberately unsupported shapes are recorded in docs/travelport-comparison-evidence.md.
export function travelportComparison(
  variant: { BestCombinablePrice: unknown; TermsAndConditions?: unknown; ContentSource?: unknown },
  product: { id: string; PassengerFlight: unknown; FlightSegment: { sequence: number }[] },
  references: unknown[],
): { comparisonEvidence?: FlightOfferComparisonEvidence; baggage?: FlightBaggage } {
  if (variant.ContentSource !== "GDS") return {};
  const evidence: FlightOfferComparisonEvidence = {};
  const passengers = passengerSchema.safeParse(product.PassengerFlight);
  const price = priceSchema.safeParse(variant.BestCombinablePrice);
  // Adult-only request contract. Do not silently equate children/infants with requested adults.
  if (passengers.success && price.success) {
    const p = price.data,
      b = p.PriceBreakdown[0]!,
      a = b.Amount;
    const equal = (x: number, y: number) => Math.abs(x - y) < 1e-7;
    if (
      b.quantity === passengers.data[0]!.passengerQuantity &&
      a.CurrencyCode.value === p.CurrencyCode.value &&
      equal(a.Total * b.quantity, p.TotalPrice)
    ) {
      evidence.passengers = b.quantity;
      evidence.priceScope = "all_passengers_total";
      if (
        equal(a.Base + a.Taxes.TotalTaxes + a.Fees.TotalFees, a.Total) &&
        equal(p.Base + p.TotalTaxes + p.TotalFees, p.TotalPrice) &&
        equal(a.Base * b.quantity, p.Base) &&
        equal(a.Taxes.TotalTaxes * b.quantity, p.TotalTaxes) &&
        equal(a.Fees.TotalFees * b.quantity, p.TotalFees)
      )
        evidence.mandatoryChargesIncluded = true;
    }
  }
  const baggage: FlightBaggage = {};
  const ref = z.object({ termsAndConditionsRef: z.string() }).safeParse(variant.TermsAndConditions);
  const terms = references
    .flatMap((r) => {
      const parsed = z.object({ TermsAndConditions: z.array(z.unknown()) }).safeParse(r);
      return parsed.success ? parsed.data.TermsAndConditions : [];
    })
    .filter(
      (t) =>
        z.object({ id: z.literal(ref.success ? ref.data.termsAndConditionsRef : "") }).safeParse(t)
          .success,
    );
  const term =
    terms.length === 1
      ? z.object({ BaggageAllowance: z.array(z.unknown()) }).safeParse(terms[0])
      : undefined;
  if (passengers.success && ref.success && term?.success) {
    for (const [kind, type] of [
      ["checked", "FirstCheckedBag"],
      ["cabin", "CarryOn"],
    ] as const) {
      const rows = term.data.BaggageAllowance.filter(
        (r) => z.object({ baggageType: z.literal(type) }).safeParse(r).success,
      );
      // Multiple entries may describe distinct bags or conflicting conditions: never sum or deduplicate them.
      if (rows.length !== 1) continue;
      const row = allowanceSchema.safeParse(rows[0]);
      if (!row.success) continue;
      const r = row.data,
        sequences = r.SegmentSequenceList;
      if (
        r.passengerTypeCodes[0] !== "ADT" ||
        r.ProductRef[0] !== product.id ||
        sequences.length !== product.FlightSegment.length ||
        new Set(sequences).size !== sequences.length ||
        !product.FlightSegment.every((s) => sequences.includes(s.sequence))
      )
        continue;
      // Higher checked-bag entries could add an allowance or contradict the first bag. Only explicit paid entries are harmless.
      if (
        kind === "checked" &&
        term.data.BaggageAllowance.some((raw) => {
          const other = z.object({ baggageType: z.string() }).safeParse(raw);
          if (
            !other.success ||
            !["SecondCheckedBag", "AdditionalBags"].includes(other.data.baggageType)
          )
            return false;
          const parsed = allowanceSchema.safeParse(raw);
          return !parsed.success || parsed.data.BaggageItem[0]!.includedInOfferPrice !== "No";
        })
      )
        continue;
      const item = r.BaggageItem[0]!;
      baggage[kind] =
        item.includedInOfferPrice === "No"
          ? { pieces: 0 }
          : {
              pieces: item.quantity,
              ...(item.Measurement?.[0] ? { weightKg: item.Measurement[0].value } : {}),
            };
    }
    if (baggage.checked && baggage.cabin) evidence.baggageScope = "all_passengers_all_segments";
  }
  return {
    ...(Object.keys(evidence).length ? { comparisonEvidence: evidence } : {}),
    ...(Object.keys(baggage).length ? { baggage } : {}),
  };
}
