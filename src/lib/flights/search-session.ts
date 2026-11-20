import { z } from "zod";
import { flightSearchSchema, searchParamsSchema } from "./search-schema";
import {
  CABIN_CLASSES,
  type FlightSearchParams,
  type FlightSearchSnapshot,
  type OrganizationId,
} from "./types";

const LEGACY_STORAGE_KEY = "flight-analytics:search:v1";
const RECENT_SEARCH_LIMIT = 10;

function recentSearchesKey(userId: string, organizationId: OrganizationId): string {
  return `flight-analytics:recent-searches:v1:${JSON.stringify([userId, organizationId])}`;
}

export function readRecentSearches(
  userId: string,
  organizationId: OrganizationId,
): FlightSearchParams[] {
  try {
    const stored = window.localStorage.getItem(recentSearchesKey(userId, organizationId));
    const entries: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(entries)) return [];
    return entries.slice(0, RECENT_SEARCH_LIMIT).flatMap((entry) => {
      const parsed = flightSearchSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    return [];
  }
}

export function searchParamsKey(params: FlightSearchParams): string {
  const { origin, destination, departureDate, returnDate, passengers, cabinClass } = params;
  return JSON.stringify([
    origin,
    destination,
    departureDate,
    returnDate || null,
    passengers,
    cabinClass,
  ]);
}

export function saveRecentSearch(
  userId: string,
  organizationId: OrganizationId,
  params: FlightSearchParams,
): FlightSearchParams[] {
  const current = readRecentSearches(userId, organizationId);
  const key = searchParamsKey(params);
  const searches = [params, ...current.filter((search) => searchParamsKey(search) !== key)].slice(
    0,
    RECENT_SEARCH_LIMIT,
  );
  try {
    window.localStorage.setItem(
      recentSearchesKey(userId, organizationId),
      JSON.stringify(searches),
    );
  } catch {
    // The latest successful search is still available in the current form.
  }
  return searches;
}

const timestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const segmentSchema = z.object({
  carrier: z.string(),
  flightNumber: z.string(),
  origin: z.string(),
  destination: z.string(),
  departureAt: timestamp,
  arrivalAt: timestamp,
});
const itinerarySchema = z.object({
  segments: z.array(segmentSchema),
  durationMinutes: z.number().finite().optional(),
});
const allowanceSchema = z.object({
  pieces: z.number().finite().optional(),
  weightKg: z.number().finite().optional(),
});
const evidenceScope = z.literal("all_passengers_all_segments").optional();
export const FLIGHT_SHORTLIST_LIMIT = 3;

const offerSchema = segmentSchema.extend({
  id: z.string(),
  checkoutToken: z.string().optional(),
  stops: z.number().int().nonnegative(),
  cabinClass: z.enum(CABIN_CLASSES),
  price: z.object({
    amount: z.number().finite().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  outbound: itinerarySchema.optional(),
  inbound: itinerarySchema.optional(),
  baggage: z
    .object({ checked: allowanceSchema.optional(), cabin: allowanceSchema.optional() })
    .optional(),
  fareBrand: z.string().optional(),
  refundable: z.boolean().optional(),
  changeable: z.boolean().optional(),
  expiresAt: z.string().optional(),
  provider: z.string().optional(),
  comparisonEvidence: z
    .object({
      passengers: z.number().int().positive().optional(),
      priceScope: z.literal("all_passengers_total").optional(),
      mandatoryChargesIncluded: z.boolean().optional(),
      baggageScopes: z.object({ checked: evidenceScope, cabin: evidenceScope }).optional(),
      baggageScope: evidenceScope,
    })
    .optional(),
});
const snapshotSchema = z.object({
  params: flightSearchSchema,
  fetchedAt: timestamp,
  environment: z.enum(["test", "production"]).optional(),
  offers: z.array(offerSchema),
});

const savedShortlistSchema = snapshotSchema.extend({
  params: searchParamsSchema,
  offers: z.array(offerSchema.omit({ checkoutToken: true })).min(1).max(FLIGHT_SHORTLIST_LIMIT),
  savedAt: z.number().finite(),
});

export type SavedShortlist = FlightSearchSnapshot & { id: string; savedAt: number };

function savedShortlistsPrefix(userId: string, organizationId: OrganizationId): string {
  return `flight-analytics:saved-shortlists:v1:${JSON.stringify([userId, organizationId])}:`;
}

function readShortlists(storage: Storage, prefix: string): SavedShortlist[] {
  const entries: SavedShortlist[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = savedShortlistSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        entries.push({ ...parsed.data, id: key.slice(prefix.length) } as SavedShortlist);
      }
    } catch {
      // A corrupt entry should not hide the rest of the saved shortlists.
    }
  }
  return entries.sort((first, second) => second.savedAt - first.savedAt);
}

export function readSavedShortlists(userId: string, organizationId: OrganizationId) {
  try {
    return readShortlists(window.localStorage, savedShortlistsPrefix(userId, organizationId));
  } catch {
    return [];
  }
}

export function saveShortlist(
  userId: string,
  organizationId: OrganizationId,
  snapshot: FlightSearchSnapshot,
): SavedShortlist[] | undefined {
  try {
    const storage = window.localStorage;
    const prefix = savedShortlistsPrefix(userId, organizationId);
    const entry = savedShortlistSchema.parse({ ...snapshot, savedAt: Date.now() });
    const id = crypto.randomUUID();
    const entries = readShortlists(storage, prefix);
    storage.setItem(prefix + id, JSON.stringify(entry));
    return [{ ...entry, id } as SavedShortlist, ...entries];
  } catch {
    return undefined;
  }
}

export function deleteShortlist(
  userId: string,
  organizationId: OrganizationId,
  id: string,
): SavedShortlist[] | undefined {
  try {
    const storage = window.localStorage;
    const prefix = savedShortlistsPrefix(userId, organizationId);
    const entries = readShortlists(storage, prefix).filter((entry) => entry.id !== id);
    storage.removeItem(prefix + id);
    return entries;
  } catch {
    return undefined;
  }
}

export function searchSnapshotKey(userId: string, organizationId: OrganizationId | null): string {
  return `flight-analytics:search-snapshot:v1:${JSON.stringify([userId, organizationId])}`;
}

export function readSearchSnapshot(
  userId: string,
  organizationId: OrganizationId | null,
): FlightSearchSnapshot | undefined {
  try {
    const stored = window.sessionStorage.getItem(searchSnapshotKey(userId, organizationId));
    if (!stored) return;
    const parsed = snapshotSchema.safeParse(JSON.parse(stored));
    // JSON cannot contain explicitly undefined optional offer fields.
    return parsed.success ? (parsed.data as FlightSearchSnapshot) : undefined;
  } catch {
    return undefined;
  }
}

export function saveSearchSnapshot(
  userId: string,
  organizationId: OrganizationId | null,
  snapshot: FlightSearchSnapshot,
): void {
  saveSearchInputs(searchInputsKey(userId, organizationId), snapshot.params);
  try {
    const key = searchSnapshotKey(userId, organizationId);
    // If the replacement exceeds storage quota, avoid restoring an older result.
    window.sessionStorage.removeItem(key);
    const { params, offers, fetchedAt, environment } = snapshot;
    window.sessionStorage.setItem(key, JSON.stringify({ params, offers, fetchedAt, environment }));
  } catch {
    // Storage failures should not affect the live result.
  }
}

export function clearSearchSnapshot(userId: string, organizationId: OrganizationId | null): void {
  try {
    window.sessionStorage.removeItem(searchSnapshotKey(userId, organizationId));
  } catch {
    // Storage may be unavailable in restricted browsers.
  }
}

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
