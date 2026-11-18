/** Tenant identifier. Every data request will be scoped to an organization once a backend is connected. */
export type OrganizationId = string & { readonly __brand: "OrganizationId" };

export const CABIN_CLASSES = ["economy", "premium_economy", "business", "first"] as const;
export type CabinClass = (typeof CABIN_CLASSES)[number];

export const CABIN_LABELS: Record<CabinClass, string> = {
  economy: "Economy",
  premium_economy: "Premium economy",
  business: "Business",
  first: "First",
};

export interface Airport {
  iata: string;
  city: string;
  name: string;
  country: string;
}

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string; // ISO yyyy-mm-dd
  returnDate?: string | undefined;
  passengers: number;
  cabinClass: CabinClass;
}

export interface FlightSegment {
  carrier: string;
  flightNumber: string;
  origin: string; // IATA airport code
  destination: string; // IATA airport code
  departureAt: string; // ISO datetime with timezone
  arrivalAt: string; // ISO datetime with timezone
  durationMinutes?: number;
}

export interface FlightItinerary {
  segments: FlightSegment[];
  durationMinutes?: number;
}

export interface FlightBaggage {
  checked?: {
    pieces?: number;
    weightKg?: number;
  };
  cabin?: {
    pieces?: number;
    weightKg?: number;
  };
}

/** Optional provider-verified evidence; absence must remain unknown. */
export interface FlightOfferComparisonEvidence {
  passengers?: number;
  priceScope?: "all_passengers_total";
  mandatoryChargesIncluded?: boolean;
  /** Verified scope for each independently known baggage allowance. Absence remains unknown. */
  baggageScopes?: Partial<Record<keyof FlightBaggage, "all_passengers_all_segments">>;
  /** Complete checked and cabin scope, required by strict Flight Check comparisons. */
  baggageScope?: "all_passengers_all_segments";
}

export interface FlightOffer {
  checkoutToken?: string;
  comparisonEvidence?: FlightOfferComparisonEvidence;
  id: string;
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  stops: number;
  cabinClass: CabinClass;
  price: {
    amount: number;
    currency: string;
  };

  // Provider-independent details.
  outbound?: FlightItinerary;
  inbound?: FlightItinerary;
  baggage?: FlightBaggage;
  fareBrand?: string;
  refundable?: boolean;
  changeable?: boolean;
  expiresAt?: string;
  provider?: string;
}

export type FareRuleCategory =
  | "BeforeDeparture"
  | "AfterDeparture"
  | "Anytime"
  | "NoShow"
  | "Minimum"
  | "Maximum"
  | "ExchangeRequired"
  | "ExchangeNotRequired";

export type FareRulePenalty =
  { kind: "amount"; value: number; currency: string } | { kind: "percent"; value: number };

export type FareRule = {
  categories: FareRuleCategory[];
  timeWindow?: { value: number; period: "Minutes" | "Hours" | "Days" | "Months" };
  segments?: number[];
  appliesTo?: "OneWay" | "RoundTrip" | "PerTicket" | "PerCoupon" | "PerDirectionOfTravel";
} & (
  | { status: "prohibited" | "free" | "unknown" }
  | { status: "penalty"; penalties: FareRulePenalty[] }
);

export type CheckoutBaggageAllowance =
  | { status: "not_included" }
  | { status: "included"; pieces?: number; weight?: { value: number; unit: "kg" | "lb" } };

export interface CheckoutBaggage {
  checked?: CheckoutBaggageAllowance;
  cabin?: CheckoutBaggageAllowance;
}

interface FlightFareDetails {
  baggage?: CheckoutBaggage;
  fareRules?: { change: FareRule[]; refund: FareRule[] };
}

export interface ChangedFlightPrice extends FlightFareDetails {
  status: "changed";
  price: FlightOffer["price"];
  previousPrice?: FlightOffer["price"];
  acceptanceToken?: string;
}

export type FlightPriceConfirmation =
  | (FlightFareDetails & {
      status: "confirmed";
      price: FlightOffer["price"];
      bookingToken?: string;
      bookingClass?: string;
    })
  | ChangedFlightPrice
  | { status: "expired" | "unavailable" | "error" };

export type FlightSearchResult =
  | { status: "not_connected"; message: string }
  | { status: "ok"; offers: FlightOffer[]; fetchedAt: string; environment?: "test" | "production" }
  | { status: "error"; message: string };

/** Search snapshot with no implied organization ownership. */
export interface FlightSearchSnapshot {
  params: FlightSearchParams;
  offers: FlightOffer[];
  fetchedAt: string;
}

export interface FlightDataProvider {
  searchFlights(
    params: FlightSearchParams,
    ctx: { organizationId?: OrganizationId },
  ): Promise<FlightSearchResult>;
}

export type FlightTestBooking =
  | { status: "booked"; pnr: string }
  | { status: "price_review"; confirmation: ChangedFlightPrice }
  | { status: "unavailable" | "error" | "unknown" };
