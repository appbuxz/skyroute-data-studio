import { expect, it } from "vitest";
import { readTravelportCheckoutBaggage } from "./travelport-checkout-baggage.server";

const product = { id: "p0", FlightSegment: [{ sequence: 1 }] };
const scope = { ProductRef: ["p0"], SegmentSequenceList: [1], passengerTypeCodes: ["ADT"] };
const checked = {
  ...scope,
  baggageType: "FirstCheckedBag",
  BaggageItem: [
    { includedInOfferPrice: "Yes", quantity: 1, Text: "UPTO50LB/23KG AND OVER62LI/158LCM" },
  ],
};
const cabin = {
  ...scope,
  baggageType: "CarryOn",
  BaggageItem: [
    {
      includedInOfferPrice: "Yes",
      Measurement: [{ measurementType: "Weight", unit: "Kilograms", value: 8 }],
    },
  ],
};

function price(...rows: unknown[]) {
  return { Product: [product], TermsAndConditionsFull: [{ BaggageAllowance: rows }] };
}

it("reads the selected fare's checked pieces and weight and weight-only cabin allowance", () => {
  const paidSecond = {
    ...scope,
    baggageType: "SecondCheckedBag",
    BaggageItem: [{ includedInOfferPrice: "No", quantity: 1 }],
  };
  const offScope = [
    { ...cabin, ProductRef: ["other"] },
    { ...checked, passengerTypeCodes: ["CNN"] },
    { ...checked, SegmentSequenceList: [2] },
  ];
  expect(readTravelportCheckoutBaggage(price(checked, paidSecond, cabin, ...offScope))).toEqual({
    checked: { status: "included", pieces: 1, weight: { value: 23, unit: "kg" } },
    cabin: { status: "included", weight: { value: 8, unit: "kg" } },
  });
});

it("distinguishes a paid or zero-piece allowance from omitted or unknown baggage", () => {
  expect(
    readTravelportCheckoutBaggage(
      price(
        {
          ...checked,
          BaggageItem: [{ includedInOfferPrice: "No", quantity: 1 }],
        },
        {
          ...cabin,
          BaggageItem: [{ includedInOfferPrice: "Unknown", quantity: 1 }],
        },
      ),
    ),
  ).toEqual({ checked: { status: "not_included" } });
  expect(
    readTravelportCheckoutBaggage(
      price({
        ...checked,
        BaggageItem: [],
        Text: ["0P"],
      }),
    ),
  ).toEqual({ checked: { status: "not_included" } });
  expect(readTravelportCheckoutBaggage(price())).toBeUndefined();
});

it("does not apply a segment's allowance to the rest of the itinerary", () => {
  const selected = {
    ...price(checked, cabin),
    Product: [{ ...product, FlightSegment: [{ sequence: 1 }, { sequence: 2 }] }],
  };
  expect(readTravelportCheckoutBaggage(selected)).toBeUndefined();
});
