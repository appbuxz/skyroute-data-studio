import { z } from "zod";
import { getCheckoutKey, openCheckout, sealCheckout } from "./travelport-checkout-token.server";
import { postTravelportAir } from "./travelport-http.server";
import type { TravelportPriceReference } from "./travelport-normalizer";
import type { FlightOffer, FlightPriceConfirmation, OrganizationId } from "./types";

export interface PriceScope {
  userId: string;
  organizationId?: OrganizationId;
}

const checkoutLifetimeMs = 10 * 60 * 1000;
export async function attachCheckoutTokens(
  offers: FlightOffer[],
  references: Map<string, TravelportPriceReference>,
  scope: PriceScope,
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
      offer.checkoutToken = await sealCheckout(
        { ...scope, reference, searchPrice: offer.price, expiresAt },
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
const pricedOffer = z.object({
  Price: z.object({
    TotalPrice: z.number().finite().nonnegative(),
    CurrencyCode: z.object({ value: z.string().regex(/^[A-Z]{3}$/) }),
  }),
});

export async function confirmTravelportPrice(
  token: string,
  scope: PriceScope,
): Promise<FlightPriceConfirmation> {
  const checkout = await openCheckout(token);
  if (
    !checkout ||
    checkout.expiresAt <= Date.now() ||
    checkout.userId !== scope.userId ||
    checkout.organizationId !== scope.organizationId
  ) {
    return { status: "expired" };
  }

  const { catalogId, offerId, productId } = checkout.reference;
  const identifier = (value: string) => ({ Identifier: { value } });
  try {
    const response = await postTravelportAir("price/offers/buildfromcatalogproductofferings", {
      OfferQueryBuildFromCatalogProductOfferings: {
        BuildFromCatalogProductOfferingsRequest: {
          "@type": "BuildFromCatalogProductOfferingsRequestAir",
          validateInventoryInd: false,
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
    return {
      status:
        price.amount === checkout.searchPrice.amount &&
        price.currency === checkout.searchPrice.currency
          ? "confirmed"
          : "changed",
      price,
    };
  } catch {
    return { status: "error" };
  }
}
