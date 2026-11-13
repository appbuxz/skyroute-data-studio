import { z } from "zod";
import { flightSearchSchema } from "./search-schema";
import type { FlightOffer, FlightOfferComparisonEvidence } from "./types";

const allowance = z.object({
  pieces: z.number().int().nonnegative(),
  weightKg: z.number().finite().nonnegative().optional(),
});
export const flightCheckSchema = flightSearchSchema
  .and(
    z.object({
      tripType: z.enum(["one_way", "round_trip"]),
      originalPrice: z.number().finite().positive(),
      originalCurrency: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{3}$/),
      baggage: z.discriminatedUnion("status", [
        z.object({ status: z.literal("unknown") }),
        z.object({ status: z.literal("known"), checked: allowance, cabin: allowance }),
      ]),
    }),
  )
  .superRefine((value, ctx) => {
    for (const key of ["departureDate", "returnDate"] as const) {
      const date = value[key];
      if (
        date &&
        (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
      )
        ctx.addIssue({ code: "custom", path: [key], message: "Enter a valid calendar date" });
    }
    if ((value.tripType === "round_trip") !== Boolean(value.returnDate))
      ctx.addIssue({
        code: "custom",
        path: ["returnDate"],
        message: "Return date must match trip type",
      });
    if (minorUnits(value.originalPrice, value.originalCurrency) === null)
      ctx.addIssue({
        code: "custom",
        path: ["originalPrice"],
        message: "Price exceeds currency precision or supported range",
      });
  });
export type FlightCheckInput = z.infer<typeof flightCheckSchema>;

/** Evidence belongs to each offer, never inferred from the requested search filters. */
export interface FlightCheckOffer extends FlightOfferComparisonEvidence {
  offer: FlightOffer;
}
export interface FlightCheckProvenance {
  environment: "test" | "production" | "unknown";
  searchedAt: string;
}
export interface FlightCheckResult extends FlightCheckProvenance {
  status:
    | "better_offer_found"
    | "no_better_offer_found"
    | "insufficient_data"
    | "no_offers_found"
    | "search_failed";
  originalPrice: { amount: number; currency: string; source: "user_provided" };
  offersChecked: number;
  comparableOffers: FlightOffer[];
  comparableOfferCount: number;
  insufficientOffers: Array<{ offer: FlightOffer; reason: string }>;
  incompatibleOffers: FlightOffer[];
  providers: string[];
  bestComparableOffer?: FlightOffer;
  savingsAmount?: number;
  savingsPercentage?: number;
  limitations: string[];
}

// Currency-specific minor units; reject fractional minor units rather than silently rounding fares.
function minorUnits(amount: number, currency: string): number | null {
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) return null;
  const digits =
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const scaled = amount * 10 ** digits;
  const rounded = Math.round(scaled);
  return Number.isSafeInteger(rounded) && Math.abs(scaled - rounded) < 1e-7 ? rounded : null;
}

export function compareFlightCheck(
  input: FlightCheckInput,
  entries: readonly FlightCheckOffer[],
  provenance: FlightCheckProvenance,
): FlightCheckResult {
  const original = minorUnits(input.originalPrice, input.originalCurrency);
  if (original === null) throw new Error("Invalid original price");
  const result: FlightCheckResult = {
    ...provenance,
    status: "insufficient_data",
    originalPrice: {
      amount: input.originalPrice,
      currency: input.originalCurrency,
      source: "user_provided",
    },
    offersChecked: entries.length,
    comparableOffers: [],
    comparableOfferCount: 0,
    insufficientOffers: [],
    incompatibleOffers: [],
    providers: [
      ...new Set(entries.flatMap(({ offer }) => (offer.provider ? [offer.provider] : []))),
    ],
    limitations: [
      "Comparison covers returned results only, not the entire market.",
      "Comparable alternatives are not verified identical itineraries or equivalent fare rules.",
      "The original price is user-provided; availability and bookability are not verified.",
    ],
  };
  if (provenance.environment !== "production")
    result.limitations.push("These results must not be represented as live bookable offers.");
  let bestMinor = Infinity;
  for (const entry of entries) {
    const { offer } = entry;
    const insufficient = (reason: string) => result.insufficientOffers.push({ offer, reason });
    const outbound = offer.outbound?.segments;
    const inbound = offer.inbound?.segments;
    if (
      offer.origin !== input.origin ||
      offer.destination !== input.destination ||
      offer.cabinClass !== input.cabinClass ||
      offer.price?.currency !== input.originalCurrency ||
      (entry.passengers !== undefined && entry.passengers !== input.passengers) ||
      Boolean(offer.inbound) !== (input.tripType === "round_trip")
    ) {
      result.incompatibleOffers.push(offer);
      continue;
    }
    if (!outbound?.length || (offer.inbound && !inbound?.length)) {
      insufficient("Incomplete itinerary");
      continue;
    }
    const matches = (
      segments: NonNullable<typeof outbound>,
      from: string,
      to: string,
      date: string,
    ) =>
      segments[0]!.origin === from &&
      segments.at(-1)!.destination === to &&
      segments[0]!.departureAt.slice(0, 10) === date &&
      segments.every(
        (s, i) =>
          Number.isFinite(Date.parse(s.departureAt)) &&
          Number.isFinite(Date.parse(s.arrivalAt)) &&
          (!i || segments[i - 1]!.destination === s.origin),
      );
    if (
      !matches(outbound, input.origin, input.destination, input.departureDate) ||
      (inbound && !matches(inbound, input.destination, input.origin, input.returnDate!))
    ) {
      result.incompatibleOffers.push(offer);
      continue;
    }
    const amount = minorUnits(offer.price?.amount, input.originalCurrency);
    if (
      amount === null ||
      entry.passengers === undefined ||
      entry.priceScope !== "all_passengers_total" ||
      entry.mandatoryChargesIncluded !== true
    ) {
      insufficient("Total price, passenger scope or mandatory charges unverified");
      continue;
    }
    if (
      input.baggage.status === "unknown" ||
      entry.baggageScope !== "all_passengers_all_segments" ||
      !offer.baggage?.checked ||
      !offer.baggage.cabin
    ) {
      insufficient("Baggage conditions unknown or scope unverified");
      continue;
    }
    let unknown = false,
      incompatible = false;
    for (const kind of ["checked", "cabin"] as const) {
      for (const field of ["pieces", "weightKg"] as const) {
        const required = input.baggage[kind][field],
          actual = offer.baggage[kind]![field];
        if (field === "weightKg" && required === undefined) continue;
        if (
          actual === undefined ||
          !Number.isFinite(actual) ||
          actual < 0 ||
          (field === "pieces" && !Number.isInteger(actual))
        )
          unknown = true;
        else if (actual !== required) incompatible = true;
      }
    }
    if (unknown) {
      insufficient("Incomplete baggage allowance");
      continue;
    }
    if (incompatible) {
      result.incompatibleOffers.push(offer);
      continue;
    }
    result.comparableOffers.push(offer);
    if (amount < bestMinor) {
      bestMinor = amount;
      result.bestComparableOffer = offer;
    }
  }
  result.comparableOfferCount = result.comparableOffers.length;
  result.status = !entries.length
    ? "no_offers_found"
    : !result.comparableOfferCount
      ? "insufficient_data"
      : bestMinor < original
        ? "better_offer_found"
        : "no_better_offer_found";
  if (result.bestComparableOffer) {
    const savings = Math.max(0, original - bestMinor);
    const digits =
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: input.originalCurrency,
      }).resolvedOptions().maximumFractionDigits ?? 2;
    result.savingsAmount = savings / 10 ** digits;
    result.savingsPercentage = Math.round((savings / original) * 10000) / 100;
  }
  return result;
}
