import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "./fixtures/travelport-core.json";
import { normalizeTravelportFlights } from "./travelport-normalizer";
import { attachCheckoutTokens, confirmTravelportPrice } from "./travelport-price.server";
import type { OrganizationId } from "./types";

const postAir = vi.hoisted(() => vi.fn());
vi.mock("./travelport-http.server", () => ({ postTravelportAir: postAir }));

const scope = { userId: "verified-user", organizationId: "agency-a" as OrganizationId };
let checkoutToken: string;
let searchPrice: { amount: number; currency: string };

beforeEach(async () => {
  vi.stubEnv("TRAVELPORT_CLIENT_ID", "test-client");
  vi.stubEnv("TRAVELPORT_CLIENT_SECRET", "test-secret");
  vi.stubEnv("TRAVELPORT_USERNAME", "test-user");
  vi.stubEnv("TRAVELPORT_PASSWORD", "test-password");
  vi.stubEnv("TRAVELPORT_ACCESS_GROUP", "");
  vi.stubEnv("TRAVELPORT_PCC", "TEST_1G");
  vi.setSystemTime(new Date("2026-11-18T10:00:00Z"));
  postAir.mockReset();
  const data = structuredClone(fixture);
  const catalog = Object.assign(data.CatalogProductOfferingsResponse.CatalogProductOfferings, {
    Identifier: { value: "search-catalog-id" },
  });
  const variant =
    catalog.CatalogProductOffering[0]!.ProductBrandOptions[0]!.ProductBrandOffering[0]!;
  Object.assign(variant, { ContentSource: "GDS" });
  const { offers, priceReferences } = normalizeTravelportFlights(data);
  expect(priceReferences?.size).toBe(1);
  await attachCheckoutTokens(offers, priceReferences!, scope);
  const selected = offers.find((offer) => offer.checkoutToken)!;
  checkoutToken = selected.checkoutToken!;
  searchPrice = selected.price;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it.each(["confirmed", "changed"] as const)(
  "returns the AirPrice total and currency as %s",
  async (status) => {
    const currency = status === "confirmed" ? searchPrice.currency : "USD";
    const amount = searchPrice.amount;
    postAir.mockResolvedValue(
      Response.json({
        OfferListResponse: {
          OfferID: [{ Price: { TotalPrice: amount, CurrencyCode: { value: currency } } }],
        },
      }),
    );
    await expect(confirmTravelportPrice(checkoutToken, scope)).resolves.toEqual({
      status,
      price: { amount, currency },
    });
    const catalog =
      fixture.CatalogProductOfferingsResponse.CatalogProductOfferings.CatalogProductOffering[0]!;
    expect(postAir).toHaveBeenCalledExactlyOnceWith(
      "price/offers/buildfromcatalogproductofferings",
      {
        OfferQueryBuildFromCatalogProductOfferings: {
          BuildFromCatalogProductOfferingsRequest: {
            "@type": "BuildFromCatalogProductOfferingsRequestAir",
            validateInventoryInd: false,
            CatalogProductOfferingsIdentifier: { Identifier: { value: "search-catalog-id" } },
            CatalogProductOfferingSelection: [
              {
                CatalogProductOfferingIdentifier: { Identifier: { value: catalog.id } },
                ProductIdentifier: [
                  {
                    Identifier: {
                      value:
                        catalog.ProductBrandOptions[0]!.ProductBrandOffering[0]!.Product[0]!
                          .productRef,
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    );
  },
);

it("declines cross-user, cross-agency, personal and expired requests without calling Travelport", async () => {
  for (const invalidScope of [
    { ...scope, userId: "another-user" },
    { ...scope, organizationId: "agency-b" as OrganizationId },
    { userId: scope.userId },
  ]) {
    await expect(confirmTravelportPrice(checkoutToken, invalidScope)).resolves.toEqual({
      status: "expired",
    });
  }
  vi.setSystemTime(new Date("2026-11-18T10:10:00Z"));
  await expect(confirmTravelportPrice(checkoutToken, scope)).resolves.toEqual({
    status: "expired",
  });
  expect(postAir).not.toHaveBeenCalled();
});

it.each([
  [8531, "expired"],
  [3414, "unavailable"],
  [2599, "error"],
])("maps supplier error %s to %s", async (SourceCode, status) => {
  postAir.mockResolvedValue(
    Response.json({ OfferListResponse: { Result: { Error: [{ SourceCode }] } } }),
  );
  await expect(confirmTravelportPrice(checkoutToken, scope)).resolves.toEqual({ status });
});

it("rejects a modified checkout token before calling Travelport", async () => {
  const altered = (checkoutToken[0] === "A" ? "B" : "A") + checkoutToken.slice(1);
  await expect(confirmTravelportPrice(altered, scope)).resolves.toEqual({ status: "expired" });
  expect(postAir).not.toHaveBeenCalled();
});
