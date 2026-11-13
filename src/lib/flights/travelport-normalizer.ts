import { z } from "zod";
import type { CabinClass, FlightOffer } from "./types";
import { travelportComparison } from "./travelport-comparison";
import { getAirportTimeZone } from "./airport-timezone";
import { localDateTimeToIso } from "./local-datetime";
const text = z.string().trim().min(1);
const list = z.array(z.unknown());
const object = z.record(z.unknown());
const point = z.object({ location: z.string().regex(/^[A-Z]{3}$/), date: text, time: text });
const flightSchema = z.object({
  id: text,
  carrier: text,
  number: text,
  Departure: point,
  Arrival: point,
  duration: text.optional(),
});
const productSchema = z.object({
  id: text,
  totalDuration: text.optional(),
  FlightSegment: z
    .array(
      z.object({ sequence: z.number().int().positive(), Flight: z.object({ FlightRef: text }) }),
    )
    .min(1),
  PassengerFlight: z
    .array(
      z.object({
        passengerQuantity: z.number().int().positive(),
        passengerTypeCode: z.unknown().optional(),
        FlightProduct: z
          .array(
            z.object({ cabin: text, segmentSequence: z.array(z.number().int().positive()).min(1) }),
          )
          .min(1),
      }),
    )
    .min(1),
});
const variantSchema = z.object({
  Product: z.array(z.object({ productRef: text })).length(1),
  ContentSource: z.unknown().optional(),
  TermsAndConditions: z.unknown().optional(),
  BestCombinablePrice: z
    .object({
      TotalPrice: z.number().finite().nonnegative(),
      CurrencyCode: z.object({ value: z.string().regex(/^[A-Z]{3}$/) }),
    })
    .passthrough(),
});
const cabins: Record<string, CabinClass> = {
  Economy: "economy",
  PremiumEconomy: "premium_economy",
  Business: "business",
  First: "first",
};
function minutes(value?: string): number | undefined {
  if (value === undefined) return undefined;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(value);
  if (!m || (!m[1] && !m[2])) throw Error("INVALID_DURATION");
  const total = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  if (!Number.isSafeInteger(total)) throw Error("INVALID_DURATION");
  return total;
}
export interface TravelportNormalization {
  offers: FlightOffer[];
  skipped: Array<{
    catalogIndex: number;
    optionIndex: number;
    variantIndex: number;
    reason: string;
  }>;
}
/** One-way, single-product variants only. No payloads appear in diagnostics.
 * Optional comparison evidence is independently validated; incomplete evidence never rejects search offers.
 */
export function normalizeTravelportFlights(
  response: unknown,
  timezone: (iata: string) => string = getAirportTimeZone,
): TravelportNormalization {
  const invalid = () => new Error("Invalid or unsupported Travelport response");
  const root = z
    .object({
      CatalogProductOfferingsResponse: z.object({
        CatalogProductOfferings: z.object({ CatalogProductOffering: list }),
        ReferenceList: list.optional(),
      }),
    })
    .safeParse(response);
  if (!root.success) throw invalid();
  const r = root.data.CatalogProductOfferingsResponse;
  if (r.CatalogProductOfferings.CatalogProductOffering.length > 0 && !r.ReferenceList)
    throw invalid();
  const maps = { Flight: new Map<string, unknown>(), Product: new Map<string, unknown>() };
  for (const raw of r.ReferenceList ?? []) {
    const ref = object.safeParse(raw);
    if (!ref.success) throw invalid();
    for (const key of ["Flight", "Product"] as const) {
      if (ref.data[key] === undefined) continue;
      const items = list.safeParse(ref.data[key]);
      if (!items.success) throw invalid();
      for (const item of items.data) {
        const id = z.object({ id: text }).safeParse(item);
        if (!id.success || maps[key].has(id.data.id)) throw invalid();
        maps[key].set(id.data.id, item);
      }
    }
  }
  const result: TravelportNormalization = { offers: [], skipped: [] };
  r.CatalogProductOfferings.CatalogProductOffering.forEach((raw, catalogIndex) => {
    const skip = (optionIndex: number, variantIndex: number, reason: string) =>
      result.skipped.push({ catalogIndex, optionIndex, variantIndex, reason });
    const catalog = z
      .object({ id: text, sequence: z.literal(1).optional(), ProductBrandOptions: list })
      .safeParse(raw);
    if (!catalog.success) {
      skip(-1, -1, "INVALID_CATALOG");
      return;
    }
    catalog.data.ProductBrandOptions.forEach((rawOption, optionIndex) => {
      const option = z
        .object({ flightRefs: z.array(text).min(1), ProductBrandOffering: list })
        .safeParse(rawOption);
      if (!option.success) {
        skip(optionIndex, -1, "INVALID_OPTION");
        return;
      }
      option.data.ProductBrandOffering.forEach((rawVariant, variantIndex) => {
        let reason = "INVALID_VARIANT";
        try {
          const variant = variantSchema.parse(rawVariant);
          reason = "INVALID_PRODUCT_REFERENCE";
          const product = productSchema.parse(maps.Product.get(variant.Product[0]!.productRef));
          const ordered = [...product.FlightSegment].sort((a, b) => a.sequence - b.sequence);
          if (
            ordered.some((s, i) => s.sequence !== i + 1) ||
            ordered.length !== option.data.flightRefs.length ||
            ordered.some((s, i) => s.Flight.FlightRef !== option.data.flightRefs[i])
          )
            throw Error();
          reason = "UNSUPPORTED_CABIN";
          const cabinSet = new Set(
            product.PassengerFlight.flatMap((p) => p.FlightProduct.map((f) => f.cabin)),
          );
          const cabinName = [...cabinSet][0]!;
          const cabin = Object.hasOwn(cabins, cabinName) ? cabins[cabinName] : undefined;
          if (
            cabinSet.size !== 1 ||
            !cabin ||
            product.PassengerFlight.some((p) =>
              ordered.some(
                (s) => !p.FlightProduct.some((f) => f.segmentSequence.includes(s.sequence)),
              ),
            )
          )
            throw Error();
          reason = "INVALID_FLIGHT_REFERENCE";
          const flights = ordered.map((s) =>
            flightSchema.parse(maps.Flight.get(s.Flight.FlightRef)),
          );
          reason = "INVALID_DATETIME_OR_TIMEZONE";
          const segments = flights.map((f) => ({
            carrier: f.carrier,
            flightNumber: f.number,
            origin: f.Departure.location,
            destination: f.Arrival.location,
            departureAt: localDateTimeToIso(
              f.Departure.date,
              f.Departure.time,
              timezone(f.Departure.location),
            ),
            arrivalAt: localDateTimeToIso(
              f.Arrival.date,
              f.Arrival.time,
              timezone(f.Arrival.location),
            ),
            ...(f.duration === undefined ? {} : { durationMinutes: minutes(f.duration)! }),
          }));
          reason = "INVALID_JOURNEY";
          if (
            segments.some(
              (s, i) =>
                Date.parse(s.arrivalAt) <= Date.parse(s.departureAt) ||
                (i > 0 &&
                  (segments[i - 1]!.destination !== s.origin ||
                    Date.parse(segments[i - 1]!.arrivalAt) > Date.parse(s.departureAt))),
            )
          )
            throw Error();
          const first = segments[0]!,
            last = segments[segments.length - 1]!;
          const duration = minutes(product.totalDuration);
          result.offers.push({
            ...travelportComparison(variant, product, r.ReferenceList ?? []),
            id: `travelport-${catalogIndex}-${optionIndex}-${variantIndex}-${product.id}`,
            provider: "travelport",
            carrier: first.carrier,
            flightNumber: first.flightNumber,
            origin: first.origin,
            destination: last.destination,
            departureAt: first.departureAt,
            arrivalAt: last.arrivalAt,
            stops: segments.length - 1,
            cabinClass: cabin,
            price: {
              amount: variant.BestCombinablePrice.TotalPrice,
              currency: variant.BestCombinablePrice.CurrencyCode.value,
            },
            outbound: {
              segments,
              ...(duration === undefined ? {} : { durationMinutes: duration }),
            },
          });
        } catch {
          skip(optionIndex, variantIndex, reason);
        }
      });
    });
  });
  return result;
}
