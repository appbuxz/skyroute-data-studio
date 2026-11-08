
import type {
  FlightOffer,
  FlightSearchParams,
} from "./types";

const STORAGE_KEY = "flight-analytics:search:v1";

export interface SavedFlightSearch {
  userId: string;
  params: FlightSearchParams;
  offers: FlightOffer[];
  fetchedAt: string;
}

export function saveFlightSearch(
  search: SavedFlightSearch,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(search),
    );

    return true;
  } catch {
    return false;
  }
}

export function loadFlightSearch(
  userId: string,
): SavedFlightSearch | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("userId" in parsed) ||
      parsed.userId !== userId ||
      !("offers" in parsed) ||
      !Array.isArray(parsed.offers) ||
      !("fetchedAt" in parsed) ||
      typeof parsed.fetchedAt !== "string" ||
      !("params" in parsed) ||
      typeof parsed.params !== "object" ||
      parsed.params === null
    ) {
      return null;
    }

    return parsed as SavedFlightSearch;
  } catch {
    return null;
  }
}

export function clearFlightSearch(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable in restricted browsers.
  }
}
