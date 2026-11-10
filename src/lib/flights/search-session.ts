const LEGACY_STORAGE_KEY = "flight-analytics:search:v1";

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
