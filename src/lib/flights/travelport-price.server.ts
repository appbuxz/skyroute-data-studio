import { z } from "zod";
import {
  bookableFlight,
  type Checkout,
  getCheckoutKey,
  openCheckout,
  sealCheckout,
} from "./travelport-checkout-token.server";
import { testBookingEnabled } from "./travelport-config.server";
import { readTravelportCheckoutBaggage } from "./travelport-checkout-baggage.server";
import { readTravelportFareRules } from "./travelport-fare-rules.server";
import { postTravelportAir } from "./travelport-http.server";
import type { TravelportPriceReference } from "./travelport-normalizer";
import type {
  FlightOffer,
  FlightPriceConfirmation,
  FlightSearchParams,
  OrganizationId,
} from "./types";

export interface PriceScope {
  userId: string;
  organizationId?: OrganizationId;
}

const checkoutLifetimeMs = 10 * 60 * 1000;
export async function attachCheckoutTokens(
  offers: FlightOffer[],
  references: Map<string, TravelportPriceReference>,
  scope: PriceScope,
  params?: FlightSearchParams,
) {
  if (references.size === 0) return;
  const key = await getCheckoutKey();
  if (!key) return;
  const now = Date.now();
  await Promise.all(
    offers.map(async (offer) => {
      const reference = references.get(offer.id);
      const expiresAt = Math.min(now + checkoutLifetimeMs, Date.parse(offer.departureAt));
      if (!reference || expiresAt <= now) return;
      const requestedFlight =
        params?.passengers === 1 &&
        !params.returnDate &&
        offer.stops === 0 &&
        offer.cabinClass === params.cabinClass &&
        offer.origin === params.origin &&
        offer.destination === params.destination
          ? {
              carrier: offer.carrier,
              flightNumber: offer.flightNumber.replace(new RegExp(`^${offer.carrier}`), ""),
              from: offer.origin,
              to: offer.destination,
              departureDate: params.departureDate,
              cabin: (
                {
                  economy: "Economy",
                  premium_economy: "PremiumEconomy",
                  business: "Business",
                  first: "First",
                } as const
              )[params.cabinClass],
            }
          : undefined;
      offer.checkoutToken = await sealCheckout(
        { ...scope, reference, searchPrice: offer.price, expiresAt, requestedFlight },
        key,
      );
    }),
  );
}

const priceResponse = z.object({
  OfferListResponse: z.object({
    Result: z
      .object({
        Error: z
          .array(z.object({ SourceCode: z.union([z.string(), z.number()]).optional() }))
          .optional(),
      })
      .optional(),
    OfferID: z.array(z.unknown()).optional(),
  }),
});
const point = z.object({ location: z.string(), date: z.string(), time: z.string() });
const singlePricedFlight = z.object({
  Product: z.tuple([
    z.object({
      FlightSegment: z.tuple([
        z.object({
          sequence: z.literal(1),
          Flight: z.object({
            carrier: z.string(),
            number: z.string(),
            Departure: point,
            Arrival: point,
          }),
        }),
      ]),
      PassengerFlight: z.tuple([
        z.object({
          passengerQuantity: z.literal(1),
          passengerTypeCode: z.literal("ADT"),
          FlightProduct: z.tuple([
            z.object({
              segmentSequence: z.tuple([z.literal(1)]),
              cabin: z.string(),
              classOfService: z.string(),
            }),
          ]),
        }),
      ]),
    }),
  ]),
});
const pricedOffer = z.object({
  Price: z.object({
    TotalPrice: z.number().finite().nonnegative(),
    CurrencyCode: z.object({ value: z.string().regex(/^[A-Z]{3}$/) }),
  }),
});

function validScope(checkout: Checkout | undefined, scope: PriceScope): checkout is Checkout {
  return Boolean(
    checkout &&
    checkout.expiresAt > Date.now() &&
    checkout.userId === scope.userId &&
    checkout.organizationId === scope.organizationId,
  );
}

export async function confirmTravelportPrice(
  token: string,
  scope: PriceScope,
): Promise<FlightPriceConfirmation> {
  const checkout = await openCheckout(token);
  if (
    !validScope(checkout, scope) ||
    checkout.offeredPrice ||
    checkout.acceptedPrice ||
    checkout.booking
  ) {
    return { status: "expired" };
  }
  return priceCheckout(checkout);
}

export async function acceptTravelportPrice(
  token: string,
  scope: PriceScope,
): Promise<FlightPriceConfirmation> {
  const checkout = await openCheckout(token);
  if (
    !validScope(checkout, scope) ||
    !checkout.offeredPrice ||
    checkout.acceptedPrice ||
    checkout.offeredPrice.currency !== checkout.searchPrice.currency
  ) {
    return { status: "expired" };
  }
  try {
    return await confirmQuote({
      ...checkout,
      acceptedPrice: checkout.offeredPrice,
      offeredPrice: undefined,
    });
  } catch {
    return { status: "error" };
  }
}

export function recheckTravelportBookingPrice(checkout: Checkout) {
  return priceCheckout(checkout);
}

async function confirmQuote(
  checkout: Checkout & { acceptedPrice: FlightOffer["price"] },
): Promise<FlightPriceConfirmation> {
  const price = checkout.acceptedPrice;
  if (!checkout.booking || !testBookingEnabled()) return { status: "confirmed", price };
  const key = await getCheckoutKey();
  if (!key) return { status: "error" };
  return {
    status: "confirmed",
    price,
    bookingToken: await sealCheckout(checkout, key),
    bookingClass: checkout.booking.classOfService,
  };
}

async function priceCheckout(checkout: Checkout): Promise<FlightPriceConfirmation> {
  const previousPrice = checkout.acceptedPrice ?? checkout.searchPrice;
  const searchExpiresAt = checkout.searchExpiresAt ?? checkout.expiresAt;
  const { catalogId, offerId, productId } = checkout.reference;
  const identifier = (value: string) => ({ Identifier: { value } });
  try {
    const response = await postTravelportAir("price/offers/buildfromcatalogproductofferings", {
      OfferQueryBuildFromCatalogProductOfferings: {
        BuildFromCatalogProductOfferingsRequest: {
          "@type": "BuildFromCatalogProductOfferingsRequestAir",
          CustomResponseModifiersAir: {
            "@type": "CustomResponseModifiersAir",
            includeFullPenaltyDisclosureInd: true,
          },
          validateInventoryInd: Boolean(checkout.requestedFlight && testBookingEnabled()),
          CatalogProductOfferingsIdentifier: identifier(catalogId),
          CatalogProductOfferingSelection: [
            {
              CatalogProductOfferingIdentifier: identifier(offerId),
              ProductIdentifier: [identifier(productId)],
            },
          ],
        },
      },
    });

    const parsed = priceResponse.safeParse(await response.json());
    if (!parsed.success) return { status: "error" };

    const { OfferID, Result } = parsed.data.OfferListResponse;
    const errors = Result?.Error?.map((error) => String(error.SourceCode)) ?? [];
    if (errors.includes("8531")) return { status: "expired" };
    if (
      errors.some((code) =>
        ["3366", "3414", "4015", "4104", "4105", "4107", "4110", "4118", "4148"].includes(code),
      )
    ) {
      return { status: "unavailable" };
    }
    if (!response.ok || errors.length > 0) return { status: "error" };
    if (!OfferID?.length) return { status: "unavailable" };
    if (OfferID.length !== 1) return { status: "error" };

    const offer = pricedOffer.safeParse(OfferID[0]);
    if (!offer.success) return { status: "error" };
    const price = {
      amount: offer.data.Price.TotalPrice,
      currency: offer.data.Price.CurrencyCode.value,
    };
    if (price.currency !== previousPrice.currency) {
      return { status: "changed", price, ...(checkout.acceptedPrice && { previousPrice }) };
    }
    const rules = readTravelportFareRules(OfferID[0]);
    const baggage = readTravelportCheckoutBaggage(OfferID[0]);
    const fareDetails = {
      ...(rules.change.length || rules.refund.length ? { fareRules: rules } : {}),
      ...(baggage && { baggage }),
    };
    const booking = testBookingEnabled()
      ? readBookableFlight(OfferID[0], checkout.requestedFlight)
      : undefined;
    const changed = price.amount !== previousPrice.amount;
    const expiresAt = Math.min(searchExpiresAt, Date.now() + 2 * 60 * 1000);
    if (checkout.expiresAt <= Date.now() || expiresAt <= Date.now()) return { status: "expired" };
    const quote = { ...checkout, expiresAt, searchExpiresAt, booking };
    if (changed) {
      const key = await getCheckoutKey();
      if (!key) return { status: "error" };
      const acceptanceToken = await sealCheckout(
        {
          ...quote,
          offeredPrice: price,
          acceptedPrice: undefined,
        },
        key,
      );
      return { status: "changed", price, previousPrice, acceptanceToken, ...fareDetails };
    }
    if (
      checkout.booking &&
      (!booking ||
        !Object.entries(checkout.booking).every(
          ([field, value]) => booking[field as keyof typeof booking] === value,
        ))
    ) {
      return { status: "unavailable" };
    }
    const confirmed = await confirmQuote({ ...quote, acceptedPrice: price });
    return confirmed.status === "confirmed" ? { ...confirmed, ...fareDetails } : confirmed;
  } catch {
    return { status: "error" };
  }
}

function readBookableFlight(offer: unknown, requested: Checkout["requestedFlight"]) {
  if (!requested) return;
  const parsed = singlePricedFlight.safeParse(offer);
  if (!parsed.success) return;
  const product = parsed.data.Product[0];
  const { Flight: flight } = product.FlightSegment[0];
  const service = product.PassengerFlight[0].FlightProduct[0];
  const booking = bookableFlight.safeParse({
    carrier: flight.carrier,
    flightNumber: flight.number,
    from: flight.Departure.location,
    to: flight.Arrival.location,
    departureDate: flight.Departure.date,
    departureTime: flight.Departure.time,
    arrivalDate: flight.Arrival.date,
    arrivalTime: flight.Arrival.time,
    cabin: service.cabin,
    classOfService: service.classOfService,
  });
  if (
    booking.success &&
    Object.entries(requested).every(
      ([key, value]) => booking.data[key as keyof typeof requested] === value,
    )
  )
    return booking.data;
  return undefined;
}
