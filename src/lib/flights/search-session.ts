import { flightSearchSchema } from "./search-schema";
import type { FlightSearchParams, OrganizationId } from "./types";

const LEGACY_STORAGE_KEY = "flight-analytics:search:v1";

export function searchInputsKey(userId: string, organizationId: OrganizationId | null): string {
  return `flight-analytics:search-inputs:v1:${JSON.stringify([userId, organizationId])}`;
}

export function readSearchInputs(key: string | null): FlightSearchParams | undefined {
  if (!key || typeof window === "undefined") return;
  try {
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return;
    const values = JSON.parse(stored);
    if (typeof values?.passengers !== "number") return;
    const parsed = flightSearchSchema.safeParse(values);
    return parsed.success ? parsed.data : undefined;
  } catch {
    // Invalid JSON or unavailable storage leaves the form editable with its defaults.
    return undefined;
  }
}

export function saveSearchInputs(key: string, params: FlightSearchParams): void {
  try {
    const { origin, destination, departureDate, returnDate, passengers, cabinClass } = params;
    window.sessionStorage.setItem(
      key,
      JSON.stringify({ origin, destination, departureDate, returnDate, passengers, cabinClass }),
    );
  } catch {
    // Storage failures should not affect a successful search.
  }
}

/** Remove obsolete user-scoped data; flight results now live only in React state. */
export function clearLegacyFlightSearch(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in restricted browsers.
  }
}
