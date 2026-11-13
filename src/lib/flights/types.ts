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

export type FlightSearchResult =
  | { status: "not_connected"; message: string }
  | { status: "ok"; offers: FlightOffer[]; fetchedAt: string; environment?: "test" | "production" }
  | { status: "error"; message: string };

export interface FlightDataProvider {
  searchFlights(
    params: FlightSearchParams,
    ctx: { organizationId?: OrganizationId },
  ): Promise<FlightSearchResult>;
}
