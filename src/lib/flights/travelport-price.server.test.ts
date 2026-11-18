import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "./fixtures/travelport-core.json";
import { normalizeTravelportFlights } from "./travelport-normalizer";
import {
  acceptTravelportPrice,
  attachCheckoutTokens,
  confirmTravelportPrice,
  recheckTravelportBookingPrice,
} from "./travelport-price.server";
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
            CustomResponseModifiersAir: {
              "@type": "CustomResponseModifiersAir",
              includeFullPenaltyDisclosureInd: true,
            },
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

it.each([
  ["Economy", "E", true],
  ["Business", "E", false],
  ["Economy", undefined, false],
] as const)(
  "only enables booking for the matching, verified AirPrice class (%s, %s)",
  async (cabin, code, canBook) => {
    const { getCheckoutKey, openCheckout, sealCheckout } =
      await import("./travelport-checkout-token.server");
    vi.stubEnv("TRAVELPORT_TEST_BOOKING", "true");
    const checkout = (await openCheckout(checkoutToken))!;
    const token = await sealCheckout(
      {
        ...checkout,
        requestedFlight: {
          carrier: "KC",
          flightNumber: "913",
          from: "ALA",
          to: "IST",
          departureDate: "2026-12-12",
          cabin: "Economy",
        },
      },
      (await getCheckoutKey())!,
    );
    postAir.mockResolvedValue(
      Response.json({
        OfferListResponse: {
          Result: { Warning: [{ Message: "Preferred/Permitted Cabin is Ignored" }] },
          OfferID: [
            {
              Price: {
                TotalPrice: searchPrice.amount,
                CurrencyCode: { value: searchPrice.currency },
              },
              Product: [
                {
                  FlightSegment: [
                    {
                      sequence: 1,
                      Flight: {
                        carrier: "KC",
                        number: "913",
                        Departure: { location: "ALA", date: "2026-12-12", time: "17:00:00" },
                        Arrival: { location: "IST", date: "2026-12-12", time: "21:00:00" },
                      },
                    },
                  ],
                  PassengerFlight: [
                    {
                      passengerQuantity: 1,
                      passengerTypeCode: "ADT",
                      FlightProduct: [{ segmentSequence: [1], cabin, classOfService: code }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
    );
    const result = await confirmTravelportPrice(token, scope);
    expect(result.status).toBe("confirmed");
    if (result.status !== "confirmed") throw new Error("Expected a confirmed price");
    expect(Boolean(result.bookingToken)).toBe(canBook);
    if (result.bookingToken) {
      expect((await openCheckout(result.bookingToken))?.booking?.classOfService).toBe("E");
    }
  },
);

it("returns penalties only for the priced product and keeps departure periods distinct", async () => {
  postAir.mockResolvedValue(
    Response.json({
      OfferListResponse: {
        OfferID: [
          {
            Price: {
              TotalPrice: searchPrice.amount,
              CurrencyCode: { value: searchPrice.currency },
            },
            Product: [{ id: "p0", FlightSegment: [{ sequence: 1 }] }],
            TermsAndConditionsFull: [
              {
                Penalties: [
                  {
                    PassengerTypeCodes: ["ADT"],
                    Change: [
                      {
                        "@type": "ChangePermitted",
                        penaltyTypes: ["BeforeDeparture"],
                        ProductRefs: ["p0"],
                        SegmentSequence: [1],
                        Penalty: [
                          { "@type": "PenaltyAmount", Amount: { value: 18084, code: "KZT" } },
                        ],
                      },
                      {
                        "@type": "ChangeNotPermitted",
                        penaltyTypes: ["AfterDeparture"],
                        ProductRefs: ["p0"],
                      },
                      {
                        "@type": "ChangePermitted",
                        penaltyTypes: ["Anytime"],
                        ProductRefs: ["another-fare"],
                        Penalty: [{ "@type": "PenaltyAmount", Amount: { value: 1, code: "USD" } }],
                      },
                    ],
                    Cancel: [
                      {
                        "@type": "CancelPermitted",
                        penaltyTypes: ["BeforeDeparture"],
                        Penalty: [{ "@type": "PenaltyAmount", Amount: { value: 0, code: "KZT" } }],
                      },
                      {
                        "@type": "CancelPermitted",
                        penaltyTypes: ["NoShow"],
                        Penalty: [{ "@type": "PenaltyPercent", Percent: 100 }],
                      },
                      { "@type": "CancelPermitted", penaltyTypes: ["AfterDeparture"] },
                    ],
                  },
                  {
                    PassengerTypeCodes: ["CNN"],
                    Change: [{ "@type": "ChangeNotPermitted", penaltyTypes: ["Anytime"] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    }),
  );

  await expect(confirmTravelportPrice(checkoutToken, scope)).resolves.toEqual({
    status: "confirmed",
    price: searchPrice,
    fareRules: {
      change: [
        {
          status: "penalty",
          categories: ["BeforeDeparture"],
          segments: [1],
          penalties: [{ kind: "amount", value: 18084, currency: "KZT" }],
        },
        { status: "prohibited", categories: ["AfterDeparture"] },
      ],
      refund: [
        { status: "free", categories: ["BeforeDeparture"] },
        { status: "penalty", categories: ["NoShow"], penalties: [{ kind: "percent", value: 100 }] },
        { status: "unknown", categories: ["AfterDeparture"] },
      ],
    },
  });
});

it("binds explicit acceptance to the server quote and asks again only when the accepted amount changes", async () => {
  const { getCheckoutKey, openCheckout, sealCheckout } =
    await import("./travelport-checkout-token.server");
  vi.stubEnv("TRAVELPORT_TEST_BOOKING", "true");
  const checkout = (await openCheckout(checkoutToken))!;
  const token = await sealCheckout(
    {
      ...checkout,
      requestedFlight: {
        carrier: "KC",
        flightNumber: "913",
        from: "ALA",
        to: "IST",
        departureDate: "2026-12-12",
        cabin: "Economy",
      },
    },
    (await getCheckoutKey())!,
  );
  const price = { ...searchPrice, amount: searchPrice.amount + 1000 };
  const reply = (amount: number) =>
    Response.json({
      OfferListResponse: {
        OfferID: [
          {
            Price: { TotalPrice: amount, CurrencyCode: { value: price.currency } },
            Product: [
              {
                FlightSegment: [
                  {
                    sequence: 1,
                    Flight: {
                      carrier: "KC",
                      number: "913",
                      Departure: { location: "ALA", date: "2026-12-12", time: "17:00:00" },
                      Arrival: { location: "IST", date: "2026-12-12", time: "21:00:00" },
                    },
                  },
                ],
                PassengerFlight: [
                  {
                    passengerQuantity: 1,
                    passengerTypeCode: "ADT",
                    FlightProduct: [
                      { segmentSequence: [1], cabin: "Economy", classOfService: "E" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  postAir.mockResolvedValueOnce(reply(price.amount));
  const changed = await confirmTravelportPrice(token, scope);
  expect(changed).toEqual({
    status: "changed",
    price,
    previousPrice: searchPrice,
    acceptanceToken: expect.any(String),
  });
  if (changed.status !== "changed" || !changed.acceptanceToken)
    throw new Error("Missing price quote");
  await expect(
    acceptTravelportPrice(changed.acceptanceToken, { ...scope, userId: "other" }),
  ).resolves.toEqual({ status: "expired" });
  await expect(
    acceptTravelportPrice(changed.acceptanceToken, { userId: scope.userId }),
  ).resolves.toEqual({ status: "expired" });

  const accepted = await acceptTravelportPrice(changed.acceptanceToken, scope);
  expect(accepted).toEqual({
    status: "confirmed",
    price,
    bookingClass: "E",
    bookingToken: expect.any(String),
  });
  if (accepted.status !== "confirmed" || !accepted.bookingToken)
    throw new Error("Missing booking token");
  const booking = (await openCheckout(accepted.bookingToken))!;
  expect(booking).toMatchObject({ ...scope, reference: checkout.reference, acceptedPrice: price });
  expect(booking.offeredPrice).toBeUndefined();

  postAir.mockResolvedValueOnce(reply(price.amount));
  await expect(recheckTravelportBookingPrice(booking)).resolves.toMatchObject({
    status: "confirmed",
    price,
  });
  postAir.mockResolvedValueOnce(reply(price.amount + 1000));
  await expect(recheckTravelportBookingPrice(booking)).resolves.toEqual({
    status: "changed",
    previousPrice: price,
    price: { ...price, amount: price.amount + 1000 },
    acceptanceToken: expect.any(String),
  });
});
