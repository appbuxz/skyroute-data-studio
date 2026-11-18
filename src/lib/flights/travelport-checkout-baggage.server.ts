import { z } from "zod";
import type { CheckoutBaggage, CheckoutBaggageAllowance } from "./types";

const sequence = z.number().int().positive();
const allowance = z.object({
  baggageType: z.enum(["FirstCheckedBag", "SecondCheckedBag", "AdditionalBags", "CarryOn"]),
  passengerTypeCodes: z.array(z.string()).optional(),
  ProductRef: z.array(z.string()).min(1).optional(),
  SegmentSequenceList: z.array(sequence).min(1).optional(),
  Text: z.array(z.string()).optional(),
  BaggageItem: z.array(z.unknown()).optional(),
});
const item = z.object({
  includedInOfferPrice: z.enum(["Yes", "No", "Unknown"]).optional(),
  quantity: z.number().int().nonnegative().optional(),
  Text: z.string().optional(),
  Measurement: z.array(z.unknown()).optional(),
});
const weight = z.object({
  measurementType: z.literal("Weight"),
  unit: z.enum(["Kilograms", "Pounds"]),
  value: z.number().finite().positive(),
});
const pricedOffer = z.object({
  Product: z
    .array(
      z.object({
        id: z.string(),
        FlightSegment: z.array(z.object({ sequence })).min(1),
      }),
    )
    .min(1),
  TermsAndConditionsFull: z.array(z.unknown()).optional(),
});
const terms = z.object({ BaggageAllowance: z.array(z.unknown()) });
type Allowance = z.infer<typeof allowance>;
type Bag = CheckoutBaggageAllowance;

function readAllowance(row: Allowance): Bag | undefined {
  const parsed = item.safeParse(row.BaggageItem?.[0]);
  if ((row.BaggageItem?.length ?? 0) > 1 || (row.BaggageItem?.length && !parsed.success)) return;
  const bag = parsed.data;
  const zeroPieces = row.Text?.some((text) => text.trim() === "0P");
  if (bag?.includedInOfferPrice === "No") return { status: "not_included" };
  if (bag?.includedInOfferPrice !== "Yes") {
    if (zeroPieces || bag?.quantity === 0) return { status: "not_included" };
    return;
  }
  if (zeroPieces || bag.quantity === 0) return;

  const weights = (bag.Measurement ?? []).flatMap((raw) => {
    const measured = weight.safeParse(raw);
    return measured.success ? [measured.data] : [];
  });
  const measurement = weights.find((entry) => entry.unit === "Kilograms") ?? weights[0];
  // GDS can disclose the weight only in its standard UPTO50LB/23KG item text.
  const kgInText = bag.Text?.match(
    /^UPTO\s*(?:\d+(?:\.\d+)?\s*LB\s*\/\s*)?(\d+(?:\.\d+)?)\s*KG\b/i,
  );
  const kg = kgInText ? Number(kgInText[1]) : 0;
  const conflictingWeight =
    measurement &&
    weights.some((entry) => entry.unit === measurement.unit && entry.value !== measurement.value);
  const confirmedWeight = measurement
    ? !conflictingWeight && {
        value: measurement.value,
        unit: measurement.unit === "Kilograms" ? ("kg" as const) : ("lb" as const),
      }
    : kg > 0 && Number.isFinite(kg)
      ? { value: kg, unit: "kg" as const }
      : undefined;
  return {
    status: "included",
    ...(bag.quantity !== undefined && { pieces: bag.quantity }),
    ...(confirmedWeight && { weight: confirmedWeight }),
  };
}

function checkedAllowance(first: Bag | undefined, second: Bag | undefined, extra: Bag | undefined) {
  if (
    !first ||
    (second && second.status === "included" && first.status !== "included") ||
    extra?.status === "included"
  )
    return;
  if (second?.status !== "included") return first;
  // These entries describe different bag ordinals. Combine only individual pieces.
  if (first.status !== "included" || first.pieces !== 1 || second.pieces !== 1) return;
  const matchingWeight =
    first.weight?.value === second.weight?.value && first.weight?.unit === second.weight?.unit
      ? first.weight
      : undefined;
  return {
    status: "included" as const,
    pieces: 2,
    ...(matchingWeight && { weight: matchingWeight }),
  };
}

export function readTravelportCheckoutBaggage(selectedOffer: unknown): CheckoutBaggage | undefined {
  const parsed = pricedOffer.safeParse(selectedOffer);
  if (!parsed.success) return;
  const { Product, TermsAndConditionsFull } = parsed.data;
  const rows = (TermsAndConditionsFull ?? []).flatMap((raw) => {
    const term = terms.safeParse(raw);
    if (!term.success) return [];
    return term.data.BaggageAllowance.flatMap((rawRow) => {
      const row = allowance.safeParse(rawRow);
      if (
        !row.success ||
        (row.data.passengerTypeCodes && !row.data.passengerTypeCodes.includes("ADT")) ||
        (row.data.ProductRef
          ? row.data.ProductRef.some((ref) => !Product.some((p) => p.id === ref))
          : Product.length !== 1)
      )
        return [];
      return [row.data];
    });
  });
  const segments = Product.flatMap((product) =>
    product.FlightSegment.map((segment) => {
      const applicable = rows.filter(
        (row) =>
          (!row.ProductRef || row.ProductRef.includes(product.id)) &&
          (!row.SegmentSequenceList || row.SegmentSequenceList.includes(segment.sequence)),
      );
      function read(type: Allowance["baggageType"]) {
        const matches = applicable.filter((row) => row.baggageType === type);
        return {
          present: matches.length > 0,
          value: matches.length === 1 ? readAllowance(matches[0]!) : undefined,
        };
      }
      const first = read("FirstCheckedBag");
      const second = read("SecondCheckedBag");
      const extra = read("AdditionalBags");
      return {
        checked:
          (second.present && !second.value) || (extra.present && !extra.value)
            ? undefined
            : checkedAllowance(first.value, second.value, extra.value),
        cabin: read("CarryOn").value,
      };
    }),
  );
  // Expose a trip-wide value only when the same allowance is confirmed on every segment.
  const common = (key: keyof CheckoutBaggage) => {
    const value = segments[0]?.[key];
    return value &&
      segments.every((segment) => JSON.stringify(segment[key]) === JSON.stringify(value))
      ? value
      : undefined;
  };
  const checked = common("checked");
  const cabin = common("cabin");
  if (!checked && !cabin) return undefined;
  return { ...(checked && { checked }), ...(cabin && { cabin }) };
}
