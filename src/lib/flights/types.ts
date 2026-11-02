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
  returnDate?: string;
  passengers: number;
  cabinClass: CabinClass;
}

export interface FlightOffer {
  id: string;
  carrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureAt: string;
  arrivalAt: string;
  stops: number;
  cabinClass: CabinClass;
  price: { amount: number; currency: "KZT" | "USD" | "EUR" };
}

export type FlightSearchResult =
  | { status: "not_connected"; message: string }
  | { status: "ok"; offers: FlightOffer[]; fetchedAt: string }
  | { status: "error"; message: string };

export interface FlightDataProvider {
  searchFlights(params: FlightSearchParams, ctx: { organizationId?: OrganizationId }): Promise<FlightSearchResult>;
}
