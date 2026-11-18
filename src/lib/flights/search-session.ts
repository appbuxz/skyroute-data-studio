import { z } from "zod";
import { flightSearchSchema } from "./search-schema";
import {
  CABIN_CLASSES,
  type FlightSearchParams,
  type FlightSearchSnapshot,
  type OrganizationId,
} from "./types";

const LEGACY_STORAGE_KEY = "flight-analytics:search:v1";

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
const snapshotSchema = z.object({
  params: flightSearchSchema,
  fetchedAt: timestamp,
  offers: z.array(
    segmentSchema.extend({
      id: z.string(),
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
    }),
  ),
});

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
    const { params, offers, fetchedAt } = snapshot;
    window.sessionStorage.setItem(key, JSON.stringify({ params, offers, fetchedAt }));
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
